/**
 * Read MASTER_INDEX from Neon object storage, download preferred hospital MRFs,
 * extract CPT/billing code + list/cash/negotiated into PriceIndex.
 *
 * Originals stay in Neon. Temp files are under os.tmpdir() and deleted after each hospital.
 *
 *   npx tsx scripts/ingest/ingest-from-lake.ts
 *   npx tsx scripts/ingest/ingest-from-lake.ts --only=msk,hhc-bellevue
 *   npx tsx scripts/ingest/ingest-from-lake.ts --dry-run
 */
import { config as loadEnv } from "dotenv";
import { spawn } from "node:child_process";
import { createReadStream, mkdtempSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { pipeline as streamPipeline } from "node:stream/promises";
import { PassThrough, Transform, type Readable } from "node:stream";
import { createGunzip } from "node:zlib";
import { Client } from "pg";
import { from as copyFrom } from "pg-copy-streams";
import Papa from "papaparse";
import pick from "stream-json/filters/pick.js";
import streamArray from "stream-json/streamers/stream-array.js";
import { randomUUID } from "node:crypto";
import {
  MASTER_INDEX_KEY,
  parseMasterIndexCsv,
  preferredHospitalMrfs,
  type PreferredMrf,
} from "../../src/lib/price-transparency/lake-catalog";
import { SkinnyAggregator } from "../../src/lib/price-transparency/skinny-aggregate";
import { SHOPPER_HOSPITALS } from "../../src/lib/price-transparency/shopper-hospitals";
import {
  ensureShopperHospital,
  normalizeCodeType,
  parseMoneyCents,
  pickPrimaryCode,
  type CodeCandidate,
} from "./ingest-lib";
import { getObjectText, getObjectToFile, storageConfigFromEnv } from "./s3-get";

loadEnv({ path: ".env.local" });
loadEnv();

const HEADER_EXPECT: Record<string, RegExp> = {
  "hhc-bellevue": /bellevue/i,
  "hhc-harlem": /harlem/i,
  "hhc-metropolitan": /metropolitan/i,
  "nyu-langone": /tisch|nyu langone(?!.*orthopedic)/i,
  msk: /memorial|sloan/i,
  "mount-sinai": /the mount sinai hospital/i,
  "mount-sinai-morningside": /morningside/i,
  hss: /special surgery|ruptured and crippled/i,
  "lenox-hill": /lenox hill/i,
};

interface JsonItem {
  description?: string;
  code_information?: Array<{ code?: string; type?: string }>;
  standard_charges?: Array<Record<string, unknown>>;
}

function csvField(v: string | number | null): string {
  if (v === null || v === undefined) return "";
  return `"${String(v).replace(/"/g, '""').replace(/\r?\n/g, " ")}"`;
}

function stripBomTransform(): Transform {
  let checked = false;
  return new Transform({
    transform(chunk: Buffer, _enc, cb) {
      if (!checked) {
        checked = true;
        if (chunk[0] === 0xef && chunk[1] === 0xbb && chunk[2] === 0xbf) chunk = chunk.subarray(3);
      }
      cb(null, chunk);
    },
  });
}

function openSource(file: string, encoding?: "utf8"): Readable {
  const lower = file.toLowerCase();
  if (lower.endsWith(".zip")) {
    const child = spawn("unzip", ["-p", file], { stdio: ["ignore", "pipe", "inherit"] });
    if (!child.stdout) throw new Error("unzip produced no stdout");
    return child.stdout;
  }
  if (lower.endsWith(".gz")) {
    const gz = createReadStream(file).pipe(createGunzip());
    return encoding === "utf8" ? gz.setEncoding("utf8") : gz;
  }
  return encoding === "utf8" ? createReadStream(file, { encoding: "utf8" }) : createReadStream(file);
}

async function sniffIdentity(file: string): Promise<{ name: string | null; location: string | null; asOfIso: string | null; format: "csv-tall" | "csv-wide" | "json" }> {
  const bufs: Buffer[] = [];
  let n = 0;
  const stream = openSource(file);
  for await (const chunk of stream) {
    const b = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    bufs.push(b);
    n += b.length;
    if (n >= 2 << 20) break;
  }
  stream.destroy();
  const head = Buffer.concat(bufs).toString("utf8").replace(/^\uFEFF/, "");
  if (head.trimStart().startsWith("{")) {
    const name = head.match(/"hospital_name"\s*:\s*"([^"]+)"/)?.[1] ?? null;
    const updated = head.match(/"last_updated_on"\s*:\s*"([^"]+)"/)?.[1] ?? null;
    const loc = head.match(/"hospital_location"\s*:\s*\[\s*"([^"]+)"/)?.[1] ?? null;
    const d = updated ? new Date(updated) : null;
    return { name, location: loc, asOfIso: d && !Number.isNaN(d.getTime()) ? d.toISOString() : null, format: "json" };
  }
  const parsed = Papa.parse<string[]>(head, { preview: 4 });
  const [keys, vals, header] = parsed.data as string[][];
  const kv: Record<string, string> = {};
  (keys ?? []).forEach((k, i) => (kv[k?.trim()] = (vals?.[i] ?? "").trim()));
  const wide = (header ?? []).some((h) => /^standard_charge\|[^|]+\|[^|]+\|/.test(h));
  const updated = kv["last_updated_on"] || kv["as_of_date"];
  const d = updated ? new Date(updated) : null;
  return {
    name: kv["hospital_name"] || null,
    location: kv["location_name"] || null,
    asOfIso: d && !Number.isNaN(d.getTime()) ? d.toISOString() : null,
    format: wide ? "csv-wide" : "csv-tall",
  };
}

