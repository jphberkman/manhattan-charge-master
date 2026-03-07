import { NextRequest, NextResponse } from "next/server";
import * as XLSX from "xlsx";
import JSZip from "jszip";
import { prisma } from "@/lib/prisma";
import { anthropicCall } from "@/lib/anthropic-fetch";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

// ── Types ─────────────────────────────────────────────────────────────────────

interface NormalizedRow {
  hospitalName: string;
  address: string;
  cptCode: string;
  procedureName: string;
  category: string;
  payerName: string;
  payerType: string;
  priceInCents: number;
  priceType: string;
}

interface ColumnMap {
  hospital_name: number | null;
  address: number | null;
  cpt_code: number | null;
  procedure_name: number | null;
  category: number | null;
  payer_name: number | null;
  payer_type: number | null;
  price: number | null;
  price_type: number | null;
}

interface WidePayerColumn { colIndex: number; payerName: string; payerType: string }

interface FileSchema {
  format: "long" | "wide";
  bestSheet: string;
  headerRow: number;
  dataStartRow: number;
  hospitalSource: "column" | "filename";
  hospitalNameFromFilename: string | null;
  columns: ColumnMap;
  widePayerColumns: WidePayerColumn[];
  notes: string;
}

export interface ValidationSample {
  cptCode: string;
  procedureName: string;
  realPriceLow: number;
  realPriceHigh: number;
  aiEstimateLow: number;
  aiEstimateHigh: number;
  errorPct: number;
  accurate: boolean; // within 30%
}

export interface ValidateResult {
  hospitalsUpserted: number;
  proceduresUpserted: number;
  pricesInserted: number;
  filesProcessed: number;
  validationSamples: ValidationSample[];
  overallAccuracyPct: number;
  avgErrorPct: number;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function normalizePayerType(raw: string): string {
  const v = raw.toLowerCase().trim();
  if (v.includes("cash") || v.includes("self")) return "cash";
  if (v.includes("medicare")) return "medicare";
  if (v.includes("medicaid")) return "medicaid";
  if (v.includes("commercial") || v.includes("private") || v.includes("insurance")) return "commercial";
  return "other";
}

function normalizePriceType(raw: string): string {
  const v = raw.toLowerCase().trim();
  if (v.includes("gross")) return "gross";
  if (v.includes("discounted") || v.includes("discount")) return "discounted";
  if (v.includes("min")) return "min";
  if (v.includes("max")) return "max";
  if (v.includes("negotiated") || v.includes("contract")) return "negotiated";
  return "gross";
}

function parsePrice(raw: string): number {
  const val = parseFloat(raw.replace(/[$,\s]/g, ""));
  return isNaN(val) ? 0 : Math.round(val * 100);
}

// ── Tabular parsers ───────────────────────────────────────────────────────────

interface SheetData { name: string; rows: string[][] }

function parseTabularBuffer(buffer: Buffer, filename: string): SheetData[] {
  const ext = filename.split(".").pop()?.toLowerCase();
  if (ext === "xlsx" || ext === "xls" || ext === "xlsm") {
    const wb = XLSX.read(buffer, { type: "buffer" });
    return wb.SheetNames.map((name) => {
      const raw: unknown[][] = XLSX.utils.sheet_to_json(wb.Sheets[name], { header: 1, defval: "" });
      const rows = raw
        .map((r) => (r as unknown[]).map((c) => String(c ?? "").trim()))
        .filter((r) => r.some((c) => c !== ""));
      return { name, rows };
    });
  }
  const lines = buffer.toString("utf-8").replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n").filter(Boolean);
  const rows: string[][] = lines.map((line) => {
    const cols: string[] = [];
    let cur = "", inQuote = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') { if (inQuote && line[i + 1] === '"') { cur += '"'; i++; } else inQuote = !inQuote; }
      else if (ch === "," && !inQuote) { cols.push(cur.trim()); cur = ""; }
      else cur += ch;
    }
    cols.push(cur.trim());
    return cols;
  });
  return [{ name: "Sheet1", rows }];
}

