/**
 * Consumer read model.
 * Prefers PriceSummary (payer-class split) over PriceIndex.
 * PriceIndex is overlay for warehouse provenance + fallback when summaries
 * are missing. Never scans PriceEntry or opens warehouse objects on the request path.
 */
import { prisma } from "@/lib/prisma";
import { Prisma } from "@/generated/prisma";
import { SHOPPER_HOSPITALS } from "./shopper-hospitals";
import { normalizeSearchText } from "./search-text";

export interface HospitalPriceSummary {
  hospitalId: string;
  grossMedian: number | null; // dollars
  cashMedian: number | null;
  negotiatedMedianByClass: Partial<Record<string, number>>;
  minDollars: number | null;
  maxDollars: number | null;
  latestAsOf: string | null;
  warehouseObjectKey?: string;
}

export interface DescriptionSearchHit {
  code: string;
  codeKind: string;
  description: string;
  hospitalCount: number;
  rank: number;
}

const SHOPPER_IDS = SHOPPER_HOSPITALS.map((h) => h.id);
const BILLING_KINDS = ["cpt-shaped", "hcpcs-level-2"] as const;

function dollars(cents: number | null | undefined): number | null {
  return cents == null ? null : Math.round(cents / 100);
}

type IndexRow = {
  hospitalId: string;
  listCents: number | null;
  cashCents: number | null;
  negotiatedCents: number | null;
  commercialCents?: number | null;
  medicareCents?: number | null;
  medicaidCents?: number | null;
  negotiatedMinCents: number | null;
  negotiatedMaxCents: number | null;
  asOf: Date | null;
  objectKey: string;
};

function fromIndexRow(r: IndexRow): HospitalPriceSummary {
  const list = dollars(r.listCents);
  const cash = dollars(r.cashCents);
  const commercial = dollars(r.commercialCents);
  const medicare = dollars(r.medicareCents);
  const medicaid = dollars(r.medicaidCents);
  const byClass: Partial<Record<string, number>> = {};
  if (commercial != null) byClass.commercial = commercial;
  if (medicare != null) byClass.medicare = medicare;
  if (medicaid != null) byClass.medicaid = medicaid;
  // Do not treat blended negotiatedCents as commercial — that is the bug
  // that made NYU Medicare look like H+H cash.
  const minD = dollars(r.negotiatedMinCents);
  const maxD = dollars(r.negotiatedMaxCents);
  const mins = [list, cash, commercial, minD].filter((n): n is number => n != null);
  const maxes = [list, cash, commercial, maxD].filter((n): n is number => n != null);
  return {
    hospitalId: r.hospitalId,
    grossMedian: list,
    cashMedian: cash,
    negotiatedMedianByClass: byClass,
    minDollars: mins.length ? Math.min(...mins) : null,
    maxDollars: maxes.length ? Math.max(...maxes) : null,
    latestAsOf: r.asOf?.toISOString() ?? null,
    warehouseObjectKey: r.objectKey,
  };
}

/** Per-shopper-hospital price summary for one billing code. */
export async function getPriceSummariesForCode(code: string): Promise<HospitalPriceSummary[]> {
  const [summaryRows, indexRows] = await Promise.all([
    prisma.priceSummary.findMany({
      where: { code, hospitalId: { in: SHOPPER_IDS }, codeKind: { in: [...BILLING_KINDS] } },
    }),
    prisma.priceIndex.findMany({
      where: { code, hospitalId: { in: SHOPPER_IDS }, codeKind: { in: [...BILLING_KINDS] } },
    }),
  ]);

  const indexByHospital = new Map(indexRows.map((r) => [r.hospitalId, r as IndexRow]));

  if (summaryRows.length) {
    const byHospital = new Map<string, HospitalPriceSummary>();
    for (const r of summaryRows) {
      let h = byHospital.get(r.hospitalId);
      if (!h) {
        const idx = indexByHospital.get(r.hospitalId);
        h = {
          hospitalId: r.hospitalId,
          grossMedian: null,
          cashMedian: null,
          negotiatedMedianByClass: {},
          minDollars: null,
          maxDollars: null,
          latestAsOf: null,
          warehouseObjectKey: idx?.objectKey,
        };
        byHospital.set(r.hospitalId, h);
      }
      const median = Math.round(r.medianCents / 100);
      if (r.priceType === "gross") h.grossMedian = median;
      else if (r.priceType === "cash") h.cashMedian = median;
      else if (r.priceType === "negotiated") h.negotiatedMedianByClass[r.payerClass] = median;

      const minD = Math.round(r.minCents / 100);
      const maxD = Math.round(r.maxCents / 100);
      if (r.priceType === "negotiated" && r.payerClass === "commercial") {
        h.minDollars = h.minDollars === null ? minD : Math.min(h.minDollars, minD);
        h.maxDollars = h.maxDollars === null ? maxD : Math.max(h.maxDollars, maxD);
      }
      const asOf = r.latestAsOf?.toISOString() ?? null;
      if (asOf && (!h.latestAsOf || asOf > h.latestAsOf)) h.latestAsOf = asOf;
    }
    for (const [hid, idx] of indexByHospital) {
      const h = byHospital.get(hid);
      if (h && !h.warehouseObjectKey) h.warehouseObjectKey = idx.objectKey;
      if (h && !h.latestAsOf && idx.asOf) h.latestAsOf = idx.asOf.toISOString();
    }
    return [...byHospital.values()];
  }

  return indexRows.map((r) => fromIndexRow(r as IndexRow));
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
      AND "codeKind" IN ('cpt-shaped', 'hcpcs-level-2')
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
  const normalized = normalizeSearchText(q);
  if (!normalized) return [];
  const includeNonunion = normalized.includes("nonunion");
  const rows = await prisma.$queryRaw<
    { code: string; codeKind: string; description: string; hospitalCount: bigint; rank: number }[]
  >`
    SELECT code,
           MIN("codeKind") AS "codeKind",
           MIN(description) AS description,
           COUNT(DISTINCT "hospitalId") AS "hospitalCount",
           MAX(ts_rank(to_tsvector('english', description), plainto_tsquery('english', ${normalized})))::float8 AS rank
    FROM "ServiceDescription"
    WHERE "codeKind" IN ('cpt-shaped', 'hcpcs-level-2')
      AND (
        to_tsvector('english', description) @@ plainto_tsquery('english', ${normalized})
        OR (
          ${includeNonunion}
          AND (
            REPLACE(LOWER(description), '-', '') LIKE '%nonunion%'
            OR LOWER(description) LIKE '%nonhealed%'
          )
        )
      )
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
  const [indexRows, summaryRows] = await Promise.all([
    prisma.priceIndex.findMany({
      where: { code: { in: codes }, hospitalId: { in: SHOPPER_IDS }, codeKind: { in: [...BILLING_KINDS] } },
      select: { code: true },
      distinct: ["code"],
    }),
    prisma.priceSummary.findMany({
      where: { code: { in: codes }, hospitalId: { in: SHOPPER_IDS }, codeKind: { in: [...BILLING_KINDS] } },
      select: { code: true },
      distinct: ["code"],
    }),
  ]);
  return new Set([...indexRows, ...summaryRows].map((r) => r.code));
}
