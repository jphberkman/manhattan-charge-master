/**
 * Shared ingest primitives for the 2026-09 per-campus MRF re-ingest.
 *
 * Rules enforced here:
 *  - Hospital identity comes from the FILE HEADER (name/NPI), never the filename.
 *  - Sentinel amounts (>= $9,999,999 or "999999999"-style) are rejected, not stored.
 *  - Every row carries sourceFileId + asOf + code/codeKind/description provenance.
 */
import { randomUUID } from "node:crypto";
import { Client } from "pg";
import { from as copyFrom } from "pg-copy-streams";

export interface ChargeRow {
  payerName: string;
  payerClass: string; // gross | cash | commercial | medicare | medicaid | other
  priceType: string; // gross | cash | negotiated
  priceCents: number;
  planName: string | null;
  code: string;
  codeKind: string;
  rawCode: string;
  description: string;
  methodology: string | null;
  billingClass: string | null;
  setting: string | null;
  minCents: number | null;
  maxCents: number | null;
  medianCents: number | null;
}

export interface IngestStats {
  discovered: number;
  inserted: number;
  rejected: number;
  rejectReasons: Record<string, number>;
}

// ── Money ────────────────────────────────────────────────────────────────────

/** Max believable single charge: $9,999,999. Above this = sentinel/garbage. */
const MAX_CENTS = 999_999_900;

export function parseMoneyCents(raw: unknown): number | null {
  if (raw === null || raw === undefined) return null;
  const s = String(raw).replace(/[$,\s]/g, "");
  if (!s || s.toLowerCase() === "n/a" || s.toLowerCase() === "null") return null;
  const v = Number(s);
  if (!Number.isFinite(v) || v <= 0) return null;
  const cents = Math.round(v * 100);
  if (cents > MAX_CENTS) return null; // sentinel (e.g. 999999999.00 in Lenox Hill file)
  return cents;
}

// ── Payer classification ────────────────────────────────────────────────────

const MEDICARE_RE = /\bmedicare\b|medicare advantage|\bma\b.*(hmo|ppo)|senior|dsnp|d-snp/i;
const MEDICAID_RE = /medicaid|chp\b|child health plus|essential plan|harp|family health plus|fidelis.*medicaid|metroplus(?!.*medicare)/i;
const CASH_RE = /self[- ]?pay|cash|uninsured/i;

export function classifyPayer(payerName: string, planName?: string | null): string {
  const hay = `${payerName} ${planName ?? ""}`;
  if (CASH_RE.test(hay)) return "cash";
  if (MEDICARE_RE.test(hay)) return "medicare";
  if (MEDICAID_RE.test(hay)) return "medicaid";
  return "commercial";
}

// ── Code classification ─────────────────────────────────────────────────────

const CODE_KIND_RANK: Record<string, number> = {
  "cpt-shaped": 0,
  "hcpcs-level-2": 1,
  "ms-drg": 2,
  "apr-drg": 3,
  apc: 4,
  rc: 5,
  ndc: 6,
  cdm: 7,
  local: 8,
  unknown: 9,
};

export function normalizeCodeType(fileType: string, code: string): string {
  const t = fileType.trim().toUpperCase();
  if (t === "CPT") return /^\d{5}$/.test(code) ? "cpt-shaped" : "local";
  if (t === "HCPCS") return /^[A-Z]\d{4}$/i.test(code) ? "hcpcs-level-2" : /^\d{5}$/.test(code) ? "cpt-shaped" : "local";
  if (t === "MS-DRG" || t === "MSDRG" || t === "DRG") return "ms-drg";
  if (t === "APR-DRG" || t === "APRDRG") return "apr-drg";
  if (t === "APC") return "apc";
  if (t === "RC" || t === "REV" || t === "REVENUE") return "rc";
  if (t === "NDC") return "ndc";
  if (t === "CDM" || t === "EAPG" || t === "LOCAL" || t === "ICD") return t === "CDM" ? "cdm" : "local";
  return "unknown";
}

export interface CodeCandidate {
  code: string;
  kind: string;
}

/** Pick the most standard code from a set of (code, fileType) pairs. */
export function pickPrimaryCode(cands: CodeCandidate[]): CodeCandidate {
  const valid = cands.filter((c) => c.code);
  if (!valid.length) return { code: "", kind: "unknown" };
  return valid.slice().sort((a, b) => (CODE_KIND_RANK[a.kind] ?? 9) - (CODE_KIND_RANK[b.kind] ?? 9))[0];
}

export function joinRawCodes(cands: CodeCandidate[]): string {
  return cands
    .filter((c) => c.code)
    .map((c) => `${c.kind}:${c.code}`)
    .join("|")
    .slice(0, 250);
}

// ── COPY loader ─────────────────────────────────────────────────────────────

const COPY_COLUMNS = [
  "id",
  "hospitalId",
  "payerName",
  "payerType",
  "priceInCents",
  "priceType",
  "rawCode",
  "source",
  "sourceFileId",
  "asOf",
  "code",
  "codeKind",
  "description",
  "planName",
  "methodology",
  "billingClass",
  "setting",
  "minCents",
  "maxCents",
  "medianCents",
];

function csvField(v: string | number | null): string {
  if (v === null || v === undefined) return "";
  const s = String(v);
  return `"${s.replace(/"/g, '""').replace(/\r?\n/g, " ")}"`;
}

