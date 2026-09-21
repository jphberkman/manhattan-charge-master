import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { redis } from "@/lib/redis";
import { getBestMedicareBenchmark, getMedicareRateAsync } from "@/lib/medicare";
import type { MedicareBenchmark } from "@/lib/medicare";
import { SHOPPER_HOSPITALS } from "@/lib/price-transparency/shopper-hospitals";
import {
  buildShopperCompareEntries,
  type ShopperCompareEntry,
} from "@/lib/price-transparency/compare-entries";
import {
  getPayerSpecificMedians,
  getPriceSummariesForCode,
} from "@/lib/price-transparency/price-read-model";

export const maxDuration = 60;

export type HospitalComparisonEntry = ShopperCompareEntry;

export interface CompareResponse {
  entries: HospitalComparisonEntry[];
  medicare: MedicareBenchmark | null;
  /** Always 13. Campuses without a file or code stay visible with null prices. */
  shopperHospitalCount: number;
  pricedHospitalCount: number;
  /** Source hospital rows that could not be attributed to a shopper facility. */
  unattributedSourceHospitals: number;
}

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

  const cacheKey = `compare22:${cptCode}|${payerType ?? ""}|${payerName ?? ""}|${coinsurance ?? "none"}`;
  const cached = await redis.get<CompareResponse>(cacheKey);
  if (cached) return NextResponse.json(cached, {
    headers: { "Cache-Control": "s-maxage=86400, stale-while-revalidate=604800" },
  });

  const insClass = payerType && payerType !== "cash" ? payerType : "commercial";
  const hasInsurance = Boolean(payerType && payerType !== "cash");

  const [summaries, payerSpecific] = await Promise.all([
    getPriceSummariesForCode(cptCode),
    payerName ? getPayerSpecificMedians(cptCode, payerName) : Promise.resolve(new Map<string, { median: number; payerName: string }>()),
  ]);

  const entries = buildShopperCompareEntries({
    summaries,
    payerSpecific,
    insClass,
    coinsurance,
    hasInsurance,
  });

  const medicare = await getMedicareRateAsync(cptCode) ?? getBestMedicareBenchmark([cptCode]);
  const pricedHospitalCount = entries.filter((e) => e.dataSource === "chargemaster").length;
  const response: CompareResponse = {
    entries,
    medicare,
    shopperHospitalCount: SHOPPER_HOSPITALS.length,
    pricedHospitalCount,
    unattributedSourceHospitals: 0,
  };

  await redis.set(cacheKey, response, { ex: 86400 });

  prisma.searchLog.create({
    data: {
      query: cptCode,
      endpoint: "hospitals/compare",
      resultCount: pricedHospitalCount,
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
