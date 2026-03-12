/**
 * Pre-warms Redis cache for the top 50 most common procedures.
 *
 * Calls the procedure-search, procedure-breakdown, and hospitals/compare
 * APIs for each procedure × insurer combination, populating Redis so that
 * real users get instant responses.
 *
 * Usage:
 *   npx tsx scripts/prewarm-cache.ts                  # against production
 *   npx tsx scripts/prewarm-cache.ts http://localhost:3000  # against local dev
 *
 * Designed to be run as a cron job (e.g. daily at 4am via Vercel Cron or GitHub Actions).
 */

const BASE_URL = process.argv[2] || "https://shopforcare.xyz";

// ── Top 50 procedures (natural language queries users actually type) ─────────

const TOP_QUERIES = [
  // Orthopedic
  "knee replacement",
  "hip replacement",
  "torn ACL",
  "rotator cuff tear",
  "herniated disc",
  "spinal fusion",
  "carpal tunnel surgery",
  "shoulder replacement",
  "ankle fracture surgery",
  "meniscus tear",
  // General surgery
  "appendectomy",
  "gallstones",
  "hernia repair",
  "hemorrhoid surgery",
  "thyroid surgery",
  // Cardiac
  "coronary artery bypass",
  "heart valve replacement",
  "cardiac catheterization",
  "pacemaker implant",
  "coronary stent",
  // GI
  "colonoscopy",
  "upper endoscopy",
  "bariatric surgery",
  "gastric bypass",
  // OB/GYN
  "cesarean section",
  "hysterectomy",
  "fibroid removal",
  "egg retrieval IVF",
  // Urology
  "kidney stone removal",
  "prostate surgery",
  // ENT
  "tonsillectomy",
  "sinus surgery",
  "ear tubes",
  // Eye
  "cataract surgery",
  "LASIK",
  // Cancer
  "mastectomy",
  "colon cancer surgery",
  "prostatectomy",
  "lung biopsy",
  // Vascular
  "varicose vein treatment",
  // Plastics / Derm
  "skin lesion removal",
  // Diagnostic
  "MRI brain",
  "CT scan chest",
  "stress test",
  "sleep study",
  // Common outpatient
  "wisdom teeth removal",
  "root canal",
  "epidural steroid injection",
  "cortisone injection knee",
  "physical therapy evaluation",
];

// Major insurers — cover 90%+ of users
const INSURERS = [
  { name: "Aetna", payerType: "commercial" },
  { name: "UnitedHealthcare", payerType: "commercial" },
  { name: "Empire Blue Cross Blue Shield", payerType: "commercial" },
  { name: "Cigna", payerType: "commercial" },
  { name: null, payerType: null }, // no insurance (cash path)
];

const COINSURANCE = 0.20;

// ── Helpers ──────────────────────────────────────────────────────────────────

async function warmProcedureSearch(query: string): Promise<{ cptCode: string; name: string } | null> {
  try {
    const res = await fetch(`${BASE_URL}/api/procedure-search`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query }),
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) return null;
    const data = await res.json();
    if (data.noData || !data.procedures?.length) return null;
    return { cptCode: data.procedures[0].cptCode, name: data.procedures[0].name };
  } catch {
    return null;
  }
}

async function warmBreakdown(
  query: string,
  insurerName: string | null,
  payerType: string | null,
): Promise<{ cptCode: string } | null> {
  try {
    const res = await fetch(`${BASE_URL}/api/procedure-breakdown`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        query,
        insurerName: insurerName ?? undefined,
        payerType: payerType ?? undefined,
        coinsurance: COINSURANCE,
      }),
      signal: AbortSignal.timeout(120000), // AI can take a while
    });
    if (!res.ok) return null;

    // Read SSE stream to completion
    const text = await res.text();
    const resultMatch = text.match(/event: result\ndata: (.+)/);
    if (!resultMatch) return null;

    const breakdown = JSON.parse(resultMatch[1]);
    return { cptCode: breakdown.cptCode };
  } catch {
    return null;
  }
}

async function warmCompare(
  cptCode: string,
  payerType: string | null,
  payerName: string | null,
): Promise<boolean> {
  try {
    const params = new URLSearchParams({ cptCode, coinsurance: String(COINSURANCE) });
    if (payerType) params.set("payerType", payerType);
    if (payerName) params.set("payerName", payerName);

    const res = await fetch(`${BASE_URL}/api/hospitals/compare?${params}`, {
      signal: AbortSignal.timeout(60000),
    });
    return res.ok;
  } catch {
    return false;
  }
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log(`Pre-warming cache against ${BASE_URL}`);
  console.log(`${TOP_QUERIES.length} procedures × ${INSURERS.length} insurers = ${TOP_QUERIES.length * INSURERS.length} combinations\n`);

  let searchHits = 0;
  let breakdownsDone = 0;
  let comparesDone = 0;
  let errors = 0;

  for (let i = 0; i < TOP_QUERIES.length; i++) {
    const query = TOP_QUERIES[i];
    console.log(`[${i + 1}/${TOP_QUERIES.length}] "${query}"`);

    // 1. Warm procedure search (cached across all insurers)
    const searchResult = await warmProcedureSearch(query);
    if (searchResult) {
      searchHits++;
      console.log(`  ✓ Search: ${searchResult.cptCode} — ${searchResult.name}`);
    } else {
      console.log(`  ○ Search: no DB match`);
    }

    // 2. Warm breakdown + compare for each insurer
    for (const ins of INSURERS) {
      const label = ins.name ?? "cash";

      const breakdown = await warmBreakdown(query, ins.name, ins.payerType);
      if (breakdown) {
        breakdownsDone++;
        console.log(`  ✓ Breakdown [${label}]: CPT ${breakdown.cptCode}`);

        // 3. Warm hospital comparison
        const cpt = breakdown.cptCode || searchResult?.cptCode;
        if (cpt) {
          const ok = await warmCompare(cpt, ins.payerType, ins.name);
          if (ok) {
            comparesDone++;
            console.log(`  ✓ Compare [${label}]: done`);
          } else {
            errors++;
            console.log(`  ✗ Compare [${label}]: failed`);
          }
        }
      } else {
        errors++;
        console.log(`  ✗ Breakdown [${label}]: failed`);
      }
    }

    console.log();
  }

  console.log(`\n${"═".repeat(50)}`);
  console.log(`Pre-warm complete!`);
  console.log(`  Searches:    ${searchHits}/${TOP_QUERIES.length} hit DB`);
  console.log(`  Breakdowns:  ${breakdownsDone}/${TOP_QUERIES.length * INSURERS.length}`);
  console.log(`  Compares:    ${comparesDone}/${TOP_QUERIES.length * INSURERS.length}`);
  console.log(`  Errors:      ${errors}`);
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