function addMoney(
  agg: SkinnyAggregator,
  code: string,
  codeKind: string,
  description: string,
  priceType: "gross" | "cash" | "negotiated",
  raw: unknown,
) {
  const cents = parseMoneyCents(raw);
  if (!cents) return;
  agg.add({ code, codeKind, description, priceType, priceCents: cents });
}

async function parseJson(file: string, agg: SkinnyAggregator): Promise<void> {
  const pickStream = pick.withParserAsStream({ filter: "standard_charge_information" });
  const arrayStream = streamArray.asStream();
  const out = new PassThrough({ objectMode: true, highWaterMark: 64 });
  const pipePromise = streamPipeline(openSource(file), stripBomTransform(), pickStream, arrayStream, out);
  for await (const { value } of out as AsyncIterable<{ value: JsonItem }>) {
    const description = String(value.description ?? "").trim();
    const cands: CodeCandidate[] = (value.code_information ?? []).map((c) => {
      const code = String(c.code ?? "").trim();
      return { code, kind: code ? normalizeCodeType(String(c.type ?? ""), code) : "unknown" };
    });
    const primary = pickPrimaryCode(cands);
    if (!primary.code || !description) continue;
    for (const charge of value.standard_charges ?? []) {
      addMoney(agg, primary.code, primary.kind, description, "gross", charge.gross_charge ?? charge.gross_charges);
      addMoney(agg, primary.code, primary.kind, description, "cash", charge.discounted_cash);
      const payers = (charge.payers_information as Array<Record<string, unknown>>) ?? [];
      for (const p of payers) {
        addMoney(
          agg,
          primary.code,
          primary.kind,
          description,
          "negotiated",
          p.standard_charge_dollar ?? p.standard_estimated_amount ?? p.estimated_amount,
        );
      }
    }
  }
  await pipePromise;
}

async function parseTallCsv(file: string, agg: SkinnyAggregator): Promise<void> {
  let header: string[] | null = null;
  let rowNo = 0;
  const seenGross = new Set<string>();
  await new Promise<void>((resolve, rejectP) => {
    Papa.parse<string[]>(openSource(file, "utf8"), {
      skipEmptyLines: true,
      chunkSize: 1 << 20,
      chunk: (results, parserHandle) => {
        parserHandle.pause();
        try {
          for (const row of results.data as unknown as string[][]) {
            rowNo++;
            if (rowNo <= 2) continue;
            if (rowNo === 3) {
              header = row.map((h) => h.trim());
              continue;
            }
            if (!header) continue;
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
            if (!primary.code || !description) continue;
            const itemKey = `${primary.code}|${description}`;
            if (!seenGross.has(itemKey)) {
              seenGross.add(itemKey);
              addMoney(agg, primary.code, primary.kind, description, "gross", g("standard_charge|gross"));
              addMoney(agg, primary.code, primary.kind, description, "cash", g("standard_charge|discounted_cash"));
            }
            if (g("payer_name")) {
              addMoney(agg, primary.code, primary.kind, description, "negotiated", g("standard_charge|negotiated_dollar"));
            }
          }
          parserHandle.resume();
        } catch (err) {
          rejectP(err);
        }
      },
      complete: () => resolve(),
      error: (err) => rejectP(err),
    });
  });
}

