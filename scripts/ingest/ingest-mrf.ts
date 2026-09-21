/**
 * Per-campus MRF ingest (2026-09 corpus).
 *
 *   DATABASE_URL=… npx tsx scripts/ingest/ingest-mrf.ts <shopper-id> <file> [--dry-run]
 *
 * Formats: CMS 3.0 tall CSV (H+H), CMS 3.0 wide CSV (NYU), CMS 2.x JSON (stream).
 * Identity is validated from the FILE HEADER before any row is written.
 */
import { createHash } from "node:crypto";
import { createReadStream, statSync, openSync, readSync, closeSync } from "node:fs";
import path from "node:path";
import { Client } from "pg";
import Papa from "papaparse";
import { pipeline as streamPipeline } from "node:stream/promises";
import { PassThrough, Transform } from "node:stream";
import pick from "stream-json/filters/pick.js";
import streamArray from "stream-json/streamers/stream-array.js";
import { SHOPPER_HOSPITALS } from "../../src/lib/price-transparency/shopper-hospitals";
import {
  ChargeRow,
  CodeCandidate,
  IngestStats,
  PriceCopyLoader,
  classifyPayer,
  deletePriorIngest,
  ensureShopperHospital,
  finishSourceFileSql,
  joinRawCodes,
  normalizeCodeType,
  parseMoneyCents,
  pickPrimaryCode,
  reject,
  startSourceFileSql,
} from "./ingest-lib";

const SOURCE_TAG = "mrf-2026-09";

/** Header identity expectations per shopper hospital: substrings that MUST appear. */
const HEADER_EXPECT: Record<string, RegExp> = {
  "hhc-bellevue": /bellevue/i,
  "hhc-harlem": /harlem/i,
  "hhc-metropolitan": /metropolitan/i,
  "nyu-langone": /tisch|nyu langone(?!.*orthopedic)/i,
  msk: /memorial|sloan/i,
  "mount-sinai": /the mount sinai hospital/i,
  "mount-sinai-morningside": /morningside/i,
  "mount-sinai-west": /mount sinai west/i,
  hss: /special surgery|ruptured and crippled/i,
  "lenox-hill": /lenox hill/i,
  "nyp-columbia": /columbia/i,
  "nyp-cornell": /weill cornell/i,
  "nyp-lower-manhattan": /lower manhattan/i,
};

function sha256File(p: string): string {
  const hash = createHash("sha256");
  const fd = openSync(p, "r");
  const buf = Buffer.alloc(1 << 20);
  let n: number;
  while ((n = readSync(fd, buf, 0, buf.length, null)) > 0) hash.update(buf.subarray(0, n));
  closeSync(fd);
  return hash.digest("hex");
}

function headBytes(p: string, n = 8192): string {
  const fd = openSync(p, "r");
  const buf = Buffer.alloc(n);
  const read = readSync(fd, buf, 0, n, 0);
  closeSync(fd);
  return buf.subarray(0, read).toString("utf-8");
}

interface FileHeader {
  name: string | null;
  location: string | null;
  npi: string | null;
  asOfIso: string | null;
  format: "csv-tall" | "csv-wide" | "json";
}

function parseDateIso(raw: string | undefined | null): string | null {
  if (!raw) return null;
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

function sniff(file: string): FileHeader {
  const head = headBytes(file).replace(/^\uFEFF/, "");
  if (head.trimStart().startsWith("{")) {
    const name = head.match(/"hospital_name"\s*:\s*"([^"]+)"/)?.[1] ?? null;
    const updated = head.match(/"last_updated_on"\s*:\s*"([^"]+)"/)?.[1] ?? null;
    const loc = head.match(/"hospital_location"\s*:\s*\[\s*"([^"]+)"/)?.[1] ?? null;
    return { name, location: loc, npi: null, asOfIso: parseDateIso(updated), format: "json" };
  }
  // CSV 3.0: row1 metadata keys, row2 values, row3 real header.
  // Wide files have thousands of header columns — read a bigger head.
  const bigHead = headBytes(file, 2 << 20).replace(/^\uFEFF/, "");
  const parsed = Papa.parse<string[]>(bigHead, { preview: 4 });
  const [keys, vals, header] = parsed.data as string[][];
  const kv: Record<string, string> = {};
  (keys ?? []).forEach((k, i) => (kv[k?.trim()] = (vals?.[i] ?? "").trim()));
  const wide = (header ?? []).some((h) => /^standard_charge\|[^|]+\|[^|]+\|/.test(h));
  return {
    name: kv["hospital_name"] || null,
    location: kv["location_name"] || null,
    npi: kv["type_2_npi"] || null,
    asOfIso: parseDateIso(kv["last_updated_on"] || kv["as_of_date"]),
    format: wide ? "csv-wide" : "csv-tall",
  };
}