async function detectSchema(sheets: SheetData[], filename: string): Promise<FileSchema> {
  const sample = sheets.slice(0, 3).map((s) => ({ sheet: s.name, rows: s.rows.slice(0, 20) }));
  const text = await anthropicCall({
    max_tokens: 1024,
    messages: [{ role: "user", content: `You are a data engineering expert specializing in hospital price transparency files.
Analyze this spreadsheet and return a JSON schema so I can parse it correctly.
Filename: "${filename}"
Sheet data (first 20 rows per sheet):
${JSON.stringify(sample, null, 2)}
Return ONLY valid JSON (no markdown):
{"format":"long"|"wide","bestSheet":"<name>","headerRow":<int>,"dataStartRow":<int>,"hospitalSource":"column"|"filename","hospitalNameFromFilename":<string|null>,"columns":{"hospital_name":<int|null>,"address":<int|null>,"cpt_code":<int|null>,"procedure_name":<int|null>,"category":<int|null>,"payer_name":<int|null>,"payer_type":<int|null>,"price":<int|null>,"price_type":<int|null>},"widePayerColumns":[{"colIndex":<int>,"payerName":"<str>","payerType":"cash|commercial|medicare|medicaid|other"}],"notes":"<str>"}` }],
  });
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) throw new Error("Could not parse AI schema response");
  return JSON.parse(match[0]) as FileSchema;
}

function extractRows(sheet: SheetData, schema: FileSchema, filename: string): NormalizedRow[] {
  const { columns: c, format, dataStartRow, widePayerColumns } = schema;
  const get = (row: string[], idx: number | null) => idx !== null && idx >= 0 ? (row[idx] ?? "").trim() : "";
  const fallback = schema.hospitalSource === "filename" && schema.hospitalNameFromFilename
    ? schema.hospitalNameFromFilename
    : filename.replace(/\.[^.]+$/, "").replace(/[_-]/g, " ");
  const results: NormalizedRow[] = [];

  for (const row of sheet.rows.slice(dataStartRow)) {
    if (row.every((cell) => cell === "")) continue;
    const hospitalName = get(row, c.hospital_name) || fallback;
    const cptCode = get(row, c.cpt_code).replace(/\s/g, "");
    const procedureName = get(row, c.procedure_name) || cptCode;
    if (!cptCode && !procedureName) continue;

    if (format === "wide") {
      for (const payerCol of widePayerColumns) {
        const priceInCents = parsePrice(get(row, payerCol.colIndex));
        if (priceInCents <= 0) continue;
        results.push({ hospitalName, address: get(row, c.address) || "Manhattan, NY", cptCode: cptCode || procedureName.slice(0, 10), procedureName, category: get(row, c.category) || "General", payerName: payerCol.payerName, payerType: normalizePayerType(payerCol.payerType || payerCol.payerName), priceInCents, priceType: normalizePriceType(payerCol.payerName) });
      }
    } else {
      const priceInCents = parsePrice(get(row, c.price));
      if (priceInCents <= 0) continue;
      const payerNameRaw = get(row, c.payer_name) || "Standard";
      results.push({ hospitalName, address: get(row, c.address) || "Manhattan, NY", cptCode: cptCode || procedureName.slice(0, 10), procedureName, category: get(row, c.category) || "General", payerName: payerNameRaw, payerType: normalizePayerType(get(row, c.payer_type) || payerNameRaw), priceInCents, priceType: normalizePriceType(get(row, c.price_type)) });
    }
  }
  return results;
}

// ── JSON parser ───────────────────────────────────────────────────────────────

