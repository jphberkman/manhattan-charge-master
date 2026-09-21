/**
 * Consumer read model over the 2026-09 per-campus ingest.
 * Reads PriceSummary/ServiceDescription only — never scans PriceEntry.
 */
import { prisma } from "@/lib/prisma";
import { Prisma } from "@/generated/prisma";
import { SHOPPER_HOSPITALS } from "./shopper-hospitals";

export interface HospitalPriceSummary {
  hospitalId: string;
  grossMedian: number | null; // dollars
  cashMedian: number | null;
  negotiatedMedianByClass: Partial<Record<string, number>>;
  minDollars: number | null;
  maxDollars: number | null;
  latestAsOf: string | null;
}

export interface DescriptionSearchHit {
  code: string;
  codeKind: string;
  description: string;
  hospitalCount: number;
  rank: number;
}

const SHOPPER_IDS = SHOPPER_HOSPITALS.map((h) => h.id);

/** Per-shopper-hospital price summary for one billing code. */
export async function getPriceSummariesForCode(code: string): Promise<HospitalPriceSummary[]> {
  const rows = await prisma.priceSummary.findMany({
    where: { code, hospitalId: { in: SHOPPER_IDS } },
  });

  const byHospital = new Map<string, HospitalPriceSummary>();
  for (const r of rows) {
    let h = byHospital.get(r.hospitalId);
    if (!h) {
      h = {
        hospitalId: r.hospitalId,
        grossMedian: null,
        cashMedian: null,
        negotiatedMedianByClass: {},
        minDollars: null,
        maxDollars: null,
        latestAsOf: null,
      };
      byHospital.set(r.hospitalId, h);
    }
    const median = Math.round(r.medianCents / 100);
    if (r.priceType === "gross") h.grossMedian = median;
    else if (r.priceType === "cash") h.cashMedian = median;
    else if (r.priceType === "negotiated") h.negotiatedMedianByClass[r.payerClass] = median;

    const minD = Math.round(r.minCents / 100);
    const maxD = Math.round(r.maxCents / 100);
    h.minDollars = h.minDollars === null ? minD : Math.min(h.minDollars, minD);
    h.maxDollars = h.maxDollars === null ? maxD : Math.max(h.maxDollars, maxD);
    const asOf = r.latestAsOf?.toISOString() ?? null;
    if (asOf && (!h.latestAsOf || asOf > h.latestAsOf)) h.latestAsOf = asOf;
  }
  return [...byHospital.values()];
}

/** Payer-specific negotiated medians for one code (uses (hospitalId, code) index). */
export async function getPayerSpecificMedians(
  code: string,
  payerNeedle: string,
): Promise<Map<string, { median: number; payerName: string }>> {
  const pattern = `%${payerNeedle.split(" ")[0].toLowerCase()}%`;
  const rows = await prisma.$queryRaw<
    { hospitalId: string; median: number | null; payerName: string | null }[]
  >`
    SELECT "hospitalId",
           (PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY "priceInCents"))::float8 AS median,
           MIN("payerName") AS "payerName"
    FROM "PriceEntry"
    WHERE "hospitalId" IN (${Prisma.join(SHOPPER_IDS)})
      AND code = ${code}
      AND "sourceFileId" IS NOT NULL
      AND "priceType" = 'negotiated'
      AND LOWER("payerName") LIKE ${pattern}
    GROUP BY "hospitalId"
  `;
  const out = new Map<string, { median: number; payerName: string }>();
  for (const r of rows) {
    if (r.median != null) {
      out.set(r.hospitalId, {
        median: Math.round(Number(r.median) / 100),
        payerName: r.payerName ?? payerNeedle,
      });
    }
  }
  return out;
}

/** Full-text search over hospital service descriptions (fresh corpus only). */
export async function searchServiceDescriptions(
  query: string,
  limit = 12,
): Promise<DescriptionSearchHit[]> {
  const q = query.trim();
  if (!q) return [];
  const rows = await prisma.$queryRaw<
    { code: string; codeKind: string; description: string; hospitalCount: bigint; rank: number }[]
  >`
    SELECT code,
           MIN("codeKind") AS "codeKind",
           MIN(description) AS description,
           COUNT(DISTINCT "hospitalId") AS "hospitalCount",
           MAX(ts_rank(to_tsvector('english', description), websearch_to_tsquery('english', ${q})))::float8 AS rank
    FROM "ServiceDescription"
    WHERE to_tsvector('english', description) @@ websearch_to_tsquery('english', ${q})
    GROUP BY code
    ORDER BY rank DESC, "hospitalCount" DESC
    LIMIT ${limit}
  `;
  return rows.map((r) => ({
    code: r.code,
    codeKind: r.codeKind,
    description: r.description,
    hospitalCount: Number(r.hospitalCount),
    rank: Number(r.rank),
  }));
}

/** Does any fresh summary exist for these codes? Returns the subset that do. */
export async function codesWithFreshPrices(codes: string[]): Promise<Set<string>> {
  if (!codes.length) return new Set();
  const rows = await prisma.priceSummary.findMany({
    where: { code: { in: codes }, hospitalId: { in: SHOPPER_IDS } },
    select: { code: true },
    distinct: ["code"],
  });
  return new Set(rows.map((r) => r.code));
}
