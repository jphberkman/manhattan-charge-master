import { NextRequest, NextResponse } from "next/server";
import * as XLSX from "xlsx";
import JSZip from "jszip";
import { prisma } from "@/lib/prisma";
import { anthropicCall } from "@/lib/anthropic-fetch";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
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

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
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

function parseCsvLine(line: string): string[] {
  const cols: string[] = [];
  let cur = "", inQuote = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuote && line[i + 1] === '"') { cur += '"'; i++; }
      else inQuote = !inQuote;
    } else if (ch === "," && !inQuote) { cols.push(cur.trim()); cur = ""; }
    else cur += ch;
  }
  cols.push(cur.trim());
  return cols;
}

// ---------------------------------------------------------------------------
// Stream lines from a ReadableStream — works for any file size
// ---------------------------------------------------------------------------
async function* streamLines(body: ReadableStream<Uint8Array>): AsyncGenerator<string> {
  const reader = body.getReader();
  const decoder = new TextDecoder("utf-8");
  let buffer = "";
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        if (buffer.trim()) yield buffer;
        break;
      }
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split(/\r?\n/);
      buffer = lines.pop() ?? "";
      for (const line of lines) {
        if (line.trim()) yield line;
      }
    }
  } finally {
    reader.releaseLock();
  }
}

// ---------------------------------------------------------------------------
// AI schema detection from a small sample of rows
// ---------------------------------------------------------------------------
async function detectSchemaFromSample(sampleRows: string[][], filename: string): Promise<FileSchema> {
  const sample = [{ sheet: "Sheet1", rows: sampleRows.slice(0, 25) }];
  const text = await anthropicCall({
    max_tokens: 1024,
    cacheSystemPrompt: true,
    system: `You are a data engineering expert specializing in hospital price transparency files. Return ONLY valid JSON.`,
    messages: [{ role: "user", content: `Analyze this hospital price file and return a JSON schema for parsing it.

Filename: "${filename}"
Sample rows (first 25):
${JSON.stringify(sample, null, 2)}

Common formats:
- "long": one row per price entry (procedure + payer + price per row)
- "wide": one row per procedure, multiple payer columns (must unpivot)
- CMS standard columns: "description", "code | 1", "standard_charge | gross", "standard_charge | negotiated_dollar"

Return ONLY this JSON (no markdown):
{"format":"long"|"wide","bestSheet":"Sheet1","headerRow":<int>,"dataStartRow":<int>,"hospitalSource":"column"|"filename","hospitalNameFromFilename":<string|null>,"columns":{"hospital_name":<int|null>,"address":<int|null>,"cpt_code":<int|null>,"procedure_name":<int|null>,"category":<int|null>,"payer_name":<int|null>,"payer_type":<int|null>,"price":<int|null>,"price_type":<int|null>},"widePayerColumns":[{"colIndex":<int>,"payerName":"<str>","payerType":"cash|commercial|medicare|medicaid|other"}],"notes":"<str>"}` }],
  });
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) throw new Error("Could not parse AI schema response");
  return JSON.parse(match[0]) as FileSchema;
}

// ---------------------------------------------------------------------------
// Apply schema to one row of CSV columns
// ---------------------------------------------------------------------------
function applySchema(cols: string[], schema: FileSchema, fallback: string): NormalizedRow[] {
  const { columns: c, format, widePayerColumns } = schema;
  const get = (idx: number | null) => idx !== null && idx >= 0 ? (cols[idx] ?? "").trim() : "";

  const hospitalName = get(c.hospital_name) || fallback;
  const address = get(c.address) || "Manhattan, NY";
  const cptCode = get(c.cpt_code).replace(/\s/g, "");
  const procedureName = get(c.procedure_name) || cptCode;
  const category = get(c.category) || "General";

  if (!cptCode && !procedureName) return [];

  if (format === "wide") {
    return widePayerColumns.flatMap((payerCol): NormalizedRow[] => {
      const priceInCents = parsePrice(get(payerCol.colIndex));
      if (priceInCents <= 0) return [];
      return [{ hospitalName, address, cptCode: cptCode || procedureName.slice(0, 10), procedureName, category, payerName: payerCol.payerName, payerType: normalizePayerType(payerCol.payerType || payerCol.payerName), priceInCents, priceType: normalizePriceType(payerCol.payerName) }];
    });
  }

  const priceInCents = parsePrice(get(c.price));
  if (priceInCents <= 0) return [];
  const payerNameRaw = get(c.payer_name) || "Standard";
  return [{ hospitalName, address, cptCode: cptCode || procedureName.slice(0, 10), procedureName, category, payerName: payerNameRaw, payerType: normalizePayerType(get(c.payer_type) || payerNameRaw), priceInCents, priceType: normalizePriceType(get(c.price_type)) }];
}