async function parseJsonBuffer(buffer: Buffer, filename: string): Promise<NormalizedRow[]> {
  let data: unknown;
  try { data = JSON.parse(buffer.toString("utf-8")); } catch { return []; }

  // CMS 2.0 standard format
  if (data && typeof data === "object" && !Array.isArray(data)) {
    const cms = data as Record<string, unknown>;
    if (Array.isArray(cms.standard_charge_information)) {
      const hospitalName = String(cms.hospital_name ?? cms.name ?? filename.replace(/\.[^.]+$/, ""));
      const rows: NormalizedRow[] = [];
      for (const item of cms.standard_charge_information as Record<string, unknown>[]) {
        const codes = (item.codes as Array<{ code: string; type: string }>) ?? [];
        const cptCode = codes.find((c) => c.type?.toUpperCase() === "CPT")?.code ?? "";
        const procedureName = String(item.description ?? cptCode);
        for (const charge of (item.standard_charges as Record<string, unknown>[]) ?? []) {
          if (charge.gross_charge) rows.push({ hospitalName, address: "Manhattan, NY", cptCode, procedureName, category: "General", payerName: "Gross", payerType: "gross", priceInCents: Math.round(Number(charge.gross_charge) * 100), priceType: "gross" });
          if (charge.discounted_cash) rows.push({ hospitalName, address: "Manhattan, NY", cptCode, procedureName, category: "General", payerName: "Cash", payerType: "cash", priceInCents: Math.round(Number(charge.discounted_cash) * 100), priceType: "discounted" });
          for (const payer of (charge.payers_information as Record<string, unknown>[]) ?? []) {
            const price = payer.standard_charge_dollar ?? payer.negotiated_rate;
            if (!price) continue;
            rows.push({ hospitalName, address: "Manhattan, NY", cptCode, procedureName, category: "General", payerName: String(payer.payer_name ?? "Unknown"), payerType: normalizePayerType(String(payer.payer_name ?? "")), priceInCents: Math.round(Number(price) * 100), priceType: normalizePriceType(String(payer.billing_class ?? "negotiated")) });
          }
        }
      }
      return rows.filter((r) => r.priceInCents > 0 && r.cptCode);
    }
  }

  // Unknown JSON format — use AI to detect field mapping
  const items = Array.isArray(data) ? (data as Record<string, unknown>[]) : [];
  if (items.length === 0) return [];
  const aiText = await anthropicCall({
    max_tokens: 512,
    messages: [{ role: "user", content: `JSON price file sample (first 5 entries):\n${JSON.stringify(items.slice(0, 5), null, 2)}\n\nReturn ONLY JSON mapping field names to roles (null if absent):\n{"cptCode":"<field|null>","procedureName":"<field|null>","hospitalName":"<field|null>","price":"<field|null>","payerName":"<field|null>","payerType":"<field|null>","priceType":"<field|null>"}` }],
  });
  const mapMatch = aiText.match(/\{[\s\S]*\}/);
  if (!mapMatch) return [];
  const fieldMap: Record<string, string | null> = JSON.parse(mapMatch[0]);
  const get = (obj: Record<string, unknown>, key: string | null) => key ? String(obj[key] ?? "") : "";
  const fallback = filename.replace(/\.[^.]+$/, "").replace(/[_-]/g, " ");
  return items.flatMap((item): NormalizedRow[] => {
    const priceInCents = parsePrice(get(item, fieldMap.price));
    if (priceInCents <= 0) return [];
    const cptCode = get(item, fieldMap.cptCode).replace(/\s/g, "");
    const procedureName = get(item, fieldMap.procedureName) || cptCode;
    if (!cptCode && !procedureName) return [];
    return [{ hospitalName: get(item, fieldMap.hospitalName) || fallback, address: "Manhattan, NY", cptCode: cptCode || procedureName.slice(0, 10), procedureName, category: "General", payerName: get(item, fieldMap.payerName) || "Standard", payerType: normalizePayerType(get(item, fieldMap.payerType) || get(item, fieldMap.payerName)), priceInCents, priceType: normalizePriceType(get(item, fieldMap.priceType)) }];
  });
}

// ── Parse any single file ─────────────────────────────────────────────────────

