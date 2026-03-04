import { NextRequest, NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { prisma } from "@/lib/prisma";
import { anthropicCall } from "@/lib/anthropic-fetch";

export const dynamic = "force-dynamic";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
interface SheetData {
  name: string;
  rows: string[][];
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

interface WidePayerColumn {
  colIndex: number;
  payerName: string;
  payerType: string;
}

interface FileSchema {
  format: "long" | "wide";
  bestSheet: string;
  headerRow: number;        // 0-indexed row index of the header row
  dataStartRow: number;     // 0-indexed row index where data begins
  hospitalSource: "column" | "filename";
  hospitalNameFromFilename: string | null;
  columns: ColumnMap;
  widePayerColumns: WidePayerColumn[]; // only used when format === "wide"
  notes: string;
}

// ---------------------------------------------------------------------------
// Parse file → all sheets as { name, rows[][] }
// ---------------------------------------------------------------------------
function parseAllSheets(buffer: Buffer, filename: string): SheetData[] {
  const ext = filename.split(".").pop()?.toLowerCase();

  if (ext === "xlsx" || ext === "xls" || ext === "xlsm") {
    const wb = XLSX.read(buffer, { type: "buffer" });
    return wb.SheetNames.map((name) => {
      const ws = wb.Sheets[name];
      const raw: unknown[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "" });
      const rows = raw
        .map((r) => (r as unknown[]).map((c) => String(c ?? "").trim()))
        .filter((r) => r.some((c) => c !== ""));
      return { name, rows };
    });
  }

  // CSV — single sheet
  const text = buffer.toString("utf-8").replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const rows: string[][] = [];
  for (const line of text.split("\n")) {
    if (!line.trim()) continue;
    const cols: string[] = [];
    let cur = "";
    let inQuote = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        if (inQuote && line[i + 1] === '"') { cur += '"'; i++; }
        else inQuote = !inQuote;
      } else if (ch === "," && !inQuote) {
        cols.push(cur.trim()); cur = "";
      } else {
        cur += ch;
      }
    }
    cols.push(cur.trim());
    rows.push(cols);
  }
  return [{ name: "Sheet1", rows }];
}

// ---------------------------------------------------------------------------
// Ask Claude to detect the file structure
// ---------------------------------------------------------------------------
async function detectSchema(sheets: SheetData[], filename: string): Promise<FileSchema> {
  // Build a compact sample: first 20 non-empty rows of up to 3 sheets
  const sample = sheets.slice(0, 3).map((s) => ({
    sheet: s.name,
    rows: s.rows.slice(0, 20),
  }));

  const prompt = `You are a data engineering expert specializing in hospital price transparency files.

Analyze this spreadsheet and return a JSON schema so I can parse it correctly.

Filename: "${filename}"
Sheet data (first 20 rows per sheet):
${JSON.stringify(sample, null, 2)}

Common formats you may encounter:
- "long": one row per price entry (most common). Each row has procedure + payer + price.
- "wide": one row per procedure, multiple payer columns. Must be unpivoted.
- Some files have title/logo rows before the header row.
- Some files are per-hospital (no hospital column — name comes from filename).
- CMS standard files often have columns like "description", "code | 1", "standard_charge | gross", "standard_charge | negotiated_dollar", etc.

Return ONLY valid JSON matching this exact interface (no markdown, no explanation):
{
  "format": "long" | "wide",
  "bestSheet": "<sheet name with pricing data>",
  "headerRow": <0-indexed row number of the header row>,
  "dataStartRow": <0-indexed row number where data begins>,
  "hospitalSource": "column" | "filename",
  "hospitalNameFromFilename": "<hospital name if inferred from filename, else null>",
  "columns": {
    "hospital_name": <column index or null>,
    "address": <column index or null>,
    "cpt_code": <column index or null>,
    "procedure_name": <column index or null>,
    "category": <column index or null>,
    "payer_name": <column index or null>,
    "payer_type": <column index or null>,
    "price": <column index or null>,
    "price_type": <column index or null>
  },
  "widePayerColumns": [
    { "colIndex": <number>, "payerName": "<name>", "payerType": "cash|commercial|medicare|medicaid|other" }
  ],
  "notes": "<brief description of what you detected>"
}

For "wide" format: set widePayerColumns to every column that contains prices (each payer = one column).
For "long" format: widePayerColumns should be [].
If hospital name is not in any column but is obvious from the filename, set hospitalSource to "filename" and hospitalNameFromFilename to the inferred name.`;

  const text = await anthropicCall({
    max_tokens: 1024,
    messages: [{ role: "user", content: prompt }],
  });
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) throw new Error("Could not parse AI schema response");
  return JSON.parse(match[0]) as FileSchema;
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
  const cleaned = raw.replace(/[$,\s]/g, "");
  const val = parseFloat(cleaned);
  return isNaN(val) ? 0 : Math.round(val * 100);
}

// ---------------------------------------------------------------------------
// Convert schema + raw rows → normalized price records
// ---------------------------------------------------------------------------
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