// ── CMS 3.0 tall CSV (H+H campus files) ──────────────────────────────────────

async function ingestTallCsv(
  file: string,
  loader: PriceCopyLoader,
  stats: IngestStats,
): Promise<void> {
  const seenItem = new Set<string>();
  let header: string[] | null = null;
  let rowNo = 0;

  await new Promise<void>((resolve, rejectP) => {
    Papa.parse<string[]>(createReadStream(file, { encoding: "utf-8" }), {
      skipEmptyLines: true,
      chunkSize: 1 << 20,
      chunk: (results, parserHandle) => {
        parserHandle.pause();
        (async () => {
          for (const row of results.data as unknown as string[][]) {
            rowNo++;
            if (rowNo <= 2) continue; // metadata rows
            if (rowNo === 3) {
              header = row.map((h) => h.trim());
              continue;
            }
            await handleTallRow(row);
          }
          parserHandle.resume();
        })().catch(rejectP);
      },
      complete: () => resolve(),
      error: (err) => rejectP(err),
    });
  });

  async function handleTallRow(row: string[]): Promise<void> {
    if (!header) return;
    stats.discovered++;
    const g = (name: string) => {
      const i = header!.indexOf(name);
      return i >= 0 ? (row[i] ?? "").trim() : "";
    };
    const description = g("description");
    const cands: CodeCandidate[] = [1, 2, 3].map((n) => {
      const code = g(`code|${n}`);
      return { code, kind: code ? normalizeCodeType(g(`code|${n}|type`), code) : "unknown" };
    });
    const primary = pickPrimaryCode(cands);
    if (!primary.code || !description) return reject(stats, "no-code-or-description");

    const rawCode = joinRawCodes(cands);
    const setting = g("setting") || null;
    const billingClass = g("billing_class") || null;
    const minCents = parseMoneyCents(g("standard_charge|min"));
    const maxCents = parseMoneyCents(g("standard_charge|max"));
    const medianCents = parseMoneyCents(g("median_amount"));
    const base = {
      code: primary.code,
      codeKind: primary.kind,
      rawCode,
      description,
      billingClass,
      setting,
      minCents,
      maxCents,
      medianCents: null as number | null,
    };

    const itemKey = `${primary.code}|${description}|${setting}`;
    if (!seenItem.has(itemKey)) {
      seenItem.add(itemKey);
      const gross = parseMoneyCents(g("standard_charge|gross"));
      if (gross) {
        await loader.add({ ...base, payerName: "Gross charge", payerClass: "gross", priceType: "gross", priceCents: gross, planName: null, methodology: null });
      }
      const cash = parseMoneyCents(g("standard_charge|discounted_cash"));
      if (cash) {
        await loader.add({ ...base, payerName: "Discounted cash", payerClass: "cash", priceType: "cash", priceCents: cash, planName: null, methodology: null });
      }
    }

    const negotiated = parseMoneyCents(g("standard_charge|negotiated_dollar"));
    const payerName = g("payer_name");
    if (negotiated && payerName) {
      await loader.add({
        ...base,
        medianCents,
        payerName,
        payerClass: classifyPayer(payerName, g("plan_name")),
        priceType: "negotiated",
        priceCents: negotiated,
        planName: g("plan_name") || null,
        methodology: g("standard_charge|methodology") || null,
      });
    } else if (payerName && !negotiated) {
      reject(stats, "payer-row-without-dollar");
    }
  }
}

// ── CMS 3.0 wide CSV (NYU) ───────────────────────────────────────────────────

interface WidePayerCol {
  payer: string;
  plan: string;
  dollarIdx: number;
  methodologyIdx: number;
}