async function parseFile(buffer: Buffer, filename: string): Promise<NormalizedRow[]> {
  if (/\.json$/i.test(filename)) return parseJsonBuffer(buffer, filename);
  const sheets = parseTabularBuffer(buffer, filename);
  if (sheets.length === 0 || sheets.every((s) => s.rows.length < 2)) return [];
  const schema = await detectSchema(sheets, filename);
  const sheet = sheets.find((s) => s.name === schema.bestSheet) ?? sheets[0];
  return extractRows(sheet, schema, filename);
}

// ── Save to DB ────────────────────────────────────────────────────────────────

async function saveRows(rows: NormalizedRow[]) {
  let hospitalsUpserted = 0, proceduresUpserted = 0, pricesInserted = 0;
  const hospitalCache = new Map<string, string>();
  const procedureCache = new Map<string, string>();

  for (const row of rows) {
    const hKey = `${row.hospitalName}__${row.address}`;
    if (!hospitalCache.has(hKey)) {
      const h = await prisma.hospital.upsert({ where: { id: hKey }, create: { id: hKey, name: row.hospitalName, address: row.address, borough: "Manhattan", sourceFile: "validated-upload", lastSeeded: new Date() }, update: { lastSeeded: new Date() }, select: { id: true } });
      hospitalCache.set(hKey, h.id);
      hospitalsUpserted++;
    }
    if (!procedureCache.has(row.cptCode)) {
      const p = await prisma.procedure.upsert({ where: { cptCode: row.cptCode }, create: { cptCode: row.cptCode, name: row.procedureName, category: row.category, description: "" }, update: {}, select: { id: true } });
      procedureCache.set(row.cptCode, p.id);
      proceduresUpserted++;
    }
    await prisma.priceEntry.create({ data: { hospitalId: hospitalCache.get(hKey)!, procedureId: procedureCache.get(row.cptCode)!, payerName: row.payerName, payerType: row.payerType, priceInCents: row.priceInCents, priceType: row.priceType, rawCode: row.cptCode } });
    pricesInserted++;
  }
  return { hospitalsUpserted, proceduresUpserted, pricesInserted };
}

// ── AI accuracy validation ────────────────────────────────────────────────────

async function validateSample(rows: NormalizedRow[]): Promise<ValidationSample[]> {
  const byCode = new Map<string, NormalizedRow[]>();
  for (const row of rows) {
    if (!row.cptCode) continue;
    if (!byCode.has(row.cptCode)) byCode.set(row.cptCode, []);
    byCode.get(row.cptCode)!.push(row);
  }

  // Only sample CPTs with meaningful prices (>$500)
  const candidates = [...byCode.entries()]
    .filter(([, rs]) => rs.some((r) => (r.payerType === "commercial" || r.payerType === "cash") && r.priceInCents > 50000))
    .slice(0, 12);

  if (candidates.length === 0) return [];

  const items = candidates.map(([code, rs], i) => {
    const comPrices = rs.filter((r) => r.payerType === "commercial" && r.priceInCents > 0).map((r) => r.priceInCents / 100);
    const cashPrices = rs.filter((r) => r.payerType === "cash" && r.priceInCents > 0).map((r) => r.priceInCents / 100);
    return { index: i, cptCode: code, procedureName: rs[0].procedureName, realCommercial: comPrices.length ? [Math.min(...comPrices), Math.max(...comPrices)] : null, realCash: cashPrices.length ? [Math.min(...cashPrices), Math.max(...cashPrices)] : null };
  });

  const aiText = await anthropicCall({
    max_tokens: 1500,
    cacheSystemPrompt: true,
    system: `You are a healthcare pricing expert with precise knowledge of Manhattan hospital negotiated rates for 2024-2025. Return ONLY valid JSON.`,
    messages: [{ role: "user", content: `Estimate typical Manhattan hospital price ranges for these procedures:\n${items.map((it) => `${it.index}: CPT ${it.cptCode} — ${it.procedureName}`).join("\n")}\n\nReturn JSON array:\n[{"index":0,"estimatedCommercialLow":<int USD>,"estimatedCommercialHigh":<int USD>,"estimatedCashLow":<int USD>,"estimatedCashHigh":<int USD>}]\n\nUse realistic 2024-2025 Manhattan commercial negotiated rates (full episode of care).` }],
  });

  const match = aiText.match(/\[[\s\S]*\]/);
  if (!match) return [];

  const estimates: Array<{ index: number; estimatedCommercialLow: number; estimatedCommercialHigh: number; estimatedCashLow: number; estimatedCashHigh: number }> = JSON.parse(match[0]);

  return estimates.flatMap((est): ValidationSample[] => {
    const item = items[est.index];
    if (!item) return [];
    const realRange = item.realCommercial ?? item.realCash;
    if (!realRange) return [];
    const aiLow = item.realCommercial ? est.estimatedCommercialLow : est.estimatedCashLow;
    const aiHigh = item.realCommercial ? est.estimatedCommercialHigh : est.estimatedCashHigh;
    const realMid = (realRange[0] + realRange[1]) / 2;
    const aiMid = (aiLow + aiHigh) / 2;
    const errorPct = realMid > 0 ? Math.round(Math.abs(realMid - aiMid) / realMid * 100) : 100;
    return [{ cptCode: item.cptCode, procedureName: item.procedureName, realPriceLow: Math.round(realRange[0]), realPriceHigh: Math.round(realRange[1]), aiEstimateLow: Math.round(aiLow), aiEstimateHigh: Math.round(aiHigh), errorPct, accurate: errorPct <= 30 }];
  });
}

