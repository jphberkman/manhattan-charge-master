import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@/generated/prisma";
import { redis } from "@/lib/redis";
import { getBestMedicareBenchmark } from "@/lib/medicare";
import type { MedicareBenchmark } from "@/lib/medicare";

export const maxDuration = 60;

// ── Types ──────────────────────────────────────────────────────────────────────

export interface HospitalComparisonEntry {
  hospital: { id: string; name: string; address: string };
  chargemasterPrice: number | null;
  insuranceRate: number | null;
  patientCost: number | null;
  insurerPays: number | null;
  cashPrice: number | null;
  payerName: string | null;
  dataQuality: "real" | "partial";
  isAiEstimate: boolean;
  dataLastUpdated: string | null;
  rank: number;
}

export interface CompareResponse {
  entries: HospitalComparisonEntry[];
  medicare: MedicareBenchmark | null;
}

// ── Constants ─────────────────────────────────────────────────────────────────

/** All major Manhattan hospitals — the fixed comparison universe. */
const MANHATTAN_HOSPITALS = [
  { id: "nyu-langone",      name: "NYU Langone Health (Tisch Hospital)",              address: "550 1st Ave, New York, NY 10016" },
  { id: "nyu-orthopedic",   name: "NYU Langone Orthopedic Hospital",                  address: "301 E 17th St, New York, NY 10003" },
  { id: "nyp-cornell",      name: "NewYork-Presbyterian / Weill Cornell",             address: "525 E 68th St, New York, NY 10065" },
  { id: "nyp-columbia",     name: "NYP / Columbia University Irving Medical Center",  address: "622 W 168th St, New York, NY 10032" },
  { id: "mount-sinai",      name: "The Mount Sinai Hospital",                         address: "One Gustave L. Levy Pl, New York, NY 10029" },
  { id: "mount-sinai-west", name: "Mount Sinai West",                                 address: "1000 10th Ave, New York, NY 10019" },
  { id: "msk",              name: "Memorial Sloan Kettering Cancer Center",           address: "1275 York Ave, New York, NY 10065" },
  { id: "lenox-hill",       name: "Lenox Hill Hospital (Northwell)",                  address: "100 E 77th St, New York, NY 10075" },
  { id: "hss",              name: "Hospital for Special Surgery",                     address: "535 E 70th St, New York, NY 10021" },
  { id: "bellevue",         name: "Bellevue Hospital Center",                         address: "462 1st Ave, New York, NY 10016" },
] as const;

/** Maps DB hospital names (lowercased) to canonical IDs. */
const DB_NAME_TO_CANONICAL: Record<string, string> = {
  "nyu langone health (tisch hospital)": "nyu-langone",
  "nyu langone health": "nyu-langone",
  "nyu langone": "nyu-langone",
  "nyu langone orthopedic hospital": "nyu-orthopedic",
  "nyu langone orthopedic": "nyu-orthopedic",
  "newyork-presbyterian weill cornell medical center": "nyp-cornell",
  "new york-presbyterian weill cornell": "nyp-cornell",
  "nyp weill cornell": "nyp-cornell",
  "weill cornell": "nyp-cornell",
  "newyork-presbyterian columbia university irving medical center": "nyp-columbia",
  "nyp columbia": "nyp-columbia",
  "columbia university irving medical center": "nyp-columbia",
  "the mount sinai hospital": "mount-sinai",
  "mount sinai hospital": "mount-sinai",
  "mount sinai": "mount-sinai",
  "mount sinai morningside": "mount-sinai-west",
  "mount sinai west": "mount-sinai-west",
  "memorial sloan kettering cancer center": "msk",
  "memorial sloan-kettering": "msk",
  "msk": "msk",
  "hospital for special surgery": "hss",
  "hss": "hss",
  "lenox hill hospital": "lenox-hill",
  "lenox hill hospital (northwell)": "lenox-hill",
  "northwell lenox hill": "lenox-hill",
  "bellevue hospital center": "bellevue",
  "bellevue hospital": "bellevue",
  "nyc health + hospitals": "bellevue",
  "nyc health and hospitals": "bellevue",
  "new york city health and hospitals": "bellevue",
};

/** Minimum price in cents to include (filters out $1 lab fragments). */
const MIN_CENTS = 10000; // $100

// ── Helpers ───────────────────────────────────────────────────────────────────