export class PriceCopyLoader {
  private buf: string[] = [];
  private stream: NodeJS.WritableStream | null = null;
  inserted = 0;

  constructor(
    private client: Client,
    private hospitalId: string,
    private sourceFileId: string,
    private asOfIso: string | null,
    private sourceTag: string,
  ) {}

  async start() {
    const cols = COPY_COLUMNS.map((c) => `"${c}"`).join(", ");
    this.stream = this.client.query(
      copyFrom(`COPY "PriceEntry" (${cols}) FROM STDIN WITH (FORMAT csv)`),
    );
  }

  private writeLine(line: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const ok = this.stream!.write(line, (err) => (err ? reject(err) : undefined));
      if (ok) resolve();
      else this.stream!.once("drain", resolve);
    });
  }

  async add(row: ChargeRow): Promise<void> {
    const line =
      [
        csvField(randomUUID()),
        csvField(this.hospitalId),
        csvField(row.payerName.slice(0, 200)),
        csvField(row.payerClass),
        String(row.priceCents),
        csvField(row.priceType),
        csvField(row.rawCode),
        csvField(this.sourceTag),
        csvField(this.sourceFileId),
        this.asOfIso ? csvField(this.asOfIso) : "",
        csvField(row.code.slice(0, 60)),
        csvField(row.codeKind),
        csvField(row.description.slice(0, 800)),
        row.planName ? csvField(row.planName.slice(0, 200)) : "",
        row.methodology ? csvField(row.methodology.slice(0, 200)) : "",
        row.billingClass ? csvField(row.billingClass.slice(0, 40)) : "",
        row.setting ? csvField(row.setting.slice(0, 40)) : "",
        row.minCents !== null ? String(row.minCents) : "",
        row.maxCents !== null ? String(row.maxCents) : "",
        row.medianCents !== null ? String(row.medianCents) : "",
      ].join(",") + "\n";
    this.inserted++;
    this.buf.push(line);
    if (this.buf.length >= 2000) {
      const chunk = this.buf.join("");
      this.buf = [];
      await this.writeLine(chunk);
    }
  }

  async finish(): Promise<number> {
    if (this.buf.length) {
      await this.writeLine(this.buf.join(""));
      this.buf = [];
    }
    await new Promise<void>((resolve, reject) => {
      this.stream!.once("error", reject);
      this.stream!.once("finish", () => resolve());
      this.stream!.end();
    });
    return this.inserted;
  }
}

// ── SourceFile + Hospital bookkeeping (plain SQL, same connection kind) ─────

export async function ensureShopperHospital(
  client: Client,
  h: { id: string; name: string; address: string; cmsCcn: string | null },
  sourceFile: string,
): Promise<void> {
  await client.query(
    `INSERT INTO "Hospital" (id, name, address, borough, "sourceFile", "lastSeeded", "cmsProviderId", "createdAt", "updatedAt")
     VALUES ($1, $2, $3, 'Manhattan', $4, NOW(), $5, NOW(), NOW())
     ON CONFLICT (id) DO UPDATE SET name = $2, address = $3, "sourceFile" = $4, "lastSeeded" = NOW(), "cmsProviderId" = $5, "updatedAt" = NOW()`,
    [h.id, h.name, h.address, sourceFile, h.cmsCcn],
  );
}

export async function startSourceFileSql(
  client: Client,
  input: {
    filename: string;
    sha256: string;
    bytes: number;
    hospitalKey: string;
    format: string;
    parser: string;
    headerName: string | null;
    headerLocation: string | null;
    headerNpi: string | null;
    asOfIso: string | null;
  },
): Promise<string> {
  const id = randomUUID();
  await client.query(
    `INSERT INTO "SourceFile" (id, filename, sha256, bytes, "hospitalKey", format, parser, "headerName", "headerLocation", "headerNpi", "asOf", status, "createdAt", "updatedAt")
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'processing',NOW(),NOW())`,
    [
      id,
      input.filename,
      input.sha256,
      input.bytes > 2_000_000_000 ? null : input.bytes,
      input.hospitalKey,
      input.format,
      input.parser,
      input.headerName,
      input.headerLocation,
      input.headerNpi,
      input.asOfIso,
    ],
  );
  return id;
}

export async function finishSourceFileSql(
  client: Client,
  id: string,
  stats: IngestStats,
  status: "processed" | "failed",
  errorMessage?: string,
): Promise<void> {
  await client.query(
    `UPDATE "SourceFile" SET status=$2, "rowsDiscovered"=$3, "rowsInserted"=$4, "rowsRejected"=$5, "errorMessage"=$6, "ingestedAt"=NOW(), "updatedAt"=NOW() WHERE id=$1`,
    [id, status, stats.discovered, stats.inserted, stats.rejected, errorMessage ?? null],
  );
}

/** Idempotency: remove any earlier ingest rows for this hospital+source tag. */
export async function deletePriorIngest(
  client: Client,
  hospitalId: string,
  sourceTag: string,
): Promise<number> {
  const res = await client.query(
    `DELETE FROM "PriceEntry" WHERE "hospitalId" = $1 AND source = $2`,
    [hospitalId, sourceTag],
  );
  await client.query(`DELETE FROM "ServiceDescription" WHERE "hospitalId" = $1`, [hospitalId]);
  return res.rowCount ?? 0;
}

export function reject(stats: IngestStats, reason: string): void {
  stats.rejected++;
  stats.rejectReasons[reason] = (stats.rejectReasons[reason] ?? 0) + 1;
}
