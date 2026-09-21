/**
 * Download CDC/NCHS ICD-10-CM code descriptions for a fiscal year and write
 * data/authoritative/icd10cm-codes.json
 *
 * Usage: npx tsx scripts/sync-cdc-icd10cm.ts [fy]
 */
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import JSZip from "jszip";
import { listCdcIcd10CmFiles, parseIcd10CmOrderLine, DEFAULT_ICD10CM_FY } from "../src/lib/authoritative/cdc-icd10cm";

async function main() {
  const fy = process.argv[2] || DEFAULT_ICD10CM_FY;
  const files = await listCdcIcd10CmFiles(fy);
  if (!files.length) {
    throw new Error(`CDC listing for FY${fy} returned no files`);
  }

  const zipFile = files.find((f) => /code\s*descriptions/i.test(f.name) && /\.zip$/i.test(f.name));
  if (!zipFile) {
    console.error("Files CDC published:");
    for (const f of files) console.error(`  ${f.name}  ${f.href}`);
    throw new Error("No Code Descriptions ZIP in the CDC listing");
  }

  console.log(`Downloading ${zipFile.name} (${zipFile.bytes ?? "?"} bytes)`);
  const res = await fetch(zipFile.href);
  if (!res.ok) throw new Error(`Download HTTP ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  const zip = await JSZip.loadAsync(buf);
  const txtName = Object.keys(zip.files).find((n) => /order/i.test(n) && /\.txt$/i.test(n))
    ?? Object.keys(zip.files).find((n) => /\.txt$/i.test(n) && !zip.files[n].dir);
  if (!txtName) throw new Error("ZIP had no .txt codebook");

  const text = await zip.files[txtName].async("string");
  const codes = text
    .split(/\r?\n/)
    .map((line) => parseIcd10CmOrderLine(line, fy))
    .filter((row): row is NonNullable<typeof row> => Boolean(row));

  if (!codes.length) {
    throw new Error(`Parsed 0 codes from ${txtName}; check order-file format`);
  }

  const outDir = path.join(process.cwd(), "data/authoritative");
  await mkdir(outDir, { recursive: true });
  const outPath = path.join(outDir, "icd10cm-codes.json");
  await writeFile(outPath, JSON.stringify({ fy, source: zipFile.href, count: codes.length, codes }, null, 0));
  console.log(`Wrote ${codes.length} codes to ${outPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
