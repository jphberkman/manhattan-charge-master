/**
 * Downloads and seeds publicly available CMS price transparency files
 * for Manhattan hospitals missing/incomplete in the database.
 *
 * Supports:
 *  - CMS 3.0 wide CSV (NYU Langone, etc.)
 *  - CMS JSON (Mount Sinai, MSK, HSS)
 *
 * Usage:
 *   npx tsx scripts/seed-hospital-files.ts [--hospital=nyu|msk|sinai|hss|nyp|northwell|bellevue|all]
 *   npx tsx scripts/seed-hospital-files.ts                  # seeds all
 */

import { PrismaClient } from "../src/generated/prisma";
import { createWriteStream, createReadStream, existsSync, mkdirSync } from "fs";
import { pipeline } from "stream/promises";
import { Readable } from "stream";
import { createInterface } from "readline";
import * as path from "path";

const prisma = new PrismaClient();

// ── Hospital file definitions ───────────────────────────────────────────────

interface HospitalFile {
  key: string;
  hospitalName: string;
  address: string;
  url: string;
  format: "cms-csv" | "cms-json";
  /** Skip first N lines (metadata rows before header). */
  skipLines?: number;
  /** Only ingest standard 5-digit CPT codes (skip supplies/drugs). */
  cptOnly?: boolean;
}

// To find updated MRF URLs, check each hospital's price transparency page:
//   NYU Langone:  https://www.nyulangone.org/price-transparency
//   MSK:          https://www.mskcc.org/insurance-assistance/understanding-cost-care
//   Mount Sinai:  https://www.mountsinai.org/about/compliance/billing/machine-readable-files
//   HSS:          https://www.hss.edu/price-transparency.asp
//   NYP:          https://www.nyp.org/about-us/hospital-standard-charges
//   Northwell:    https://www.northwell.edu/price-transparency
//   NYC H+H:      https://www.nychealthandhospitals.org/price-transparency/
// Files follow CMS naming: {EIN}_{hospital-name}_standardcharges.{csv|json}
const HOSPITAL_FILES: HospitalFile[] = [
  {
    key: "nyu",
    hospitalName: "NYU Langone Health (Tisch Hospital)",
    address: "550 1st Ave, New York, NY 10016",
    url: "https://standard-charges-prod.s3.amazonaws.com/pricing_files/133971298-1801992631_nyu-langone-tisch_standardcharges.csv",
    format: "cms-csv",
    skipLines: 2, // First 2 lines are hospital metadata, header is line 3
  },
  {
    key: "nyu",
    hospitalName: "NYU Langone Orthopedic Hospital",
    address: "301 E 17th St, New York, NY 10003",
    url: "https://standard-charges-prod.s3.amazonaws.com/pricing_files/133971298-1669578324_nyu-langone-orthopedic-hospital_standardcharges.csv",
    format: "cms-csv",
    skipLines: 2,
  },
  {
    key: "msk",
    hospitalName: "Memorial Sloan Kettering Cancer Center",
    address: "1275 York Ave, New York, NY 10065",
    url: "https://www.mskcc.org/hpt/1/131924236_memorial-hospital-for-cancer-and-allied-diseases-nyc_standardcharges.json",
    format: "cms-json",
  },
  {
    key: "sinai",
    hospitalName: "The Mount Sinai Hospital",
    address: "One Gustave L. Levy Pl, New York, NY 10029",
    url: "https://www.mountsinai.org/files/mrf/131624096_mount-sinai-hospital_standardcharges.json",
    format: "cms-json",
    cptOnly: true,
  },
  {
    key: "sinai",
    hospitalName: "Mount Sinai West",
    address: "1000 10th Ave, New York, NY 10019",
    url: "https://www.mountsinai.org/files/mrf/132997301_mount-sinai-morningside_standardcharges.json",
    format: "cms-json",
    cptOnly: true,
  },
  {
    key: "hss",
    hospitalName: "Hospital for Special Surgery",
    address: "535 E 70th St, New York, NY 10021",
    url: "https://d2cg6hcwj0g0z0.cloudfront.net/131624135-1598703019_ny-society-for-the-relief-of-ruptured-and-crippled-maintaing-the-hospital-for-special-surgery_standardcharges.json",
    format: "cms-json",
  },
  {
    key: "nyp",
    hospitalName: "NewYork-Presbyterian Hospital",
    address: "525 E 68th St, New York, NY 10065",
    url: "https://www.nyp.org/documents/standard-charges/332840241_newyork-presbyterian-hospital_standardcharges.csv",
    format: "cms-csv",
    skipLines: 2,
  },
  {
    key: "northwell",
    hospitalName: "Lenox Hill Hospital",
    address: "100 E 77th St, New York, NY 10075",
    url: "https://nwhcpricetransparency.b-cdn.net/131624064_Lenox-Hill-Hospital_standardcharges.csv",
    format: "cms-csv",
    skipLines: 2,
  },
  {
    key: "bellevue",
    hospitalName: "Bellevue Hospital Center",
    address: "462 1st Ave, New York, NY 10016",
    url: "https://www.nychealthandhospitals.org/price-transparency/bellevue/133893681_Bellevue-Hospital-Center_standardcharges.csv",
    format: "cms-csv",
    skipLines: 2,
  },
];