function resolveCanonicalId(rawName: string): string | null {
  const lower = rawName.toLowerCase().trim();
  if (DB_NAME_TO_CANONICAL[lower]) return DB_NAME_TO_CANONICAL[lower];
  if (lower.includes("|")) {
    for (const segment of lower.split("|")) {
      const s = segment.trim();
      if (DB_NAME_TO_CANONICAL[s]) return DB_NAME_TO_CANONICAL[s];
      const match = Object.entries(DB_NAME_TO_CANONICAL).find(([k]) => s.includes(k) || k.includes(s));
      if (match) return match[1];
    }
  }
  const partial = Object.entries(DB_NAME_TO_CANONICAL).find(
    ([k]) => lower.includes(k) || k.includes(lower),
  );
  return partial ? partial[1] : null;
}

// ── Route handler ─────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const startTime = Date.now();
  const { searchParams } = new URL(req.url);
  const cptCode    = searchParams.get("cptCode");
  const payerType  = searchParams.get("payerType");
  const payerName  = searchParams.get("payerName");
  const coinsurance = parseFloat(searchParams.get("coinsurance") ?? "0.20");

  if (!cptCode) return NextResponse.json({ error: "cptCode is required" }, { status: 400 });

  const cacheKey = `compare14:${cptCode}|${payerType ?? ""}|${payerName ?? ""}|${coinsurance}`;
  const cached = await redis.get<CompareResponse>(cacheKey);
  if (cached) return NextResponse.json(cached, {
    headers: { "Cache-Control": "s-maxage=86400, stale-while-revalidate=604800" },
  });

  // 1. Find procedure by CPT code
  const proc = await prisma.procedure.findUnique({
    where: { cptCode },
    select: { id: true, name: true },
  });

  if (!proc) {
    const medicare = getBestMedicareBenchmark([cptCode]);
    const response: CompareResponse = { entries: [], medicare };
    await redis.set(cacheKey, response, { ex: 86400 });
    return NextResponse.json(response);
  }

  // 2. SQL aggregation: per-hospital median prices in one query
  //    This scans the full index instead of loading raw rows into JS.
  const insPayerType = payerType ?? "commercial";
  const payerPattern = payerName ? `%${payerName.split(" ")[0].toLowerCase()}%` : null;

  type AggRow = {
    hospitalId: string;
    hospitalName: string;
    hospitalAddress: string;
    lastSeeded: Date | null;
    medianGross: number | null;
    medianCash: number | null;
    medianInsAll: number | null;
    medianInsSpecific: number | null;
    insPayerNameSample: string | null;
  };

  // Use PERCENTILE_CONT for true medians, FILTER for per-type aggregation
  const rows: AggRow[] = await prisma.$queryRaw`
    SELECT
      h.id              AS "hospitalId",
      h.name            AS "hospitalName",
      h.address         AS "hospitalAddress",
      h."lastSeeded",
      PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY pe."priceInCents")
        FILTER (WHERE pe."priceType" = 'gross'
                AND pe."priceInCents" >= ${MIN_CENTS}::int)
        AS "medianGross",
      PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY pe."priceInCents")
        FILTER (WHERE pe."payerType" = 'cash'
                AND pe."priceInCents" >= ${MIN_CENTS}::int)
        AS "medianCash",
      PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY pe."priceInCents")
        FILTER (WHERE pe."payerType" = ${insPayerType}
                AND pe."priceType" IN ('negotiated', 'discounted')
                AND pe."priceInCents" >= ${MIN_CENTS}::int)
        AS "medianInsAll",
      PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY pe."priceInCents")
        FILTER (WHERE pe."payerType" = ${insPayerType}
                AND pe."priceType" IN ('negotiated', 'discounted')
                AND pe."priceInCents" >= ${MIN_CENTS}::int
                AND LOWER(pe."payerName") LIKE ${payerPattern ?? '%'})
        AS "medianInsSpecific",
      (SELECT pe2."payerName" FROM "PriceEntry" pe2
       WHERE pe2."procedureId" = ${proc.id}
         AND pe2."hospitalId" = h.id
         AND pe2."payerType" = ${insPayerType}
         AND pe2."priceType" IN ('negotiated', 'discounted')
       LIMIT 1) AS "insPayerNameSample"
    FROM "PriceEntry" pe
    JOIN "Hospital" h ON pe."hospitalId" = h.id
    WHERE pe."procedureId" = ${proc.id}
    GROUP BY h.id, h.name, h.address, h."lastSeeded"
    HAVING
      COUNT(*) FILTER (WHERE pe."payerType" = 'cash' AND pe."priceInCents" >= ${MIN_CENTS}::int) > 0
      OR COUNT(*) FILTER (WHERE pe."payerType" = ${insPayerType}
                          AND pe."priceType" IN ('negotiated', 'discounted')
                          AND pe."priceInCents" >= ${MIN_CENTS}::int) > 0
  `;

  // 3. Map raw hospital rows → canonical hospital IDs, merge duplicates
  type MergedHosp = {
    hospital: { id: string; name: string; address: string };
    grossValues: number[];
    cashValues: number[];
    insValues: number[];
    payerName: string | null;
    lastSeeded: Date | null;
  };

  const merged = new Map<string, MergedHosp>();

  for (const row of rows) {
    const canonicalId = resolveCanonicalId(row.hospitalName);
    const key = canonicalId ?? row.hospitalId;
    const canonicalHosp = canonicalId
      ? (MANHATTAN_HOSPITALS.find((h) => h.id === canonicalId) ?? { id: key, name: row.hospitalName, address: row.hospitalAddress })
      : { id: key, name: row.hospitalName, address: row.hospitalAddress };

    if (!merged.has(key)) {
      merged.set(key, {
        hospital: canonicalHosp,
        grossValues: [],
        cashValues: [],
        insValues: [],
        payerName: null,
        lastSeeded: row.lastSeeded,
      });
    }

    const m = merged.get(key)!;
    // Prefer payer-specific rate, fall back to any commercial rate
    const insMedian = row.medianInsSpecific ?? row.medianInsAll;
    if (row.medianGross != null) m.grossValues.push(Number(row.medianGross));
    if (row.medianCash != null)  m.cashValues.push(Number(row.medianCash));
    if (insMedian != null)       m.insValues.push(Number(insMedian));
    if (!m.payerName && row.insPayerNameSample) m.payerName = row.insPayerNameSample;
  }

  // 4. Build comparison entries — only real data, no fabrication
  const entries: HospitalComparisonEntry[] = [];

  for (const m of merged.values()) {
    // Convert from cents to dollars, take median across sub-hospitals
    const grossArr = m.grossValues;
    const cashArr  = m.cashValues;
    const insArr   = m.insValues;

    const chargemasterPrice = grossArr.length
      ? Math.round(grossArr.reduce((a, b) => a + b, 0) / grossArr.length / 100)
      : null;
    const cashPrice = cashArr.length
      ? Math.round(cashArr.reduce((a, b) => a + b, 0) / cashArr.length / 100)
      : null;
    const insuranceRate = insArr.length
      ? Math.round(insArr.reduce((a, b) => a + b, 0) / insArr.length / 100)
      : null;

    // If negotiated rate is higher than chargemaster (data error), discard it
    const validInsRate = insuranceRate != null && chargemasterPrice != null && insuranceRate > chargemasterPrice * 1.5
      ? null
      : insuranceRate;

    // Must have at least one real price to show
    if (validInsRate == null && cashPrice == null) continue;

    const patientCost = validInsRate != null ? Math.round(validInsRate * coinsurance) : null;
    const insurerPays = validInsRate != null ? Math.round(validInsRate * (1 - coinsurance)) : null;

    entries.push({
      hospital: m.hospital,
      chargemasterPrice,
      insuranceRate: validInsRate,
      patientCost,
      insurerPays,
      cashPrice,
      payerName: m.payerName,
      dataQuality: validInsRate != null && cashPrice != null ? "real" : "partial",
      isAiEstimate: false,
      dataLastUpdated: m.lastSeeded?.toISOString() ?? null,
      rank: 0,
    });
  }

  // 5. Sort by patient cost (prefer real, then partial), assign ranks
  entries.sort((a, b) => {
    const av = a.patientCost ?? a.cashPrice ?? Infinity;
    const bv = b.patientCost ?? b.cashPrice ?? Infinity;
    if (av !== bv) return av - bv;
    return a.dataQuality === "real" ? -1 : 1;
  });
  entries.forEach((e, i) => { e.rank = i + 1; });

  const medicare = getBestMedicareBenchmark([cptCode]);
  const response: CompareResponse = { entries, medicare };

  await redis.set(cacheKey, response, { ex: 86400 });

  // Fire-and-forget search log
  prisma.searchLog.create({
    data: {
      query: cptCode,
      endpoint: "hospitals/compare",
      resultCount: entries.length,
      cptCode,
      insurerName: payerName ?? null,
      payerType: payerType ?? null,
      responseTimeMs: Date.now() - startTime,
    },
  }).catch(() => {});

  return NextResponse.json(response, {
    headers: { "Cache-Control": "s-maxage=86400, stale-while-revalidate=604800" },
  });
}