// ---------------------------------------------------------------------------
// Batch upsert to DB
// ---------------------------------------------------------------------------
async function flushBatch(
  batch: NormalizedRow[],
  sourceFile: string,
  hospitalCache: Map<string, string>,
  procedureCache: Map<string, string>
): Promise<{ hospitalsUpserted: number; proceduresUpserted: number; pricesInserted: number }> {
  let hospitalsUpserted = 0, proceduresUpserted = 0;

  // Upsert hospitals and procedures first
  for (const row of batch) {
    const hKey = `${row.hospitalName}__${row.address}`;
    if (!hospitalCache.has(hKey)) {
      const h = await prisma.hospital.upsert({
        where: { id: hKey },
        create: { id: hKey, name: row.hospitalName, address: row.address, borough: "Manhattan", sourceFile, lastSeeded: new Date() },
        update: { lastSeeded: new Date() },
        select: { id: true },
      });
      hospitalCache.set(hKey, h.id);
      hospitalsUpserted++;
    }
    if (!procedureCache.has(row.cptCode)) {
      const p = await prisma.procedure.upsert({
        where: { cptCode: row.cptCode },
        create: { cptCode: row.cptCode, name: row.procedureName, category: row.category, description: "" },
        update: {},
        select: { id: true },
      });
      procedureCache.set(row.cptCode, p.id);
      proceduresUpserted++;
    }
  }

  // Batch insert prices
  await prisma.priceEntry.createMany({
    data: batch.map((row) => ({
      hospitalId: hospitalCache.get(`${row.hospitalName}__${row.address}`)!,
      procedureId: procedureCache.get(row.cptCode)!,
      payerName: row.payerName,
      payerType: row.payerType,
      priceInCents: row.priceInCents,
      priceType: row.priceType,
      rawCode: row.cptCode,
    })),
    skipDuplicates: true,
  });

  return { hospitalsUpserted, proceduresUpserted, pricesInserted: batch.length };
}

// ---------------------------------------------------------------------------
// Streaming JSON — works for CMS 2.0 format and flat array format, any size
// ---------------------------------------------------------------------------

/**
 * Yields complete top-level objects from a JSON array.
 * Uses a character-level state machine so inStr/escaped state persists across
 * lines and the array-start [ is detected even when it's on a different line
 * from the key name.
 */
async function* streamJsonObjects(lines: AsyncGenerator<string>): AsyncGenerator<{ obj: Record<string, unknown>; hospitalName: string }> {
  // phase:
  //   "header"     — scanning for hospital name + array trigger key
  //   "seek_array" — found the key (or file is a flat array), looking for [
  //   "in_array"   — inside the data array, collecting objects
  let phase: "header" | "seek_array" | "in_array" = "header";
  let hospitalName = "";

  // Character-level state (persists across lines)
  let inStr = false;
  let escaped = false;
  let depth = 0;
  let currentChars: string[] = [];

  for await (const line of lines) {
    // Extract hospital name from header fields before we reach the array
    if (!hospitalName) {
      const m = line.match(/"(?:hospital_name|name)"\s*:\s*"([^"]+)"/);
      if (m) hospitalName = m[1];
    }

    // Detect transition from header → seek_array
    if (phase === "header") {
      if (
        line.includes('"standard_charge_information"') ||
        line.includes('"standard_charges"') ||
        line.trim() === "["
      ) {
        phase = "seek_array";
        // Fall through — process this line char-by-char below
      } else {
        continue;
      }
    }

    // Process every character on this line
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];

      if (phase === "seek_array") {
        if (ch === "[") {
          phase = "in_array";
          depth = 0;
          currentChars = [];
        }
        continue;
      }

      // ── phase === "in_array" ──────────────────────────────────────────────

      if (escaped) {
        escaped = false;
        if (depth > 0) currentChars.push(ch);
        continue;
      }

      if (ch === "\\" && inStr) {
        escaped = true;
        if (depth > 0) currentChars.push(ch);
        continue;
      }

      if (ch === '"') {
        inStr = !inStr;
        if (depth > 0) currentChars.push(ch);
        continue;
      }

      if (inStr) {
        if (depth > 0) currentChars.push(ch);
        continue;
      }

      // Outside strings:
      if (ch === "{") {
        if (depth === 0) currentChars = ["{"];
        else currentChars.push(ch);
        depth++;
      } else if (ch === "}") {
        depth--;
        if (depth >= 0) currentChars.push(ch);
        if (depth === 0 && currentChars.length > 0) {
          try {
            const obj = JSON.parse(currentChars.join("")) as Record<string, unknown>;
            yield { obj, hospitalName };
          } catch { /* skip malformed */ }
          currentChars = [];
        }
      } else if (ch === "]" && depth === 0) {
        return; // end of array
      } else {
        if (depth > 0) currentChars.push(ch);
      }
    }

    // Preserve newlines within multi-line objects for valid JSON reconstruction
    if (phase === "in_array" && depth > 0) {
      currentChars.push("\n");
    }
  }
}

