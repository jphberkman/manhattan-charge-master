import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import type { PriceApiEntry } from "@/lib/price-transparency/types";

// In-memory cache (same procedureId + payerType = same result)
const estimateCache = new Map<string, { data: unknown[]; ts: number }>();
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const procedureId = searchParams.get("procedureId");
  const payerType = searchParams.get("payerType") ?? "all";

  if (!procedureId) {
    return NextResponse.json({ error: "procedureId is required" }, { status: 400 });
  }

  const cacheKey = `${procedureId}|${payerType}`;
  const cached = estimateCache.get(cacheKey);
  if (cached && Date.now() - cached.ts < CACHE_TTL_MS) {
    return NextResponse.json(cached.data);
  }

  const procedure = await prisma.procedure.findUnique({
    where: { id: procedureId },
    select: { cptCode: true, name: true, category: true },
  });

  if (!procedure) {
    return NextResponse.json({ error: "Procedure not found" }, { status: 404 });
  }

  // ── Return real DB prices only — no AI-generated estimates ─────────────────
  const realPrices = await prisma.priceEntry.findMany({
    where: {
      procedureId,
      ...(payerType !== "all" ? { payerType } : {}),
    },
    select: {
      id: true,
      payerName: true,
      payerType: true,
      priceInCents: true,
      priceType: true,
      hospital: { select: { id: true, name: true, address: true } },
    },
    take: 50,
  });

  if (realPrices.length > 0) {
    const realEntries: (PriceApiEntry & { source: "database" })[] = realPrices
      .map((r) => ({
        id: r.id,
        hospital: { id: r.hospital.id, name: r.hospital.name, address: r.hospital.address },
        payerName: r.payerName,
        payerType: r.payerType as PriceApiEntry["payerType"],
        priceUsd: r.priceInCents / 100,
        priceType: r.priceType as PriceApiEntry["priceType"],
        source: "database" as const,
      }))
      .sort((a, b) => a.priceUsd - b.priceUsd);

    estimateCache.set(cacheKey, { data: realEntries, ts: Date.now() });
    return NextResponse.json(realEntries, {
      headers: { "Cache-Control": "s-maxage=3600, stale-while-revalidate=86400" },
    });
  }

  // No real prices in DB — return empty result (never generate AI estimates)
  const empty = { source: "none" as const, message: "No hospital data available for this procedure" };
  estimateCache.set(cacheKey, { data: [empty], ts: Date.now() });
  return NextResponse.json([empty], {
    headers: { "Cache-Control": "s-maxage=3600, stale-while-revalidate=86400" },
  });
}
