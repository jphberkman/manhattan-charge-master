import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { redis } from "@/lib/redis";
import { getBestMedicareBenchmark, getMedicareRateAsync } from "@/lib/medicare";
import type { MedicareBenchmark } from "@/lib/medicare";
import { getShopperHospital } from "@/lib/price-transparency/shopper-hospitals";
import {
  getPayerSpecificMedians,
  getPriceSummariesForCode,
} from "@/lib/price-transparency/price-read-model";

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
  /** De-identified min/max across this hospital's published rates for the code. */
  publishedMin: number | null;
  publishedMax: number | null;
  /** Neon warehouse object key when the skinny PriceIndex supplied this row. */
  warehouseObjectKey?: string;
}

export interface CompareResponse {
  entries: HospitalComparisonEntry[];
  medicare: MedicareBenchmark | null;
  /** Source hospital rows that could not be attributed to a shopper facility. */
  unattributedSourceHospitals: number;
}

// ── Route handler ─────────────────────────────────────────────────────────────
// Reads the fresh per-campus corpus (PriceSummary) only. Legacy rows without
// provenance are quarantined and never shown to consumers.

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

  const cacheKey = `compare21:${cptCode}|${payerType ?? ""}|${payerName ?? ""}|${coinsurance ?? "none"}`;
  const cached = await redis.get<CompareResponse>(cacheKey);
  if (cached) return NextResponse.json(cached, {
    headers: { "Cache-Control": "s-maxage=86400, stale-while-revalidate=604800" },
  });

  const insClass = payerType && payerType !== "cash" ? payerType : "commercial";

  const [summaries, payerSpecific] = await Promise.all([
    getPriceSummariesForCode(cptCode),
    payerName ? getPayerSpecificMedians(cptCode, payerName) : Promise.resolve(new Map<string, { median: number; payerName: string }>()),
  ]);

  const entries: HospitalComparisonEntry[] = [];

  for (const s of summaries) {
    const shopper = getShopperHospital(s.hospitalId);
    if (!shopper) continue;

    const specific = payerSpecific.get(s.hospitalId) ?? null;
    const insuranceRate = specific?.median ?? s.negotiatedMedianByClass[insClass] ?? null;
    const cashPrice = s.cashMedian;

    if (insuranceRate == null && cashPrice == null) continue;

    const patientCost =
      insuranceRate != null && coinsurance != null ? Math.round(insuranceRate * coinsurance) : null;
    const insurerPays =
      insuranceRate != null && coinsurance != null
        ? Math.round(insuranceRate * (1 - coinsurance))
        : null;

    entries.push({
      hospital: { id: shopper.id, name: shopper.name, address: shopper.address },
      chargemasterPrice: s.grossMedian,
      insuranceRate,
      patientCost,
      insurerPays,
      cashPrice,
      payerName: specific?.payerName ?? null,
      dataQuality: insuranceRate != null && cashPrice != null ? "real" : "partial",
      dataSource: "chargemaster",
      isAiEstimate: false,
      dataLastUpdated: s.latestAsOf,
      rank: 0,
      publishedMin: s.minDollars,
      publishedMax: s.maxDollars,
      warehouseObjectKey: s.warehouseObjectKey,
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
    return a.dataQuality === "real" ? -1 : 1;
  });
  entries.forEach((e, i) => { e.rank = i + 1; });
  const response: CompareResponse = { entries, medicare, unattributedSourceHospitals: 0 };

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