async function ingestWideCsv(
  file: string,
  loader: PriceCopyLoader,
  stats: IngestStats,
): Promise<void> {
  let header: string[] | null = null;
  let payerCols: WidePayerCol[] = [];
  let idx: Record<string, number> = {};
  let rowNo = 0;

  await new Promise<void>((resolve, rejectP) => {
    Papa.parse<string[]>(createReadStream(file, { encoding: "utf-8" }), {
      skipEmptyLines: true,
      chunkSize: 1 << 20,
      chunk: (results, parserHandle) => {
        parserHandle.pause();
        (async () => {
          for (const row of results.data as unknown as string[][]) {
            rowNo++;
            if (rowNo <= 2) continue;
            if (rowNo === 3) {
              header = row.map((h) => h.trim());
              idx = Object.fromEntries(header.map((h, i) => [h, i]));
              const byPair = new Map<string, Partial<WidePayerCol>>();
              header.forEach((h, i) => {
                const m = h.match(/^standard_charge\|([^|]+)\|([^|]+)\|(negotiated_dollar|methodology)$/);
                if (!m) return;
                const key = `${m[1]}|${m[2]}`;
                const rec = byPair.get(key) ?? { payer: m[1], plan: m[2], dollarIdx: -1, methodologyIdx: -1 };
                if (m[3] === "negotiated_dollar") rec.dollarIdx = i;
                else rec.methodologyIdx = i;
                byPair.set(key, rec);
              });
              payerCols = [...byPair.values()].filter((p) => (p.dollarIdx ?? -1) >= 0) as WidePayerCol[];
              continue;
            }
            await handleWideRow(row);
          }
          parserHandle.resume();
        })().catch(rejectP);
      },
      complete: () => resolve(),
      error: (err) => rejectP(err),
    });
  });

  async function handleWideRow(row: string[]): Promise<void> {
    if (!header) return;
    stats.discovered++;
    const g = (name: string) => {
      const i = idx[name];
      return i !== undefined ? (row[i] ?? "").trim() : "";
    };
    const description = g("description");
    const cands: CodeCandidate[] = [1, 2, 3].map((n) => {
      const code = g(`code|${n}`);
      return { code, kind: code ? normalizeCodeType(g(`code|${n}|type`), code) : "unknown" };
    });
    const primary = pickPrimaryCode(cands);
    if (!primary.code || !description) return reject(stats, "no-code-or-description");

    const base = {
      code: primary.code,
      codeKind: primary.kind,
      rawCode: joinRawCodes(cands),
      description,
      billingClass: null,
      setting: g("setting") || null,
      minCents: parseMoneyCents(g("standard_charge|min")),
      maxCents: parseMoneyCents(g("standard_charge|max")),
      medianCents: null,
    };

    const gross = parseMoneyCents(g("standard_charge|gross"));
    if (gross) {
      await loader.add({ ...base, payerName: "Gross charge", payerClass: "gross", priceType: "gross", priceCents: gross, planName: null, methodology: null });
    }
    const cash = parseMoneyCents(g("standard_charge|discounted_cash"));
    if (cash) {
      await loader.add({ ...base, payerName: "Discounted cash", payerClass: "cash", priceType: "cash", priceCents: cash, planName: null, methodology: null });
    }
    for (const pc of payerCols) {
      const cents = parseMoneyCents(row[pc.dollarIdx]);
      if (!cents) continue;
      await loader.add({
        ...base,
        payerName: pc.payer,
        payerClass: classifyPayer(pc.payer, pc.plan),
        priceType: "negotiated",
        priceCents: cents,
        planName: pc.plan,
        methodology: pc.methodologyIdx >= 0 ? (row[pc.methodologyIdx] ?? "").trim() || null : null,
      });
    }
  }
}

// ── CMS 2.x JSON (streaming) ─────────────────────────────────────────────────

interface JsonItem {
  description?: string;
  code_information?: Array<{ code?: string; type?: string }>;
  standard_charges?: Array<Record<string, unknown>>;
}