async function parseWideCsv(file: string, agg: SkinnyAggregator): Promise<void> {
  let header: string[] | null = null;
  let idx: Record<string, number> = {};
  const dollarIdx: number[] = [];
  let rowNo = 0;
  await new Promise<void>((resolve, rejectP) => {
    Papa.parse<string[]>(openSource(file, "utf8"), {
      skipEmptyLines: true,
      chunkSize: 1 << 20,
      chunk: (results, parserHandle) => {
        parserHandle.pause();
        try {
          for (const row of results.data as unknown as string[][]) {
            rowNo++;
            if (rowNo <= 2) continue;
            if (rowNo === 3) {
              header = row.map((h) => h.trim());
              idx = Object.fromEntries(header.map((h, i) => [h, i]));
              header.forEach((h, i) => {
                if (/^standard_charge\|[^|]+\|[^|]+\|negotiated_dollar$/.test(h)) dollarIdx.push(i);
              });
              continue;
            }
            if (!header) continue;
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
            if (!primary.code || !description) continue;
            addMoney(agg, primary.code, primary.kind, description, "gross", g("standard_charge|gross"));
            addMoney(agg, primary.code, primary.kind, description, "cash", g("standard_charge|discounted_cash"));
            for (const i of dollarIdx) addMoney(agg, primary.code, primary.kind, description, "negotiated", row[i]);
          }
          parserHandle.resume();
        } catch (err) {
          rejectP(err);
        }
      },
      complete: () => resolve(),
      error: (err) => rejectP(err),
    });
  });
}

async function copyIndex(
  client: Client,
  hospitalId: string,
  objectKey: string,
  asOfIso: string | null,
  rows: ReturnType<SkinnyAggregator["toRows"]>,
): Promise<number> {
  await client.query(`DELETE FROM "PriceIndex" WHERE "hospitalId" = $1`, [hospitalId]);
  if (!rows.length) return 0;
  const stream = client.query(
    copyFrom(
      `COPY "PriceIndex" (id, "hospitalId", code, "codeKind", description, "listCents", "cashCents", "negotiatedCents", "negotiatedMinCents", "negotiatedMaxCents", "sampleCount", "objectKey", "asOf", "ingestedAt") FROM STDIN WITH (FORMAT csv)`,
    ),
  );
  const now = new Date().toISOString();
  let i = 0;
  const write = (line: string) =>
    new Promise<void>((resolve, reject) => {
      const ok = stream.write(line, (err) => (err ? reject(err) : undefined));
      if (ok) resolve();
      else stream.once("drain", resolve);
    });
  for (const r of rows) {
    if (r.listCents == null && r.cashCents == null && r.negotiatedCents == null) continue;
    i++;
    await write(
      [
        csvField(randomUUID()),
        csvField(hospitalId),
        csvField(r.code.slice(0, 60)),
        csvField(r.codeKind),
        csvField(r.description),
        r.listCents ?? "",
        r.cashCents ?? "",
        r.negotiatedCents ?? "",
        r.negotiatedMinCents ?? "",
        r.negotiatedMaxCents ?? "",
        String(r.sampleCount),
        csvField(objectKey),
        asOfIso ? csvField(asOfIso) : "",
        csvField(now),
      ].join(",") + "\n",
    );
  }
  await new Promise<void>((resolve, reject) => {
    stream.once("error", reject);
    stream.once("finish", () => resolve());
    stream.end();
  });
  return i;
}