// ── Normalization helpers ───────────────────────────────────────────────────

function normalizePayerType(raw: string): string {
  const v = raw.toLowerCase().trim();
  if (v.includes("cash") || v.includes("self")) return "cash";
  if (v.includes("medicare")) return "medicare";
  if (v.includes("medicaid")) return "medicaid";
  if (v.includes("aetna") || v.includes("cigna") || v.includes("united") || v.includes("anthem") ||
      v.includes("blue") || v.includes("humana") || v.includes("oxford") || v.includes("empire") ||
      v.includes("1199") || v.includes("emblem") || v.includes("multiplan") || v.includes("magnacare") ||
      v.includes("commercial") || v.includes("private") || v.includes("insurance")) return "commercial";
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

function isStandardCptCode(code: string): boolean {
  return /^\d{5}$/.test(code.trim());
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

// ── CMS JSON parser ─────────────────────────────────────────────────────────

function cmsObjectToRows(obj: Record<string, unknown>, hospitalName: string, address: string, cptOnly: boolean): NormalizedRow[] {
  type CodeEntry = { code?: string; billing_code?: string; type?: string; billing_code_type?: string };
  // Support all CMS JSON variants: codes[], billing_code_information[], code_information[]
  const codes = ((obj.codes ?? obj.billing_code_information ?? obj.code_information) as CodeEntry[] | undefined) ?? [];
  // Look for CPT first, then HCPCS as fallback
  const cptEntry = codes.find((c) => (c.type ?? c.billing_code_type)?.toUpperCase() === "CPT")
    ?? codes.find((c) => (c.type ?? c.billing_code_type)?.toUpperCase() === "HCPCS");
  const cptCode = (cptEntry?.code ?? cptEntry?.billing_code ?? "").trim();
  const procedureName = String(obj.description ?? cptCode);
  if (!cptCode && !procedureName) return [];
  if (cptOnly && !isStandardCptCode(cptCode)) return [];

  const base = { hospitalName, address, cptCode: cptCode || procedureName.slice(0, 10), procedureName, category: "General" };
  const rows: NormalizedRow[] = [];

  for (const charge of (obj.standard_charges as Record<string, unknown>[]) ?? []) {
    if (charge.gross_charge) {
      rows.push({ ...base, payerName: "Gross", payerType: "gross", priceInCents: Math.round(Number(charge.gross_charge) * 100), priceType: "gross" });
    }
    if (charge.discounted_cash) {
      rows.push({ ...base, payerName: "Cash", payerType: "cash", priceInCents: Math.round(Number(charge.discounted_cash) * 100), priceType: "discounted" });
    }
    if (charge.minimum_negotiated_charge) {
      rows.push({ ...base, payerName: "Min negotiated", payerType: "commercial", priceInCents: Math.round(Number(charge.minimum_negotiated_charge) * 100), priceType: "min" });
    }
    if (charge.maximum_negotiated_charge) {
      rows.push({ ...base, payerName: "Max negotiated", payerType: "commercial", priceInCents: Math.round(Number(charge.maximum_negotiated_charge) * 100), priceType: "max" });
    }
    for (const payer of (charge.payers_information as Record<string, unknown>[]) ?? []) {
      const price = payer.standard_charge_dollar ?? payer.negotiated_rate ?? payer.price ?? payer.estimated_amount;
      if (!price && payer.standard_charge_percentage) continue;
      if (!price) continue;
      const payerNameStr = String(payer.payer_name ?? payer.plan_name ?? "Unknown");
      const planName = payer.plan_name ? ` ${payer.plan_name}` : "";
      rows.push({
        ...base,
        payerName: `${payerNameStr}${planName}`.trim(),
        payerType: normalizePayerType(payerNameStr),
        priceInCents: Math.round(Number(price) * 100),
        priceType: normalizePriceType(String(payer.billing_class ?? charge.setting ?? "negotiated")),
      });
    }
  }
  return rows.filter((r) => r.priceInCents > 0);
}

// ── CSV parsing ─────────────────────────────────────────────────────────────

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

/**
 * Parses CMS 3.0 wide-format CSV.
 * Header format: code|1, code|1|type, code|2, code|2|type, ..., description,
 *   standard_charge|gross, standard_charge|discounted_cash, setting, ...,
 *   standard_charge|{planId}|{planName}|negotiated_dollar, ...
 */
interface CmsCsvPayerCol {
  index: number;
  planId: string;
  planName: string;
}

function parseCmsHeaders(headers: string[]): {
  codeIndices: { code: number; type: number }[];
  descriptionIdx: number;
  grossIdx: number;
  cashIdx: number;
  settingIdx: number;
  payerCols: CmsCsvPayerCol[];
} {
  const codeIndices: { code: number; type: number }[] = [];
  let descriptionIdx = -1;
  let grossIdx = -1;
  let cashIdx = -1;
  let settingIdx = -1;
  const payerCols: CmsCsvPayerCol[] = [];

  for (let i = 0; i < headers.length; i++) {
    const h = headers[i].toLowerCase();

    // Code columns: code|1, code|1|type, code|2, code|2|type, etc.
    const codeMatch = h.match(/^code\|(\d+)$/);
    if (codeMatch) {
      const typeIdx = headers.findIndex((hh, j) => j > i && hh.toLowerCase() === `code|${codeMatch[1]}|type`);
      codeIndices.push({ code: i, type: typeIdx });
      continue;
    }

    if (h === "description") { descriptionIdx = i; continue; }
    if (h === "standard_charge|gross") { grossIdx = i; continue; }
    if (h === "standard_charge|discounted_cash") { cashIdx = i; continue; }
    if (h === "setting") { settingIdx = i; continue; }

    // Payer columns: standard_charge|{planId}|{planName}|negotiated_dollar
    const payerMatch = h.match(/^standard_charge\|([^|]+)\|(.+)\|negotiated_dollar$/);
    if (payerMatch) {
      payerCols.push({ index: i, planId: payerMatch[1], planName: payerMatch[2] });
    }
  }

  return { codeIndices, descriptionIdx, grossIdx, cashIdx, settingIdx, payerCols };
}

function cmsCsvRowToNormalized(
  cols: string[],
  parsed: ReturnType<typeof parseCmsHeaders>,
  hospitalName: string,
  address: string,
): NormalizedRow[] {
  // Find the CPT code among the code columns
  let cptCode = "";
  for (const { code: codeIdx, type: typeIdx } of parsed.codeIndices) {
    if (typeIdx === -1) continue;
    const codeType = (cols[typeIdx] ?? "").toUpperCase().trim();
    const codeVal = (cols[codeIdx] ?? "").trim();
    if (codeType === "CPT" && codeVal) {
      cptCode = codeVal;
      break;
    }
  }

  // Skip if no CPT code
  if (!cptCode || !isStandardCptCode(cptCode)) return [];

  const description = (cols[parsed.descriptionIdx] ?? cptCode).trim();
  const setting = (cols[parsed.settingIdx] ?? "").trim();
  const base = { hospitalName, address, cptCode, procedureName: description, category: setting || "General" };
  const rows: NormalizedRow[] = [];

  // Gross charge
  const grossStr = cols[parsed.grossIdx] ?? "";
  const gross = parseFloat(grossStr.replace(/[$,\s]/g, ""));
  if (!isNaN(gross) && gross > 0) {
    rows.push({ ...base, payerName: "Gross", payerType: "gross", priceInCents: Math.round(gross * 100), priceType: "gross" });
  }

  // Discounted cash
  const cashStr = cols[parsed.cashIdx] ?? "";
  const cash = parseFloat(cashStr.replace(/[$,\s]/g, ""));
  if (!isNaN(cash) && cash > 0) {
    rows.push({ ...base, payerName: "Cash", payerType: "cash", priceInCents: Math.round(cash * 100), priceType: "discounted" });
  }

  // Payer-specific negotiated rates
  for (const pc of parsed.payerCols) {
    const priceStr = cols[pc.index] ?? "";
    const price = parseFloat(priceStr.replace(/[$,\s]/g, ""));
    if (isNaN(price) || price <= 0) continue;
    rows.push({
      ...base,
      payerName: pc.planName,
      payerType: normalizePayerType(pc.planName),
      priceInCents: Math.round(price * 100),
      priceType: "negotiated",
    });
  }

  return rows;
}

// ── Database batch writer ───────────────────────────────────────────────────

const BATCH_SIZE = 2000;
const hospitalCache = new Map<string, string>();
const procedureCache = new Map<string, string>();

async function flushBatch(batch: NormalizedRow[], sourceFile: string): Promise<number> {
  // Upsert hospitals
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
    }
  }

  // Batch upsert procedures (collect unique first)
  const uniqueProcs = new Map<string, { name: string; category: string }>();
  for (const row of batch) {
    if (!procedureCache.has(row.cptCode)) {
      uniqueProcs.set(row.cptCode, { name: row.procedureName, category: row.category });
    }
  }
  for (const [code, { name, category }] of uniqueProcs) {
    const p = await prisma.procedure.upsert({
      where: { cptCode: code },
      create: { cptCode: code, name, category, description: "" },
      update: {},
      select: { id: true },
    });
    procedureCache.set(code, p.id);
  }

  // Batch insert prices
  const result = await prisma.priceEntry.createMany({
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

  return result.count;
}

// ── Download file ───────────────────────────────────────────────────────────

const DOWNLOAD_DIR = "/tmp/hospital-files";

async function downloadFile(url: string, filename: string): Promise<string> {
  mkdirSync(DOWNLOAD_DIR, { recursive: true });
  const filePath = path.join(DOWNLOAD_DIR, filename);

  if (existsSync(filePath)) {
    console.log(`  Cached: ${filePath}`);
    return filePath;
  }

  console.log(`  Downloading: ${url.slice(0, 80)}...`);
  const res = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0 (compatible; PriceTransparency/1.0)" },
  });
  if (!res.ok) throw new Error(`Download failed: ${res.status} ${res.statusText}`);

  const body = res.body;
  if (!body) throw new Error("No response body");

  const writer = createWriteStream(filePath);
  await pipeline(Readable.fromWeb(body as import("stream/web").ReadableStream), writer);
  console.log(`  Saved: ${filePath}`);
  return filePath;
}