function cmsObjectToRows(obj: Record<string, unknown>, hospitalName: string): NormalizedRow[] {
  const codes = (obj.codes as Array<{ code: string; type: string }>) ?? [];
  const cptCode = codes.find((c) => c.type?.toUpperCase() === "CPT")?.code ?? "";
  const procedureName = String(obj.description ?? cptCode);
  if (!cptCode && !procedureName) return [];

  const rows: NormalizedRow[] = [];
  for (const charge of (obj.standard_charges as Record<string, unknown>[]) ?? []) {
    if (charge.gross_charge) {
      rows.push({ hospitalName, address: "Manhattan, NY", cptCode, procedureName, category: "General", payerName: "Gross", payerType: "gross", priceInCents: Math.round(Number(charge.gross_charge) * 100), priceType: "gross" });
    }
    if (charge.discounted_cash) {
      rows.push({ hospitalName, address: "Manhattan, NY", cptCode, procedureName, category: "General", payerName: "Cash", payerType: "cash", priceInCents: Math.round(Number(charge.discounted_cash) * 100), priceType: "discounted" });
    }
    for (const payer of (charge.payers_information as Record<string, unknown>[]) ?? []) {
      const price = payer.standard_charge_dollar ?? payer.negotiated_rate ?? payer.price;
      if (!price) continue;
      rows.push({ hospitalName, address: "Manhattan, NY", cptCode, procedureName, category: "General", payerName: String(payer.payer_name ?? "Unknown"), payerType: normalizePayerType(String(payer.payer_name ?? "")), priceInCents: Math.round(Number(price) * 100), priceType: normalizePriceType(String(payer.billing_class ?? "negotiated")) });
    }
  }
  return rows.filter((r) => r.priceInCents > 0);
}

function flatJsonObjectToRows(obj: Record<string, unknown>, fallbackHospital: string): NormalizedRow[] {
  // Generic flat object: try common field names
  const cptCode = String(obj.cpt_code ?? obj.cptCode ?? obj.code ?? obj.procedure_code ?? "").replace(/\s/g, "");
  const procedureName = String(obj.procedure_name ?? obj.description ?? obj.name ?? cptCode);
  if (!cptCode && !procedureName) return [];
  const priceRaw = String(obj.price ?? obj.standard_charge ?? obj.amount ?? obj.charge ?? "");
  const priceInCents = parsePrice(priceRaw);
  if (priceInCents <= 0) return [];
  const hospitalName = String(obj.hospital_name ?? obj.hospital ?? fallbackHospital);
  const payerRaw = String(obj.payer_name ?? obj.payer ?? obj.insurance ?? "Standard");
  return [{ hospitalName, address: "Manhattan, NY", cptCode: cptCode || procedureName.slice(0, 10), procedureName, category: String(obj.category ?? "General"), payerName: payerRaw, payerType: normalizePayerType(String(obj.payer_type ?? payerRaw)), priceInCents, priceType: normalizePriceType(String(obj.price_type ?? obj.charge_type ?? "")) }];
}