async function ingestOne(client: Client, mrf: PreferredMrf, workDir: string, dryRun: boolean): Promise<void> {
  const shopper = SHOPPER_HOSPITALS.find((h) => h.id === mrf.shopperId);
  if (!shopper) throw new Error(`Unknown shopper ${mrf.shopperId}`);
  const expect = HEADER_EXPECT[mrf.shopperId];
  if (!expect) throw new Error(`No header expectation for ${mrf.shopperId}`);

  const dest = path.join(workDir, path.basename(mrf.objectKey));
  console.log(`[${mrf.shopperId}] downloading ${mrf.objectKey} (${(mrf.sizeBytes / 1e6).toFixed(1)} MB)`);
  const cfg = storageConfigFromEnv();
  const t0 = Date.now();
  await getObjectToFile(cfg, mrf.objectKey, dest);
  console.log(`[${mrf.shopperId}] downloaded in ${Math.round((Date.now() - t0) / 1000)}s (${(statSync(dest).size / 1e6).toFixed(1)} MB on disk)`);

  const header = await sniffIdentity(dest);
  const identityBlob = `${header.name ?? ""} ${header.location ?? ""}`;
  if (!expect.test(identityBlob)) {
    throw new Error(`IDENTITY MISMATCH: header "${identityBlob.trim()}" vs ${expect} for ${mrf.shopperId}`);
  }
  console.log(`[${mrf.shopperId}] header OK: "${identityBlob.trim()}" format=${header.format} asOf=${header.asOfIso ?? "unknown"}`);

  if (dryRun) {
    console.log(`[${mrf.shopperId}] --dry-run: not writing PriceIndex`);
    return;
  }

  const agg = new SkinnyAggregator();
  const t1 = Date.now();
  if (header.format === "json") await parseJson(dest, agg);
  else if (header.format === "csv-wide") await parseWideCsv(dest, agg);
  else await parseTallCsv(dest, agg);
  const skinny = agg.toRows();
  console.log(`[${mrf.shopperId}] parsed in ${Math.round((Date.now() - t1) / 1000)}s samples=${agg.accepted} codes=${skinny.length}`);

  await ensureShopperHospital(
    client,
    { id: shopper.id, name: shopper.name, address: shopper.address, cmsCcn: shopper.cmsCcn },
    mrf.objectKey,
  );
  const inserted = await copyIndex(client, shopper.id, mrf.objectKey, header.asOfIso, skinny);
  console.log(`[${mrf.shopperId}] PriceIndex rows=${inserted}`);
}

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");
  const onlyArg = args.find((a) => a.startsWith("--only="));
  const only = onlyArg ? new Set(onlyArg.slice(7).split(",").filter(Boolean)) : null;

  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) throw new Error("DATABASE_URL required");

  const cfg = storageConfigFromEnv();
  console.log(`Reading ${MASTER_INDEX_KEY} from s3://${cfg.bucket}`);
  const csv = await getObjectText(cfg, MASTER_INDEX_KEY);
  const catalog = parseMasterIndexCsv(csv);
  let targets = preferredHospitalMrfs(catalog);
  if (only) targets = targets.filter((t) => only.has(t.shopperId) || only.has(t.hospitalSlug));
  console.log(`Preferred hospital MRFs: ${targets.length}`);
  for (const t of targets) {
    console.log(`  - ${t.shopperId} ← ${t.objectKey} (${(t.sizeBytes / 1e6).toFixed(1)} MB)`);
  }
  if (!targets.length) return;

  const client = new Client({ connectionString: dbUrl });
  await client.connect();
  const workDir = mkdtempSync(path.join(tmpdir(), "sfc-lake-"));
  try {
    for (const mrf of targets) {
      try {
        await ingestOne(client, mrf, workDir, dryRun);
      } catch (err) {
        console.error(`[${mrf.shopperId}] FAILED`, err);
        throw err;
      } finally {
        try {
          rmSync(path.join(workDir, path.basename(mrf.objectKey)), { force: true });
        } catch {
          /* ignore */
        }
      }
    }
  } finally {
    rmSync(workDir, { recursive: true, force: true });
    await client.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