// ── Process CMS JSON (streaming) ────────────────────────────────────────────

async function processCmsJson(
  filePath: string, hospitalName: string, address: string, cptOnly: boolean,
): Promise<{ rows: number; cptCodes: number }> {
  let totalRows = 0;
  let batch: NormalizedRow[] = [];
  const cptCodesFound = new Set<string>();

  console.log(`  Streaming JSON...`);

  const stream = createReadStream(filePath, { encoding: "utf-8", highWaterMark: 256 * 1024 });
  let inArray = false;
  let depth = 0;
  let objectChars: string[] = [];
  let leftover = "";

  for await (const chunk of stream) {
    const text = leftover + chunk;
    leftover = "";

    for (let i = 0; i < text.length; i++) {
      const ch = text[i];

      if (!inArray) {
        if (ch === "[" && text.slice(Math.max(0, i - 50), i).includes("standard_charge_information")) {
          inArray = true;
          depth = 0;
        }
        continue;
      }

      if (ch === "{") {
        if (depth === 0) objectChars = [];
        depth++;
        objectChars.push(ch);
      } else if (ch === "}") {
        objectChars.push(ch);
        depth--;
        if (depth === 0) {
          try {
            const obj = JSON.parse(objectChars.join(""));
            const rows = cmsObjectToRows(obj, hospitalName, address, cptOnly);
            for (const r of rows) {
              batch.push(r);
              if (isStandardCptCode(r.cptCode)) cptCodesFound.add(r.cptCode);
            }
            if (batch.length >= BATCH_SIZE) {
              totalRows += await flushBatch(batch, filePath);
              batch = [];
              if (totalRows % 10000 < BATCH_SIZE) {
                process.stdout.write(`\r    ${totalRows.toLocaleString()} rows, ${cptCodesFound.size} CPT codes`);
              }
            }
          } catch { /* skip malformed */ }
          objectChars = [];
        }
      } else if (depth > 0) {
        objectChars.push(ch);
      } else if (ch === "]" && depth === 0) {
        inArray = false;
      }
    }
  }

  if (batch.length > 0) totalRows += await flushBatch(batch, filePath);
  console.log(`\r    ${totalRows.toLocaleString()} rows, ${cptCodesFound.size} CPT codes — done`);
  return { rows: totalRows, cptCodes: cptCodesFound.size };
}