// ── POST /api/validate ────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  try {
    const filename = req.headers.get("x-filename") ?? "upload.csv";
    if (!/\.(csv|xlsx|xls|xlsm|json|zip)$/i.test(filename)) {
      return NextResponse.json({ error: "Unsupported file type. Upload CSV, Excel, JSON, or ZIP." }, { status: 400 });
    }
    const arrayBuffer = await req.arrayBuffer();
    if (!arrayBuffer || arrayBuffer.byteLength === 0) return NextResponse.json({ error: "No file provided" }, { status: 400 });
    const buffer = Buffer.from(arrayBuffer);
    let allRows: NormalizedRow[] = [];
    let filesProcessed = 0;

    if (/\.zip$/i.test(filename)) {
      const zip = await JSZip.loadAsync(buffer);
      const entries = Object.values(zip.files).filter((e) => !e.dir && /\.(csv|xlsx|xls|xlsm|json)$/i.test(e.name));
      if (entries.length === 0) return NextResponse.json({ error: "ZIP contains no CSV, Excel, or JSON files." }, { status: 400 });
      for (const entry of entries) {
        const rows = await parseFile(Buffer.from(await entry.async("arraybuffer")), entry.name.split("/").pop()!);
        allRows = allRows.concat(rows);
        filesProcessed++;
      }
    } else {
      allRows = await parseFile(buffer, filename);
      filesProcessed = 1;
    }

    if (allRows.length === 0) return NextResponse.json({ error: "No valid price rows found in the file(s)." }, { status: 400 });

    const importStats = await saveRows(allRows);
    const validationSamples = await validateSample(allRows);
    const accurateCount = validationSamples.filter((s) => s.accurate).length;

    const result: ValidateResult = {
      ...importStats,
      filesProcessed,
      validationSamples,
      overallAccuracyPct: validationSamples.length > 0 ? Math.round((accurateCount / validationSamples.length) * 100) : 0,
      avgErrorPct: validationSamples.length > 0 ? Math.round(validationSamples.reduce((s, v) => s + v.errorPct, 0) / validationSamples.length) : 0,
    };

    return NextResponse.json(result);
  } catch (err) {
    console.error("Validate error:", err);
    return NextResponse.json({ error: err instanceof Error ? err.message : "Validation failed" }, { status: 500 });
  }
}
