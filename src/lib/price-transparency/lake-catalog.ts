/**
 * Catalog of the Neon price-transparency warehouse.
 * Originals live in object storage; this module only parses MASTER_INDEX.
 */

export const NEON_PROJECT_ID = "cool-fire-98130468";
export const NEON_BRANCH_ID = "br-rough-block-aili6snu";
export const NEON_STORAGE_BUCKET = "shopforcare-price-transparency";
export const MASTER_INDEX_KEY = "03-manifests/MASTER_INDEX.csv";
export const NEON_INVENTORY_KEY = "03-manifests/neon_inventory.json";

/** Warehouse hospital_slug → ShopForCare shopper hospital id. */
export const WAREHOUSE_SLUG_TO_SHOPPER: Record<string, string> = {
  "hhc-bellevue": "hhc-bellevue",
  "hhc-harlem": "hhc-harlem",
  "hhc-metropolitan": "hhc-metropolitan",
  hss: "hss",
  "lenox-hill": "lenox-hill",
  "mount-sinai-hospital": "mount-sinai",
  "mount-sinai-morningside": "mount-sinai-morningside",
  msk: "msk",
  "nyu-tisch": "nyu-langone",
};

export interface MasterIndexRow {
  objectKey: string;
  sizeBytes: number;
  sha256: string;
  hospitalSlug: string;
  borough: string;
  sourceMrfUrl: string;
  neonPresent: boolean;
}

export interface PreferredMrf {
  objectKey: string;
  sizeBytes: number;
  sha256: string;
  hospitalSlug: string;
  shopperId: string;
}

export interface CatalogDecision {
  row: MasterIndexRow;
  action: "ingest" | "skip";
  reason: string;
  shopperId?: string;
}

const MRF_RE = /standardcharges\.(csv|json|bin)(\.gz)?$|standardcharges\.(zip|json\.zip)$/i;
const SKIP_NAME_RE = /\.(txt|html|pdf|tsv|md)$/i;

export function parseMasterIndexCsv(csv: string): MasterIndexRow[] {
  const lines = csv.replace(/^\uFEFF/, "").split(/\r?\n/).filter((l) => l.trim());
  if (!lines.length) return [];
  const header = splitCsvLine(lines[0]).map((h) => h.trim());
  const idx = (name: string) => header.indexOf(name);
  const iKey = idx("object_key");
  const iSize = idx("size_bytes");
  const iSha = idx("sha256");
  const iSlug = idx("hospital_slug");
  const iBorough = idx("borough");
  const iUrl = idx("source_mrf_url");
  const iNeon = idx("neon_present");
  const rows: MasterIndexRow[] = [];
  for (const line of lines.slice(1)) {
    const cols = splitCsvLine(line);
    const objectKey = cols[iKey] ?? "";
    if (!objectKey) continue;
    rows.push({
      objectKey,
      sizeBytes: Number(cols[iSize] || 0),
      sha256: cols[iSha] ?? "",
      hospitalSlug: cols[iSlug] ?? "",
      borough: cols[iBorough] ?? "",
      sourceMrfUrl: cols[iUrl] ?? "",
      neonPresent: (cols[iNeon] ?? "").toLowerCase() === "yes",
    });
  }
  return rows;
}

/** CSV split that handles quoted fields (MASTER_INDEX is simple but URLs can contain commas). */
export function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"' && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        cur += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      out.push(cur);
      cur = "";
    } else {
      cur += ch;
    }
  }
  out.push(cur);
  return out;
}

export function decideCatalogRow(row: MasterIndexRow): CatalogDecision {
  if (!row.neonPresent) {
    return { row, action: "skip", reason: "not in Neon" };
  }
  if (row.objectKey.startsWith("02-insurance-tic/")) {
    return { row, action: "skip", reason: "TiC payer file (v1 skips indexes and multi-GB in-network blobs)" };
  }
  if (row.objectKey.startsWith("00-README/") || row.objectKey.startsWith("03-manifests/") || row.objectKey.includes("/_index/")) {
    return { row, action: "skip", reason: "catalog/docs, not an MRF" };
  }
  if (SKIP_NAME_RE.test(row.objectKey) || /README|SOURCE\.txt/i.test(row.objectKey)) {
    return { row, action: "skip", reason: "notes/README (including sister-campus share files)" };
  }
  if (row.sizeBytes > 2_000_000_000) {
    return { row, action: "skip", reason: "object > 2GB (v1 skip)" };
  }
  const shopperId = WAREHOUSE_SLUG_TO_SHOPPER[row.hospitalSlug];
  if (!shopperId) {
    return { row, action: "skip", reason: `slug ${row.hospitalSlug} is not a ShopForCare preferred hospital` };
  }
  if (!MRF_RE.test(row.objectKey)) {
    return { row, action: "skip", reason: "not a standardcharges MRF" };
  }
  return { row, action: "ingest", reason: "preferred hospital MRF", shopperId };
}

export function preferredHospitalMrfs(rows: MasterIndexRow[]): PreferredMrf[] {
  const byShopper = new Map<string, PreferredMrf>();
  for (const row of rows) {
    const d = decideCatalogRow(row);
    if (d.action !== "ingest" || !d.shopperId) continue;
    const prev = byShopper.get(d.shopperId);
    if (!prev || row.sizeBytes > prev.sizeBytes) {
      byShopper.set(d.shopperId, {
        objectKey: row.objectKey,
        sizeBytes: row.sizeBytes,
        sha256: row.sha256,
        hospitalSlug: row.hospitalSlug,
        shopperId: d.shopperId,
      });
    }
  }
  return [...byShopper.values()].sort((a, b) => a.sizeBytes - b.sizeBytes);
}