async function ingestJson(
  file: string,
  loader: PriceCopyLoader,
  stats: IngestStats,
): Promise<void> {
  // Some hospitals (Lenox Hill) publish JSON with a UTF-8 BOM the parser rejects.
  let bomChecked = false;
  const stripBom = new Transform({
    transform(chunk: Buffer, _enc, cb) {
      if (!bomChecked) {
        bomChecked = true;
        if (chunk[0] === 0xef && chunk[1] === 0xbb && chunk[2] === 0xbf) chunk = chunk.subarray(3);
      }
      cb(null, chunk);
    },
  });
  const pickStream = pick.withParserAsStream({ filter: "standard_charge_information" });
  const arrayStream = streamArray.asStream();
  const out = new PassThrough({ objectMode: true, highWaterMark: 64 });
  const pipePromise = streamPipeline(createReadStream(file), stripBom, pickStream, arrayStream, out);

  for await (const { value } of out as AsyncIterable<{ value: JsonItem }>) {
    stats.discovered++;
    const item = value;
    const description = String(item.description ?? "").trim();
    const cands: CodeCandidate[] = (item.code_information ?? []).map((c) => {
      const code = String(c.code ?? "").trim();
      return { code, kind: code ? normalizeCodeType(String(c.type ?? ""), code) : "unknown" };
    });
    const primary = pickPrimaryCode(cands);
    if (!primary.code || !description) {
      reject(stats, "no-code-or-description");
      continue;
    }
    const rawCode = joinRawCodes(cands);

    for (const charge of item.standard_charges ?? []) {
      const setting = charge.setting ? String(charge.setting) : null;
      const billingClass = charge.billing_class ? String(charge.billing_class) : null;
      const minCents = parseMoneyCents(charge.minimum);
      const maxCents = parseMoneyCents(charge.maximum);
      const base = {
        code: primary.code,
        codeKind: primary.kind,
        rawCode,
        description,
        billingClass,
        setting,
        minCents,
        maxCents,
        medianCents: null as number | null,
      };
      const gross = parseMoneyCents(charge.gross_charge ?? (charge as Record<string, unknown>).gross_charges);
      if (gross) {
        await loader.add({ ...base, payerName: "Gross charge", payerClass: "gross", priceType: "gross", priceCents: gross, planName: null, methodology: null });
      }
      const cash = parseMoneyCents(charge.discounted_cash);
      if (cash) {
        await loader.add({ ...base, payerName: "Discounted cash", payerClass: "cash", priceType: "cash", priceCents: cash, planName: null, methodology: null });
      }
      const payers = (charge.payers_information as Array<Record<string, unknown>>) ?? [];
      for (const p of payers) {
        const payerName = String(p.payer_name ?? "").trim();
        if (!payerName) continue;
        const cents =
          parseMoneyCents(p.standard_charge_dollar) ??
          parseMoneyCents(p.standard_estimated_amount) ??
          parseMoneyCents(p.estimated_amount);
        if (!cents) {
          reject(stats, "payer-row-without-dollar");
          continue;
        }
        const planName = p.plan_name ? String(p.plan_name) : null;
        await loader.add({
          ...base,
          payerName,
          payerClass: classifyPayer(payerName, planName),
          priceType: "negotiated",
          priceCents: cents,
          planName,
          methodology: p.methodology ? String(p.methodology) : null,
        });
      }
    }
  }
  await pipePromise;
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const [shopperId, file, ...flags] = process.argv.slice(2);
  const dryRun = flags.includes("--dry-run");
  if (!shopperId || !file) {
    console.error("Usage: ingest-mrf.ts <shopper-id> <file> [--dry-run]");
    process.exit(1);
  }
  const hospital = SHOPPER_HOSPITALS.find((h) => h.id === shopperId);
  if (!hospital) throw new Error(`Unknown shopper hospital id: ${shopperId}`);
  const expect = HEADER_EXPECT[shopperId];
  if (!expect) throw new Error(`No header expectation for ${shopperId}`);

  const header = sniff(file);
  const identityBlob = `${header.name ?? ""} ${header.location ?? ""}`;
  if (!expect.test(identityBlob)) {
    throw new Error(
      `IDENTITY MISMATCH: file header says "${identityBlob.trim()}", expected ${expect} for ${shopperId}. Refusing to ingest.`,
    );
  }
  console.log(`[${shopperId}] header identity OK: "${identityBlob.trim()}" (${header.format}, asOf ${header.asOfIso ?? "unknown"})`);

  if (dryRun) {
    console.log("--dry-run: stopping before any database writes");
    return;
  }

  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL required");
  const client = new Client({ connectionString: url });
  await client.connect();

  const stats: IngestStats = { discovered: 0, inserted: 0, rejected: 0, rejectReasons: {} };
  const filename = path.basename(file);
  const bytes = statSync(file).size;
  console.log(`[${shopperId}] sha256…`);
  const sha = sha256File(file);

  const sourceFileId = await startSourceFileSql(client, {
    filename,
    sha256: sha,
    bytes,
    hospitalKey: shopperId,
    format: header.format,
    parser: `ingest-mrf/${header.format}`,
    headerName: header.name,
    headerLocation: header.location,
    headerNpi: header.npi,
    asOfIso: header.asOfIso,
  });

  try {
    await ensureShopperHospital(client, { id: hospital.id, name: hospital.name, address: hospital.address, cmsCcn: hospital.cmsCcn }, filename);
    const deleted = await deletePriorIngest(client, hospital.id, SOURCE_TAG);
    if (deleted) console.log(`[${shopperId}] removed ${deleted} rows from a prior ${SOURCE_TAG} ingest`);

    const loader = new PriceCopyLoader(client, hospital.id, sourceFileId, header.asOfIso, SOURCE_TAG);
    await loader.start();
    const t0 = Date.now();
    if (header.format === "csv-tall") await ingestTallCsv(file, loader, stats);
    else if (header.format === "csv-wide") await ingestWideCsv(file, loader, stats);
    else await ingestJson(file, loader, stats);
    stats.inserted = await loader.finish();
    const secs = Math.round((Date.now() - t0) / 1000);

    await finishSourceFileSql(client, sourceFileId, stats, "processed");
    console.log(`[${shopperId}] DONE in ${secs}s — discovered=${stats.discovered} inserted=${stats.inserted} rejected=${stats.rejected}`);
    console.log(`[${shopperId}] reject reasons:`, stats.rejectReasons);
  } catch (err) {
    await finishSourceFileSql(client, sourceFileId, stats, "failed", err instanceof Error ? err.message : String(err));
    throw err;
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