function extractRows(sheet: SheetData, schema: FileSchema, filename: string): NormalizedRow[] {
  const { columns: c, format, dataStartRow, widePayerColumns } = schema;
  const dataRows = sheet.rows.slice(dataStartRow);
  const results: NormalizedRow[] = [];

  const get = (row: string[], idx: number | null): string =>
    idx !== null && idx >= 0 ? (row[idx] ?? "").trim() : "";

  const fallbackHospital =
    schema.hospitalSource === "filename" && schema.hospitalNameFromFilename
      ? schema.hospitalNameFromFilename
      : filename.replace(/\.[^.]+$/, "").replace(/[_\-]/g, " ");

  for (const row of dataRows) {
    if (row.every((cell) => cell === "")) continue;

    const hospitalName = get(row, c.hospital_name) || fallbackHospital;
    const address = get(row, c.address) || "Manhattan, NY";
    const cptCode = get(row, c.cpt_code).replace(/\s/g, "");
    const procedureName = get(row, c.procedure_name) || cptCode;
    const category = get(row, c.category) || "General";

    if (!cptCode && !procedureName) continue;

    if (format === "wide") {
      // Unpivot: one entry per payer column
      for (const payerCol of widePayerColumns) {
        const priceRaw = get(row, payerCol.colIndex);
        const priceInCents = parsePrice(priceRaw);
        if (priceInCents <= 0) continue;
        results.push({
          hospitalName,
          address,
          cptCode: cptCode || procedureName.slice(0, 10),
          procedureName,
          category,
          payerName: payerCol.payerName,
          payerType: normalizePayerType(payerCol.payerType || payerCol.payerName),
          priceInCents,
          priceType: normalizePriceType(payerCol.payerName),
        });
      }
    } else {
      // Long format: one entry per row
      const priceRaw = get(row, c.price);
      const priceInCents = parsePrice(priceRaw);
      if (priceInCents <= 0) continue;
      const payerNameRaw = get(row, c.payer_name) || "Standard";
      results.push({
        hospitalName,
        address,
        cptCode: cptCode || procedureName.slice(0, 10),
        procedureName,
        category,
        payerName: payerNameRaw,
        payerType: normalizePayerType(get(row, c.payer_type) || payerNameRaw),
        priceInCents,
        priceType: normalizePriceType(get(row, c.price_type)),
      });
    }
  }

  return results;
}

// ---------------------------------------------------------------------------
// POST /api/upload
// ---------------------------------------------------------------------------
export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get("file");

    if (!file || typeof file === "string") {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    const f = file as File;
    const buffer = Buffer.from(await f.arrayBuffer());

    // 1. Parse all sheets
    const sheets = parseAllSheets(buffer, f.name);
    if (sheets.length === 0 || sheets.every((s) => s.rows.length < 2)) {
      return NextResponse.json({ error: "File appears to be empty" }, { status: 400 });
    }

    // 2. AI schema detection
    const schema = await detectSchema(sheets, f.name);

    // 3. Find the target sheet
    const targetSheet =
      sheets.find((s) => s.name === schema.bestSheet) ?? sheets[0];

    // 4. Extract normalized rows
    const normalizedRows = extractRows(targetSheet, schema, f.name);
    if (normalizedRows.length === 0) {
      return NextResponse.json({
        error: "No valid price rows found after parsing.",
        schemaDetected: schema,
      }, { status: 400 });
    }

    // 5. Upsert to DB
    let hospitalsUpserted = 0;
    let proceduresUpserted = 0;
    let pricesInserted = 0;

    const hospitalCache = new Map<string, string>();
    const procedureCache = new Map<string, string>();

    for (const row of normalizedRows) {
      const hKey = `${row.hospitalName}__${row.address}`;

      if (!hospitalCache.has(hKey)) {
        const hospital = await prisma.hospital.upsert({
          where: { id: hKey },
          create: {
            id: hKey,
            name: row.hospitalName,
            address: row.address,
            borough: "Manhattan",
            sourceFile: f.name,
            lastSeeded: new Date(),
          },
          update: { lastSeeded: new Date() },
          select: { id: true },
        });
        hospitalCache.set(hKey, hospital.id);
        hospitalsUpserted++;
      }

      if (!procedureCache.has(row.cptCode)) {
        const procedure = await prisma.procedure.upsert({
          where: { cptCode: row.cptCode },
          create: {
            cptCode: row.cptCode,
            name: row.procedureName,
            category: row.category,
            description: "",
          },
          update: {},
          select: { id: true },
        });
        procedureCache.set(row.cptCode, procedure.id);
        proceduresUpserted++;
      }

      await prisma.priceEntry.create({
        data: {
          hospitalId: hospitalCache.get(hKey)!,
          procedureId: procedureCache.get(row.cptCode)!,
          payerName: row.payerName,
          payerType: row.payerType,
          priceInCents: row.priceInCents,
          priceType: row.priceType,
          rawCode: row.cptCode,
        },
      });
      pricesInserted++;
    }

    return NextResponse.json({
      hospitalsUpserted,
      proceduresUpserted,
      pricesInserted,
      schemaDetected: schema,
    });
  } catch (err) {
    console.error("Upload error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Upload failed" },
      { status: 500 }
    );
  }
}