// ── Process CMS 3.0 CSV (streaming) ────────────────────────────────────────

async function processCmsCsv(
  filePath: string, hospitalName: string, address: string, skipLines: number,
): Promise<{ rows: number; cptCodes: number }> {
  let totalRows = 0;
  let batch: NormalizedRow[] = [];
  const cptCodesFound = new Set<string>();

  console.log(`  Streaming CSV...`);

  const rl = createInterface({
    input: createReadStream(filePath, { encoding: "utf-8" }),
    crlfDelay: Infinity,
  });

  let lineNum = 0;
  let parsedHeaders: ReturnType<typeof parseCmsHeaders> | null = null;

  for await (const line of rl) {
    lineNum++;
    if (lineNum <= skipLines) continue; // Skip metadata rows
    if (!line.trim()) continue;

    const cols = parseCsvLine(line);

    // First non-skipped line is the header
    if (!parsedHeaders) {
      parsedHeaders = parseCmsHeaders(cols);
      console.log(`    Header at line ${lineNum}: ${parsedHeaders.codeIndices.length} code cols, ${parsedHeaders.payerCols.length} payer cols`);
      continue;
    }

    const rows = cmsCsvRowToNormalized(cols, parsedHeaders, hospitalName, address);
    for (const r of rows) {
      batch.push(r);
      cptCodesFound.add(r.cptCode);
    }

    if (batch.length >= BATCH_SIZE) {
      totalRows += await flushBatch(batch, filePath);
      batch = [];
      if (totalRows % 10000 < BATCH_SIZE) {
        process.stdout.write(`\r    ${totalRows.toLocaleString()} rows, ${cptCodesFound.size} CPT codes`);
      }
    }
  }

  if (batch.length > 0) totalRows += await flushBatch(batch, filePath);
  console.log(`\r    ${totalRows.toLocaleString()} rows, ${cptCodesFound.size} CPT codes — done`);
  return { rows: totalRows, cptCodes: cptCodesFound.size };
}