// ---------------------------------------------------------------------------
// In-memory path for XLSX (must be < 200MB)
// ---------------------------------------------------------------------------
async function processXlsx(buffer: Buffer, filename: string) {
  const wb = XLSX.read(buffer, { type: "buffer" });
  const sheets = wb.SheetNames.map((name) => {
    const raw: unknown[][] = XLSX.utils.sheet_to_json(wb.Sheets[name], { header: 1, defval: "" });
    const rows = raw
      .map((r) => (r as unknown[]).map((c) => String(c ?? "").trim()))
      .filter((r) => r.some((c) => c !== ""));
    return { name, rows };
  });

  if (sheets.length === 0 || sheets.every((s) => s.rows.length < 2)) {
    throw new Error("File appears to be empty");
  }

  const sample = sheets.slice(0, 3).map((s) => ({ sheet: s.name, rows: s.rows.slice(0, 20) }));
  const schemaText = await anthropicCall({
    max_tokens: 1024,
    messages: [{ role: "user", content: `Hospital price transparency Excel file. Filename: "${filename}". Sample: ${JSON.stringify(sample, null, 2)}\n\nReturn ONLY JSON schema:\n{"format":"long"|"wide","bestSheet":"<name>","headerRow":<int>,"dataStartRow":<int>,"hospitalSource":"column"|"filename","hospitalNameFromFilename":<string|null>,"columns":{"hospital_name":<int|null>,"address":<int|null>,"cpt_code":<int|null>,"procedure_name":<int|null>,"category":<int|null>,"payer_name":<int|null>,"payer_type":<int|null>,"price":<int|null>,"price_type":<int|null>},"widePayerColumns":[{"colIndex":<int>,"payerName":"<str>","payerType":"cash|commercial|medicare|medicaid|other"}],"notes":"<str>"}` }],
  });
  const match = schemaText.match(/\{[\s\S]*\}/);
  if (!match) throw new Error("Could not parse AI schema response");
  const schema = JSON.parse(match[0]) as FileSchema;

  const targetSheet = sheets.find((s) => s.name === schema.bestSheet) ?? sheets[0];
  const fallback = schema.hospitalSource === "filename" && schema.hospitalNameFromFilename
    ? schema.hospitalNameFromFilename
    : filename.replace(/\.[^.]+$/, "").replace(/[_-]/g, " ");

  const allRows: NormalizedRow[] = [];
  for (const cols of targetSheet.rows.slice(schema.dataStartRow)) {
    if (cols.every((c) => c === "")) continue;
    allRows.push(...applySchema(cols, schema, fallback));
  }

  if (allRows.length === 0) throw new Error("No valid price rows found after parsing.");

  const hospitalCache = new Map<string, string>();
  const procedureCache = new Map<string, string>();
  let hospitalsUpserted = 0, proceduresUpserted = 0, pricesInserted = 0;

  for (let i = 0; i < allRows.length; i += 500) {
    const stats = await flushBatch(allRows.slice(i, i + 500), filename, hospitalCache, procedureCache);
    hospitalsUpserted += stats.hospitalsUpserted;
    proceduresUpserted += stats.proceduresUpserted;
    pricesInserted += stats.pricesInserted;
  }

  return { hospitalsUpserted, proceduresUpserted, pricesInserted, schemaDetected: schema };
}

