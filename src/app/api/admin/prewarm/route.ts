import { NextRequest, NextResponse } from "next/server";

export const maxDuration = 300; // 5 min — needs time to warm all combos

/**
 * Pre-warms Redis cache for top procedures by calling the real API endpoints.
 *
 * GET /api/admin/prewarm — warms procedure-search + hospitals/compare caches.
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
  "bunionectomy", "MRI knee", "CT scan abdomen", "wisdom teeth extraction",
];

const INSURERS = ["Cigna", "Aetna", "United", "Empire"];

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    const host = req.headers.get("host") ?? "";
    if (!host.includes("localhost")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  const baseUrl = req.nextUrl.origin;
  const results = { searchWarmed: 0, compareWarmed: 0, errors: 0 };

  for (const query of TOP_QUERIES) {
    try {
      // 1. Warm procedure-search cache (calls the real endpoint)
      const searchRes = await fetch(`${baseUrl}/api/procedure-search`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ query }),
        signal: AbortSignal.timeout(30000),
      });

      if (!searchRes.ok) { results.errors++; continue; }
      results.searchWarmed++;

      const searchData = await searchRes.json() as {
        procedures: { cptCode: string }[];
        noData: boolean;
      };

      // 2. Warm compare cache for the top CPT code × insurers
      const topCpt = searchData.procedures?.[0]?.cptCode;
      if (topCpt) {
        // Warm one insurer at a time to avoid overwhelming Neon
        const insurer = INSURERS[results.compareWarmed % INSURERS.length];
        const params = new URLSearchParams({
          cptCode: topCpt, payerType: "commercial",
          payerName: insurer, coinsurance: "0.2",
        });
        try {
          await fetch(`${baseUrl}/api/hospitals/compare?${params}`, {
            signal: AbortSignal.timeout(30000),
          });
          results.compareWarmed++;
        } catch {
          results.errors++;
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
