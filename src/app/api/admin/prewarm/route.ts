import { NextRequest, NextResponse } from "next/server";
import { redis } from "@/lib/redis";
import { prisma } from "@/lib/prisma";
import { searchCptCodes } from "@/lib/cpt-lookup";

export const maxDuration = 300; // 5 min — needs time to warm all combos

/**
 * Pre-warms Redis cache for top procedures.
 *
 * GET /api/admin/prewarm — warms procedure-search + hospitals/compare caches.
 * Skips the AI breakdown (expensive) — those get cached on first real user hit.
 * Focuses on the fast DB paths that benefit most from cache warming.
 *
 * Can be triggered by Vercel Cron, GitHub Actions, or manually.
 */

const TOP_QUERIES = [
  "knee replacement", "hip replacement", "torn ACL", "rotator cuff tear",
  "herniated disc", "spinal fusion", "carpal tunnel surgery", "ankle fracture",
  "meniscus tear", "appendectomy", "gallstones", "hernia repair",
  "coronary artery bypass", "cardiac catheterization", "pacemaker implant",
  "colonoscopy", "upper endoscopy", "cesarean section", "hysterectomy",
  "cataract surgery", "kidney stone removal", "tonsillectomy", "sinus surgery",
  "mastectomy", "skin lesion removal", "MRI brain", "CT scan chest",
  "wisdom teeth removal", "epidural steroid injection", "cortisone injection",
  "shoulder replacement", "thyroid surgery", "hemorrhoid surgery",
  "heart valve replacement", "bariatric surgery", "fibroid removal",
  "prostate surgery", "varicose vein treatment", "stress test",
  "lung biopsy", "sleep study", "root canal", "physical therapy",
  "coronary stent", "gastric bypass", "ear tubes", "LASIK",
  "prostatectomy", "colon cancer surgery", "egg retrieval IVF",
];

const PAYER_TYPES = ["commercial", "medicare", "cash"];

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  // Allow if: no secret configured, or correct secret, or localhost
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    const host = req.headers.get("host") ?? "";
    if (!host.includes("localhost")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  const results = { warmed: 0, skipped: 0, errors: 0 };

  for (const query of TOP_QUERIES) {
    try {
      // 1. Warm CPT lookup cache
      const cptMatches = await searchCptCodes(query, 8);

      // 2. Warm procedure-search cache
      const searchKey = `search3:${query.trim().toLowerCase()}`;
      const hasSearchCache = await redis.get(searchKey);

      if (!hasSearchCache && cptMatches.length) {
        // Find matching procedures in our chargemaster DB
        const cptCodes = cptMatches.map((m) => m.code);
        const procedures = await prisma.procedure.findMany({
          where: {
            OR: [
              { cptCode: { in: cptCodes } },
              ...query.split(/\s+/).filter((w) => w.length > 3)
                .map((w) => ({ name: { contains: w, mode: "insensitive" as const } })),
            ],
          },
          select: {
            id: true, cptCode: true, name: true, category: true,
            _count: { select: { prices: true } },
          },
          take: 20,
        });

        if (procedures.length) {
          const hospitalCounts = await prisma.priceEntry.groupBy({
            by: ["procedureId"],
            where: { procedureId: { in: procedures.map((p) => p.id) } },
            _count: { hospitalId: true },
          });
          const hcMap = Object.fromEntries(
            hospitalCounts.map((h) => [h.procedureId, h._count.hospitalId]),
          );

          const searchResults = procedures
            .map((p) => ({
              cptCode: p.cptCode, name: p.name, category: p.category,
              priceCount: p._count.prices, hospitalCount: hcMap[p.id] ?? 0, matchScore: 1,
            }))
            .filter((r) => r.priceCount > 0)
            .sort((a, b) => b.priceCount - a.priceCount);

          if (searchResults.length) {
            await redis.set(searchKey, { procedures: searchResults, noData: false }, { ex: 3600 });
          }
        }
      }

      // 3. Warm hospitals/compare cache for the top CPT code × each payer type
      const topCpt = cptMatches[0]?.code;
      if (topCpt) {
        for (const payerType of PAYER_TYPES) {
          const compareKey = `compare7:${topCpt}|${payerType}||0.2`;
          const hasCached = await redis.get(compareKey);
          if (hasCached) {
            results.skipped++;
            continue;
          }

          // Trigger the compare logic by calling our own endpoint
          const baseUrl = req.nextUrl.origin;
          const params = new URLSearchParams({
            cptCode: topCpt, payerType, coinsurance: "0.2",
          });
          try {
            await fetch(`${baseUrl}/api/hospitals/compare?${params}`, {
              signal: AbortSignal.timeout(30000),
            });
            results.warmed++;
          } catch {
            results.errors++;
          }
        }
      }
    } catch {
      results.errors++;
    }
  }

  return NextResponse.json({
    message: "Pre-warm complete",
    queries: TOP_QUERIES.length,
    ...results,
  });
}