// ---------------------------------------------------------------------------
// POST /api/upload
// ---------------------------------------------------------------------------
export async function POST(req: NextRequest) {
  try {
    const filename = req.headers.get("x-filename") ?? "upload.csv";
    const ext = filename.split(".").pop()?.toLowerCase();

    if (!req.body) return NextResponse.json({ error: "No file provided" }, { status: 400 });

    // ── ZIP: extract and process each file inside ───────────────────────────
    if (ext === "zip") {
      const buffer = Buffer.from(await req.arrayBuffer());
      const zip = await JSZip.loadAsync(buffer);
      const entries = Object.values(zip.files).filter(
        (e) => !e.dir && /\.(csv|xlsx|xls|xlsm|json)$/i.test(e.name)
      );
      if (entries.length === 0) return NextResponse.json({ error: "ZIP contains no CSV, Excel, or JSON files." }, { status: 400 });

      let hospitalsUpserted = 0, proceduresUpserted = 0, pricesInserted = 0;
      for (const entry of entries) {
        const entryBuffer = Buffer.from(await entry.async("arraybuffer"));
        const entryName = entry.name.split("/").pop()!;
        // Re-invoke this endpoint logic by faking a new request isn't practical,
        // so inline the XLSX/JSON/CSV handling per entry:
        const entryExt = entryName.split(".").pop()?.toLowerCase();
        if (entryExt === "xlsx" || entryExt === "xls" || entryExt === "xlsm") {
          const result = await processXlsx(entryBuffer, entryName);
          hospitalsUpserted += result.hospitalsUpserted;
          proceduresUpserted += result.proceduresUpserted;
          pricesInserted += result.pricesInserted;
        } else if (entryExt === "json") {
          const { Readable } = await import("stream");
          const nodeStream = Readable.from([entryBuffer]);
          const webStream = new ReadableStream<Uint8Array>({
            start(controller) {
              nodeStream.on("data", (chunk) => controller.enqueue(chunk instanceof Buffer ? chunk : Buffer.from(chunk)));
              nodeStream.on("end", () => controller.close());
              nodeStream.on("error", (e) => controller.error(e));
            },
          });
          const hCache = new Map<string, string>(), pCache = new Map<string, string>();
          let batch: NormalizedRow[] = [];
          const fallback = entryName.replace(/\.[^.]+$/, "").replace(/[_-]/g, " ");
          let isCms = false, detectedFormat = false;
          for await (const { obj, hospitalName } of streamJsonObjects(streamLines(webStream))) {
            if (!detectedFormat) { isCms = "standard_charges" in obj || "codes" in obj; detectedFormat = true; }
            batch.push(...(isCms ? cmsObjectToRows(obj, hospitalName || fallback) : flatJsonObjectToRows(obj, fallback)));
            if (batch.length >= 5000) {
              const s = await flushBatch(batch, entryName, hCache, pCache);
              hospitalsUpserted += s.hospitalsUpserted; proceduresUpserted += s.proceduresUpserted; pricesInserted += s.pricesInserted;
              batch = [];
            }
          }
          if (batch.length > 0) {
            const s = await flushBatch(batch, entryName, hCache, pCache);
            hospitalsUpserted += s.hospitalsUpserted; proceduresUpserted += s.proceduresUpserted; pricesInserted += s.pricesInserted;
          }
        } else {
          // CSV inside ZIP — parse in memory (ZIPs compress well so this is usually small)
          const sheets = [{ name: "Sheet1", rows: entryBuffer.toString("utf-8").replace(/\r\n/g, "\n").split("\n").filter(Boolean).map(parseCsvLine) }];
          const schema = await detectSchemaFromSample(sheets[0].rows.slice(0, 50), entryName);
          const fallback = schema.hospitalNameFromFilename ?? entryName.replace(/\.[^.]+$/, "").replace(/[_-]/g, " ");
          const hCache = new Map<string, string>(), pCache = new Map<string, string>();
          let batch: NormalizedRow[] = [];
          for (const cols of sheets[0].rows.slice(schema.dataStartRow)) {
            if (cols.every((c) => c === "")) continue;
            batch.push(...applySchema(cols, schema, fallback));
            if (batch.length >= 5000) {
              const s = await flushBatch(batch, entryName, hCache, pCache);
              hospitalsUpserted += s.hospitalsUpserted; proceduresUpserted += s.proceduresUpserted; pricesInserted += s.pricesInserted;
              batch = [];
            }
          }
          if (batch.length > 0) {
            const s = await flushBatch(batch, entryName, hCache, pCache);
            hospitalsUpserted += s.hospitalsUpserted; proceduresUpserted += s.proceduresUpserted; pricesInserted += s.pricesInserted;
          }
        }
      }
      return NextResponse.json({ hospitalsUpserted, proceduresUpserted, pricesInserted, schemaDetected: { notes: `Processed ${entries.length} file(s) from ZIP` } });
    }

    // ── JSON: fully streaming — works for any size ──────────────────────────
    if (ext === "json") {
      const fallback = filename.replace(/\.[^.]+$/, "").replace(/[_-]/g, " ");
      const hospitalCache = new Map<string, string>();
      const procedureCache = new Map<string, string>();
      let hospitalsUpserted = 0, proceduresUpserted = 0, pricesInserted = 0;
      let isCms = false, detectedFormat = false;
      let batch: NormalizedRow[] = [];

      for await (const { obj, hospitalName } of streamJsonObjects(streamLines(req.body))) {
        if (!detectedFormat) {
          isCms = "standard_charges" in obj || "codes" in obj;
          detectedFormat = true;
        }
        const rows = isCms
          ? cmsObjectToRows(obj, hospitalName || fallback)
          : flatJsonObjectToRows(obj, fallback);
        batch.push(...rows);

        if (batch.length >= 5000) {
          const stats = await flushBatch(batch, filename, hospitalCache, procedureCache);
          hospitalsUpserted += stats.hospitalsUpserted;
          proceduresUpserted += stats.proceduresUpserted;
          pricesInserted += stats.pricesInserted;
          batch = [];
        }
      }

      if (batch.length > 0) {
        const stats = await flushBatch(batch, filename, hospitalCache, procedureCache);
        hospitalsUpserted += stats.hospitalsUpserted;
        proceduresUpserted += stats.proceduresUpserted;
        pricesInserted += stats.pricesInserted;
      }

      if (pricesInserted === 0) return NextResponse.json({ error: "No valid price rows found in JSON file." }, { status: 400 });
      return NextResponse.json({ hospitalsUpserted, proceduresUpserted, pricesInserted, schemaDetected: { notes: isCms ? "CMS 2.0 standard format detected" : "Flat array format detected" } });
    }

    // ── XLSX: load into memory ──────────────────────────────────────────────
    if (ext === "xlsx" || ext === "xls" || ext === "xlsm") {
      const buffer = Buffer.from(await req.arrayBuffer());
      const result = await processXlsx(buffer, filename);
      return NextResponse.json(result);
    }

    // ── CSV: fully streaming — works for any file size ──────────────────────
    const fallback = filename.replace(/\.[^.]+$/, "").replace(/[_-]/g, " ");

    // Step 1: collect first 50 lines for AI schema detection
    const sampleRows: string[][] = [];
    const lineGen = streamLines(req.body);
    for await (const line of lineGen) {
      sampleRows.push(parseCsvLine(line));
      if (sampleRows.length >= 50) break;
    }

    if (sampleRows.length < 2) return NextResponse.json({ error: "File appears to be empty" }, { status: 400 });

    const schema = await detectSchemaFromSample(sampleRows, filename);

    // Step 2: process all remaining lines in batches of 500
    const hospitalCache = new Map<string, string>();
    const procedureCache = new Map<string, string>();
    let hospitalsUpserted = 0, proceduresUpserted = 0, pricesInserted = 0;

    // First flush: rows from sample that are past dataStartRow
    let batch: NormalizedRow[] = [];
    for (const cols of sampleRows.slice(schema.dataStartRow)) {
      if (cols.every((c) => c === "")) continue;
      batch.push(...applySchema(cols, schema, fallback));
    }

    // Continue streaming remaining lines
    for await (const line of lineGen) {
      const cols = parseCsvLine(line);
      if (cols.every((c) => c === "")) continue;
      batch.push(...applySchema(cols, schema, fallback));

      if (batch.length >= 5000) {
        const stats = await flushBatch(batch, filename, hospitalCache, procedureCache);
        hospitalsUpserted += stats.hospitalsUpserted;
        proceduresUpserted += stats.proceduresUpserted;
        pricesInserted += stats.pricesInserted;
        batch = [];
      }
    }

    // Final batch
    if (batch.length > 0) {
      const stats = await flushBatch(batch, filename, hospitalCache, procedureCache);
      hospitalsUpserted += stats.hospitalsUpserted;
      proceduresUpserted += stats.proceduresUpserted;
      pricesInserted += stats.pricesInserted;
    }

    if (pricesInserted === 0) {
      return NextResponse.json({ error: "No valid price rows found after parsing.", schemaDetected: schema }, { status: 400 });
    }

    return NextResponse.json({ hospitalsUpserted, proceduresUpserted, pricesInserted, schemaDetected: schema });

  } catch (err) {
    console.error("Upload error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Upload failed" },
      { status: 500 }
    );
  }
}
