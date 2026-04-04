import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

// ── Cache layer (1-hour TTL) ────────────────────────────────────────────────
let cachedReport: unknown = null;
let cacheTime = 0;
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

export interface AuditReport {
  generatedAt: string;
  summary: {
    totalHospitals: number;
    totalProcedures: number;
    totalPriceEntries: number;
    entriesBySource: Record<string, number>;
    entriesByPayerType: Record<string, number>;
  };
  hospitals: {
    name: string;
    cmsProviderId: string | null;
    lastSeeded: string | null;
    totalEntries: number;
    procedureCount: number;
    hasNegotiatedRates: boolean;
    hasCashPrices: boolean;
    dataAge: string;
    staleness: "fresh" | "aging" | "stale";
  }[];
  dataQuality: {
    missingCashPrices: number;
    missingNegotiatedRates: number;
    suspiciousOutliers: number;
    duplicateEntries: number;
    malformedCptCodes: number;
  };
  recentSearches: {
    query: string;
    endpoint: string;
    resultCount: number;
    cptCode: string | null;
    createdAt: string;
  }[];
  warnings: string[];
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function dateDiffDays(from: Date | null, to: Date): number {
  if (!from) return 9999;
  return Math.floor((to.getTime() - from.getTime()) / (1000 * 60 * 60 * 24));
}

function stalenessLabel(days: number): "fresh" | "aging" | "stale" {
  if (days < 30) return "fresh";
  if (days <= 90) return "aging";
  return "stale";
}

function humanAge(days: number): string {
  if (days >= 9999) return "unknown";
  if (days === 0) return "today";
  if (days === 1) return "1 day ago";
  if (days < 30) return `${days} days ago`;
  if (days < 365) return `${Math.floor(days / 30)} months ago`;
  return `${Math.floor(days / 365)}y ${Math.floor((days % 365) / 30)}m ago`;
}

// ── Handler ──────────────────────────────────────────────────────────────────

export async function GET() {
  const now = Date.now();

  // Return cached if still valid
  if (cachedReport && now - cacheTime < CACHE_TTL_MS) {
    return NextResponse.json(cachedReport, {
      headers: { "X-Cache": "HIT", "Cache-Control": "public, max-age=3600" },
    });
  }

  try {
    const today = new Date();

    // ── Parallel queries ──────────────────────────────────────────────────
    const [
      hospitalData,
      totalProcedures,
      totalPriceEntries,
      bySource,
      byPayerType,
      hospitalProcedureCounts,
      hospitalPayerBreakdown,
      outlierCount,
      duplicateCount,
      malformedCpts,
      recentSearches,
    ] = await Promise.all([
      // 1. Hospitals with entry counts
      prisma.hospital.findMany({
        select: {
          id: true,
          name: true,
          cmsProviderId: true,
          lastSeeded: true,
          _count: { select: { prices: true } },
        },
        orderBy: { name: "asc" },
      }),

      // 2. Total procedures
      prisma.procedure.count(),

      // 3. Total price entries
      prisma.priceEntry.count(),

      // 4. Entries grouped by source
      prisma.priceEntry.groupBy({
        by: ["source"],
        _count: { id: true },
      }),

      // 5. Entries grouped by payerType
      prisma.priceEntry.groupBy({
        by: ["payerType"],
        _count: { id: true },
      }),

      // 6. Distinct procedure count per hospital
      prisma.$queryRaw<{ hospitalId: string; cnt: bigint }[]>`
        SELECT "hospitalId", COUNT(DISTINCT "procedureId") AS cnt
        FROM "PriceEntry"
        GROUP BY "hospitalId"
      `,

      // 7. Payer-type existence per hospital (negotiated & cash)
      prisma.$queryRaw<{ hospitalId: string; hasNeg: boolean; hasCash: boolean }[]>`
        SELECT
          "hospitalId",
          BOOL_OR("payerType" IN ('commercial', 'medicare', 'medicaid')) AS "hasNeg",
          BOOL_OR("payerType" = 'cash') AS "hasCash"
        FROM "PriceEntry"
        GROUP BY "hospitalId"
      `,

      // 8. Suspicious outliers (> $500K or < $1)
      prisma.priceEntry.count({
        where: {
          OR: [
            { priceInCents: { gt: 50_000_000 } }, // > $500K
            { priceInCents: { lt: 100 } },         // < $1
          ],
        },
      }),

      // 9. Duplicate entries (same hospital+procedure+payerType+priceInCents)
      prisma.$queryRaw<{ cnt: bigint }[]>`
        SELECT COUNT(*) AS cnt FROM (
          SELECT "hospitalId", "procedureId", "payerType", "priceInCents"
          FROM "PriceEntry"
          GROUP BY "hospitalId", "procedureId", "payerType", "priceInCents"
          HAVING COUNT(*) > 1
        ) dupes
      `,

      // 10. Malformed CPT codes (not 5-digit numeric)
      prisma.$queryRaw<{ cnt: bigint }[]>`
        SELECT COUNT(*) AS cnt
        FROM "Procedure"
        WHERE "cptCode" !~ '^[0-9]{5}$'
      `,

      // 11. Recent searches
      prisma.searchLog.findMany({
        select: {
          query: true,
          endpoint: true,
          resultCount: true,
          cptCode: true,
          createdAt: true,
        },
        orderBy: { createdAt: "desc" },
        take: 20,
      }),
    ]);

    // ── Build lookup maps ─────────────────────────────────────────────────
    const procCountMap = new Map(hospitalProcedureCounts.map((r) => [r.hospitalId, Number(r.cnt)]));
    const payerMap = new Map(hospitalPayerBreakdown.map((r) => [r.hospitalId, { hasNeg: r.hasNeg, hasCash: r.hasCash }]));

    // ── Missing cash / negotiated ─────────────────────────────────────────
    // Count hospitals missing each price type entirely
    const hospitalsWithoutCash = hospitalData.filter((h) => !payerMap.get(h.id)?.hasCash).length;
    const hospitalsWithoutNeg = hospitalData.filter((h) => !payerMap.get(h.id)?.hasNeg).length;

    // ── Assemble source map ───────────────────────────────────────────────
    const entriesBySource: Record<string, number> = {};
    for (const r of bySource) entriesBySource[r.source] = r._count.id;

    const entriesByPayerType: Record<string, number> = {};
    for (const r of byPayerType) entriesByPayerType[r.payerType] = r._count.id;

    // ── Build hospital rows ───────────────────────────────────────────────
    const hospitals = hospitalData.map((h) => {
      const days = dateDiffDays(h.lastSeeded, today);
      const payerInfo = payerMap.get(h.id);
      return {
        name: h.name,
        cmsProviderId: h.cmsProviderId,
        lastSeeded: h.lastSeeded?.toISOString() ?? null,
        totalEntries: h._count.prices,
        procedureCount: procCountMap.get(h.id) ?? 0,
        hasNegotiatedRates: payerInfo?.hasNeg ?? false,
        hasCashPrices: payerInfo?.hasCash ?? false,
        dataAge: humanAge(days),
        staleness: stalenessLabel(days),
      };
    });

    // Sort by staleness (stale first)
    const stalenessOrder = { stale: 0, aging: 1, fresh: 2 };
    hospitals.sort((a, b) => stalenessOrder[a.staleness] - stalenessOrder[b.staleness]);

    // ── Warnings ──────────────────────────────────────────────────────────
    const warnings: string[] = [];
    const staleHospitals = hospitals.filter((h) => h.staleness === "stale");
    if (staleHospitals.length > 0) {
      warnings.push(`${staleHospitals.length} hospital(s) have stale data (>90 days old): ${staleHospitals.map((h) => h.name).join(", ")}`);
    }
    const noDataHospitals = hospitals.filter((h) => h.totalEntries === 0);
    if (noDataHospitals.length > 0) {
      warnings.push(`${noDataHospitals.length} hospital(s) have zero price entries: ${noDataHospitals.map((h) => h.name).join(", ")}`);
    }
    if (hospitalsWithoutCash > 0) {
      warnings.push(`${hospitalsWithoutCash} hospital(s) have no cash/self-pay prices at all`);
    }
    if (hospitalsWithoutNeg > 0) {
      warnings.push(`${hospitalsWithoutNeg} hospital(s) have no negotiated insurance rates`);
    }
    const dupCount = Number(duplicateCount[0]?.cnt ?? 0);
    if (dupCount > 0) {
      warnings.push(`${dupCount} duplicate price entry groups detected (same hospital + procedure + payer + amount)`);
    }
    const malformed = Number(malformedCpts[0]?.cnt ?? 0);
    if (malformed > 0) {
      warnings.push(`${malformed} procedure(s) have non-standard CPT codes (not 5-digit numeric)`);
    }
    if (outlierCount > 0) {
      warnings.push(`${outlierCount} price entries are suspicious outliers (>$500K or <$1)`);
    }

    // ── Final report ──────────────────────────────────────────────────────
    const report: AuditReport = {
      generatedAt: today.toISOString(),
      summary: {
        totalHospitals: hospitalData.length,
        totalProcedures,
        totalPriceEntries,
        entriesBySource,
        entriesByPayerType,
      },
      hospitals,
      dataQuality: {
        missingCashPrices: hospitalsWithoutCash,
        missingNegotiatedRates: hospitalsWithoutNeg,
        suspiciousOutliers: outlierCount,
        duplicateEntries: dupCount,
        malformedCptCodes: malformed,
      },
      recentSearches: recentSearches.map((s) => ({
        query: s.query,
        endpoint: s.endpoint,
        resultCount: s.resultCount,
        cptCode: s.cptCode,
        createdAt: s.createdAt.toISOString(),
      })),
      warnings,
    };

    // Cache it
    cachedReport = report;
    cacheTime = now;

    return NextResponse.json(report, {
      headers: { "X-Cache": "MISS", "Cache-Control": "public, max-age=3600" },
    });
  } catch (err) {
    console.error("[data-audit] Error:", err);
    return NextResponse.json(
      { error: "Failed to generate audit report", detail: String(err) },
      { status: 500 }
    );
  }
}
