/**
 * List files in data/mrf-drop without ingesting prices.
 *
 *   npx tsx scripts/inventory-mrf-drop.ts
 */
import { createHash } from "node:crypto";
import { createReadStream, existsSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { SHOPPER_HOSPITALS } from "../src/lib/price-transparency/shopper-hospitals";

const ROOT = path.join(process.cwd(), "data/mrf-drop");
const SKIP = new Set(["README.md", ".gitkeep"]);

function sha256Prefix(filePath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = createHash("sha256");
    const stream = createReadStream(filePath);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("error", reject);
    stream.on("end", () => resolve(hash.digest("hex").slice(0, 12)));
  });
}

async function listDir(rel: string) {
  const abs = path.join(ROOT, rel);
  if (!existsSync(abs) || !statSync(abs).isDirectory()) return [];
  const names = readdirSync(abs).filter((n) => !SKIP.has(n) && !n.startsWith("."));
  const out = [];
  for (const name of names) {
    const full = path.join(abs, name);
    const st = statSync(full);
    if (st.isDirectory()) continue;
    out.push({
      folder: rel,
      filename: name,
      bytes: st.size,
      mb: Math.round((st.size / (1024 * 1024)) * 10) / 10,
      sha256_12: await sha256Prefix(full),
    });
  }
  return out;
}

async function main() {
  const folders = ["inbox", ...SHOPPER_HOSPITALS.map((h) => h.id)];
  const rows = [];
  for (const folder of folders) {
    rows.push(...(await listDir(folder)));
  }

  const byFolder = new Map<string, number>();
  for (const row of rows) byFolder.set(row.folder, (byFolder.get(row.folder) ?? 0) + 1);

  console.log(JSON.stringify({
    dropRoot: ROOT,
    files: rows,
    emptyFolders: folders.filter((f) => !byFolder.has(f)),
    note: "Inventory only. No prices were written.",
  }, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
