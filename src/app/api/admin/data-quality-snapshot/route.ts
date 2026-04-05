import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

/**
 * GET /api/admin/data-quality-snapshot
 *
 * Quick data quality check: total entries, breakdowns by source and payer type,
 * and flagging of obvious issues like $0 prices. Runs as a daily Vercel Cron.
 */

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    const host = req.headers.get("host") ?? "";
    if (!host.includes("localhost")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  const [
    totalEntries,
    zeroPriceCount,
    bySource,
    byPayerType,
    hospitalCount,
    procedureCount,
  ] = await Promise.all([
    prisma.priceEntry.count(),
    prisma.priceEntry.count({ where: { priceInCents: 0 } }),
    prisma.priceEntry.groupBy({ by: ["source"], _count: { id: true } }),
    prisma.priceEntry.groupBy({ by: ["payerType"], _count: { id: true } }),
    prisma.hospital.count(),
    prisma.procedure.count(),
  ]);

  const issues: string[] = [];
  if (zeroPriceCount > 0) {
    issues.push(`${zeroPriceCount} entries with $0 price`);
  }
  if (totalEntries === 0) {
    issues.push("No price entries in database");
  }

  const sourceBreakdown = Object.fromEntries(
    bySource.map((r) => [r.source, r._count.id]),
  );
  const payerBreakdown = Object.fromEntries(
    byPayerType.map((r) => [r.payerType, r._count.id]),
  );

  if (issues.length > 0) {
    console.warn("[data-quality-snapshot] Issues found:", issues.join("; "));
  }

  return NextResponse.json({
    checkedAt: new Date().toISOString(),
    totalEntries,
    hospitalCount,
    procedureCount,
    bySource: sourceBreakdown,
    byPayerType: payerBreakdown,
    issues,
  });
}
