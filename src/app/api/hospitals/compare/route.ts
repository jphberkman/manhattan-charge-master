import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@/generated/prisma";
import { redis } from "@/lib/redis";
import { getBestMedicareBenchmark, getMedicareRateAsync } from "@/lib/medicare";
import type { MedicareBenchmark } from "@/lib/medicare";
import {
  getShopperHospital,
  resolveShopperHospitalId,
} from "@/lib/price-transparency/shopper-hospitals";

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
  /** Where this data came from */
  dataSource: "chargemaster" | "cms-avg" | "cms-derived-estimate" | "none";
  isAiEstimate: boolean;
  dataLastUpdated: string | null;
  rank: number;
}

export interface CompareResponse {
  entries: HospitalComparisonEntry[];
  medicare: MedicareBenchmark | null;
  /** Source hospital rows that could not be attributed to a shopper facility. */
  unattributedSourceHospitals: number;
}

/** Minimum price in cents to include (filters out $1 lab fragments). */
const MIN_CENTS = 10000; // $100

// ── Route handler ─────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const startTime = Date.now();
  const { searchParams } = new URL(req.url);
  const cptCode    = searchParams.get("cptCode");
  const payerType  = searchParams.get("payerType");
  const payerName  = searchParams.get("payerName");
  const coinsuranceRaw = searchParams.get("coinsurance");
  const coinsuranceParsed =
    coinsuranceRaw == null || coinsuranceRaw === "" ? Number.NaN : parseFloat(coinsuranceRaw);
  const coinsurance =
    Number.isFinite(coinsuranceParsed) && coinsuranceParsed >= 0 && coinsuranceParsed <= 1
      ? coinsuranceParsed
      : null;

  if (!cptCode) return NextResponse.json({ error: "cptCode is required" }, { status: 400 });

  const cacheKey = `compare18:${cptCode}|${payerType ?? ""}|${payerName ?? ""}|${coinsurance ?? "none"}`;
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
    const medicare = await getMedicareRateAsync(cptCode) ?? getBestMedicareBenchmark([cptCode]);
    const response: CompareResponse = {
      entries: [],
      medicare,
      unattributedSourceHospitals: 0,
    };
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
  let unattributedSourceHospitals = 0;

  for (const row of rows) {
    const canonicalId = resolveShopperHospitalId(row.hospitalName);
    if (!canonicalId) {
      unattributedSourceHospitals++;
      continue;
    }
    const key = canonicalId;
    const shopper = getShopperHospital(canonicalId);
    const canonicalHosp = shopper
      ? { id: shopper.id, name: shopper.name, address: shopper.address }
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

    // Only discard obviously invalid rates (>$500K likely data error)
    const validInsRate = insuranceRate != null && insuranceRate > 500000
      ? null
      : insuranceRate;

    // Must have at least one real price to show
    if (validInsRate == null && cashPrice == null) continue;

    const patientCost =
      validInsRate != null && coinsurance != null ? Math.round(validInsRate * coinsurance) : null;
    const insurerPays =
      validInsRate != null && coinsurance != null
        ? Math.round(validInsRate * (1 - coinsurance))
        : null;

    entries.push({
      hospital: m.hospital,
      chargemasterPrice,
      insuranceRate: validInsRate,
      patientCost,
      insurerPays,
      cashPrice,
      payerName: m.payerName,
      dataQuality: validInsRate != null && cashPrice != null ? "real" : "partial",
      dataSource: "chargemaster",
      isAiEstimate: false,
      dataLastUpdated: m.lastSeeded?.toISOString() ?? null,
      rank: 0,
    });
  }

  const medicare = await getMedicareRateAsync(cptCode) ?? getBestMedicareBenchmark([cptCode]);

  // Sort: when insurance selected, prefer published negotiated rates — never fabricated OOP.
  const hasInsurance = payerType && payerType !== "cash";
  entries.sort((a, b) => {
    const av = hasInsurance
      ? (a.patientCost ?? a.insuranceRate ?? Infinity)
      : (a.cashPrice ?? Infinity);
    const bv = hasInsurance
      ? (b.patientCost ?? b.insuranceRate ?? Infinity)
      : (b.cashPrice ?? Infinity);
    if (av !== bv) return av - bv;
    // Secondary: prefer entries with more data
    return a.dataQuality === "real" ? -1 : 1;
  });
  entries.forEach((e, i) => { e.rank = i + 1; });
  const response: CompareResponse = { entries, medicare, unattributedSourceHospitals };

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
