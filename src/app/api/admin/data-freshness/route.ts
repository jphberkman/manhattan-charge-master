import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

/**
 * GET /api/admin/data-freshness
 *
 * Checks each hospital's lastSeeded date and flags any that haven't been
 * updated in more than 90 days. Designed to run as a weekly Vercel Cron.
 */

const STALE_THRESHOLD_DAYS = 90;

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    const host = req.headers.get("host") ?? "";
    if (!host.includes("localhost")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  const hospitals = await prisma.hospital.findMany({
    select: { id: true, name: true, lastSeeded: true },
    orderBy: { name: "asc" },
  });

  const now = new Date();
  const cutoff = new Date(now.getTime() - STALE_THRESHOLD_DAYS * 86400 * 1000);

  const stale: { name: string; lastSeeded: string | null; daysSince: number | null }[] = [];
  const fresh: { name: string; lastSeeded: string; daysSince: number }[] = [];

  for (const h of hospitals) {
    if (!h.lastSeeded) {
      stale.push({ name: h.name, lastSeeded: null, daysSince: null });
    } else if (h.lastSeeded < cutoff) {
      const daysSince = Math.floor((now.getTime() - h.lastSeeded.getTime()) / 86400000);
      stale.push({ name: h.name, lastSeeded: h.lastSeeded.toISOString(), daysSince });
    } else {
      const daysSince = Math.floor((now.getTime() - h.lastSeeded.getTime()) / 86400000);
      fresh.push({ name: h.name, lastSeeded: h.lastSeeded.toISOString(), daysSince });
    }
  }

  if (stale.length > 0) {
    console.warn(
      `[data-freshness] ${stale.length} hospital(s) stale (>${STALE_THRESHOLD_DAYS} days):`,
      stale.map((s) => s.name).join(", "),
    );
  }

  return NextResponse.json({
    checkedAt: now.toISOString(),
    thresholdDays: STALE_THRESHOLD_DAYS,
    totalHospitals: hospitals.length,
    freshCount: fresh.length,
    staleCount: stale.length,
    stale,
    fresh,
  });
}