// ── Main ────────────────────────────────────────────────────────────────────

async function main() {
  const arg = process.argv.find((a) => a.startsWith("--hospital="));
  const filter = arg ? arg.split("=")[1] : "all";

  const files = filter === "all"
    ? HOSPITAL_FILES
    : HOSPITAL_FILES.filter((f) => f.key === filter);

  if (!files.length) {
    console.error(`No hospitals match: ${filter}`);
    console.error(`Available: ${[...new Set(HOSPITAL_FILES.map((f) => f.key))].join(", ")}, all`);
    process.exit(1);
  }

  console.log(`\nSeeding ${files.length} hospital file(s)...\n`);

  for (const file of files) {
    console.log(`\n${"=".repeat(60)}`);
    console.log(`${file.hospitalName}`);
    console.log(`${"=".repeat(60)}`);

    try {
      const ext = file.format === "cms-csv" ? "csv" : "json";
      const filename = `${file.hospitalName.replace(/[^a-zA-Z0-9]/g, "_")}.${ext}`;
      const filePath = await downloadFile(file.url, filename);

      let result: { rows: number; cptCodes: number };
      if (file.format === "cms-json") {
        result = await processCmsJson(filePath, file.hospitalName, file.address, file.cptOnly ?? false);
      } else {
        result = await processCmsCsv(filePath, file.hospitalName, file.address, file.skipLines ?? 0);
      }

      console.log(`  Result: ${result.rows.toLocaleString()} price entries, ${result.cptCodes} unique CPT codes`);
    } catch (err) {
      console.error(`  ERROR: ${err}`);
    }
  }

  // Summary
  console.log(`\n${"=".repeat(60)}`);
  console.log("DATABASE SUMMARY");
  console.log(`${"=".repeat(60)}`);

  const hospitals = await prisma.hospital.findMany({
    select: { name: true, _count: { select: { prices: true } } },
    orderBy: { prices: { _count: "desc" } },
  });
  for (const h of hospitals) {
    console.log(`  ${h.name}: ${h._count.prices.toLocaleString()} entries`);
  }
}

main()
  .catch((err) => { console.error("Fatal:", err); process.exit(1); })
  .finally(() => prisma.$disconnect());
