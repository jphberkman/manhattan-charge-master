/**
 * System test — speed, accuracy, and procedure coverage.
 * Usage: npx tsx scripts/system-test.ts [--live]
 *   --live  hits shopforcare.xyz instead of localhost:3000
 */

import { PrismaClient } from "../src/generated/prisma";

const LIVE = process.argv.includes("--live");
const BASE = LIVE ? "https://shopforcare.xyz" : "http://localhost:3000";

// Site password cookie for gated API routes (Vercel uses "Health")
const SITE_PASSWORD = process.env.SITE_PASSWORD ?? "Health";
const AUTH_HEADERS: Record<string, string> = {
  "content-type": "application/json",
  cookie: `site-access=${SITE_PASSWORD}`,
};

const prisma = new PrismaClient();

// ── Test procedures ─────────────────────────────────────────────────────────

const TEST_CASES: { label: string; query: string; expectedCpt: string; insurer: string; payerType: string }[] = [
  { label: "Ankle fracture ORIF",        query: "I have a non-union ankle fracture and need surgery", expectedCpt: "27766", insurer: "Cigna",  payerType: "commercial" },
  { label: "Total knee replacement",      query: "Total knee replacement surgery",                     expectedCpt: "27447", insurer: "Aetna",  payerType: "commercial" },
  { label: "Total hip replacement",       query: "Total hip replacement",                              expectedCpt: "27130", insurer: "United",  payerType: "commercial" },
  { label: "ACL reconstruction",          query: "I tore my ACL and need reconstruction surgery",      expectedCpt: "29888", insurer: "Cigna",  payerType: "commercial" },
  { label: "Gallbladder removal",         query: "Gallbladder removal for gallstones",                 expectedCpt: "47562", insurer: "Aetna",  payerType: "commercial" },
  { label: "Colonoscopy screening",       query: "Routine colonoscopy screening",                      expectedCpt: "45378", insurer: "Empire", payerType: "commercial" },
  { label: "Rotator cuff repair",         query: "Full thickness rotator cuff tear needing repair",    expectedCpt: "29827", insurer: "United",  payerType: "commercial" },
  { label: "Cataract surgery",            query: "Cataract surgery on my right eye",                   expectedCpt: "66984", insurer: "Aetna",  payerType: "commercial" },
  { label: "Appendectomy",                query: "Appendectomy for appendicitis",                      expectedCpt: "44970", insurer: "Cigna",  payerType: "commercial" },
  { label: "Herniated disc",              query: "Herniated disc causing leg pain needing surgery",     expectedCpt: "63030", insurer: "United",  payerType: "commercial" },
  { label: "Coronary bypass (CABG)",      query: "I need coronary bypass surgery",                     expectedCpt: "33533", insurer: "Aetna",  payerType: "commercial" },
  { label: "Carpal tunnel release",       query: "Carpal tunnel release surgery",                      expectedCpt: "64721", insurer: "Cigna",  payerType: "commercial" },
  { label: "Shoulder replacement",        query: "Total shoulder replacement",                          expectedCpt: "23472", insurer: "United",  payerType: "commercial" },
  { label: "Spinal fusion",              query: "Lumbar spinal fusion surgery",                        expectedCpt: "22612", insurer: "Aetna",  payerType: "commercial" },
  { label: "Hysterectomy",               query: "Laparoscopic hysterectomy",                           expectedCpt: "58571", insurer: "Empire", payerType: "commercial" },
  { label: "MRI knee",                   query: "MRI of the knee",                                    expectedCpt: "73721", insurer: "Cigna",  payerType: "commercial" },
  { label: "CT scan abdomen",            query: "CT scan of abdomen with contrast",                   expectedCpt: "74177", insurer: "Aetna",  payerType: "commercial" },
  { label: "Tonsillectomy",              query: "Tonsillectomy for chronic tonsillitis",               expectedCpt: "42826", insurer: "United",  payerType: "commercial" },
  { label: "Bunionectomy",               query: "Bunion surgery bunionectomy",                         expectedCpt: "28296", insurer: "Cigna",  payerType: "commercial" },
  { label: "Wisdom teeth extraction",    query: "Wisdom teeth extraction all four",                   expectedCpt: "41899", insurer: "Aetna",  payerType: "commercial" },
];

// ── Helpers ──────────────────────────────────────────────────────────────────

async function timed<T>(fn: () => Promise<T>): Promise<{ result: T; ms: number }> {
  const start = Date.now();
  const result = await fn();
  return { result, ms: Date.now() - start };
}

function flag(ok: boolean): string {
  return ok ? "✓" : "✗";
}

function pad(s: string, n: number): string {
  return s.length >= n ? s.substring(0, n) : s + " ".repeat(n - s.length);
}

// ── Tests ────────────────────────────────────────────────────────────────────

interface SearchResult {
  procedures: { cptCode: string; name: string; priceCount: number; hospitalCount: number }[];
  noData: boolean;
}

interface CompareResult {
  entries: {
    hospital: { id: string; name: string };
    insuranceRate: number | null;
    cashPrice: number | null;
    patientCost: number | null;
    dataQuality: string;
    isAiEstimate: boolean;
  }[];
  medicare: { physicianFee: number; episodeRate?: number } | null;
}

const FETCH_TIMEOUT = 60_000; // 60s max per request

async function testSearch(query: string): Promise<{ data: SearchResult; ms: number }> {
  const { result, ms } = await timed(async () => {
    const res = await fetch(`${BASE}/api/procedure-search`, {
      method: "POST",
      headers: AUTH_HEADERS,
      body: JSON.stringify({ query }),
      signal: AbortSignal.timeout(FETCH_TIMEOUT),
    });
    return res.json() as Promise<SearchResult>;
  });
  return { data: result, ms };
}

async function testCompare(cptCode: string, insurer: string, payerType: string): Promise<{ data: CompareResult; ms: number }> {
  const { result, ms } = await timed(async () => {
    const params = new URLSearchParams({
      cptCode,
      payerType,
      payerName: insurer,
      coinsurance: "0.20",
    });
    const res = await fetch(`${BASE}/api/hospitals/compare?${params}`, {
      headers: { cookie: `site-access=${SITE_PASSWORD}` },
      signal: AbortSignal.timeout(FETCH_TIMEOUT),
    });
    return res.json() as Promise<CompareResult>;
  });
  return { data: result, ms };
}

// ── DB coverage check ────────────────────────────────────────────────────────

async function checkDbCoverage(cptCode: string): Promise<{
  hasProcedure: boolean;
  priceCount: number;
  hospitalCount: number;
  hasCash: boolean;
  hasInsurance: boolean;
}> {
  const proc = await prisma.procedure.findUnique({
    where: { cptCode },
    select: { id: true },
  });
  if (!proc) return { hasProcedure: false, priceCount: 0, hospitalCount: 0, hasCash: false, hasInsurance: false };

  const stats: { cnt: number; hosp_cnt: number; cash_cnt: number; ins_cnt: number }[] = await prisma.$queryRaw`
    SELECT
      COUNT(*)::int as cnt,
      COUNT(DISTINCT pe."hospitalId")::int as hosp_cnt,
      COUNT(*) FILTER (WHERE pe."payerType" = 'cash' AND pe."priceInCents" >= 10000)::int as cash_cnt,
      COUNT(*) FILTER (WHERE pe."payerType" = 'commercial'
                       AND pe."priceType" IN ('negotiated','discounted')
                       AND pe."priceInCents" >= 10000)::int as ins_cnt
    FROM "PriceEntry" pe
    WHERE pe."procedureId" = ${proc.id}
  `;

  const s = stats[0];
  return {
    hasProcedure: true,
    priceCount: s.cnt,
    hospitalCount: s.hosp_cnt,
    hasCash: s.cash_cnt > 0,
    hasInsurance: s.ins_cnt > 0,
  };
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log(`\n${"=".repeat(100)}`);
  console.log(`  SYSTEM TEST — ${BASE}`);
  console.log(`  ${new Date().toISOString()}`);
  console.log(`${"=".repeat(100)}\n`);

  // ── Phase 1: DB coverage ──────────────────────────────────────────────────
  console.log("── PHASE 1: DATABASE COVERAGE ──────────────────────────────────────────────\n");
  console.log(`  ${pad("Procedure", 30)} ${pad("CPT", 6)} ${pad("InDB", 5)} ${pad("Prices", 10)} ${pad("Hosps", 6)} ${pad("Cash", 5)} ${pad("Ins", 5)}`);
  console.log(`  ${"-".repeat(80)}`);

  let dbHits = 0;
  let dbMisses = 0;
  const dbResults: Record<string, Awaited<ReturnType<typeof checkDbCoverage>>> = {};

  for (const tc of TEST_CASES) {
    const cov = await checkDbCoverage(tc.expectedCpt);
    dbResults[tc.expectedCpt] = cov;
    if (cov.hasProcedure) dbHits++;
    else dbMisses++;
    console.log(
      `  ${pad(tc.label, 30)} ${pad(tc.expectedCpt, 6)} ${pad(flag(cov.hasProcedure), 5)} ${pad(cov.priceCount.toLocaleString(), 10)} ${pad(String(cov.hospitalCount), 6)} ${pad(flag(cov.hasCash), 5)} ${pad(flag(cov.hasInsurance), 5)}`
    );
  }
  console.log(`\n  DB coverage: ${dbHits}/${TEST_CASES.length} procedures have data (${dbMisses} missing)\n`);

  // ── Phase 2: Search API speed + accuracy ──────────────────────────────────
  console.log("── PHASE 2: SEARCH API (procedure-search) ─────────────────────────────────\n");
  console.log(`  ${pad("Procedure", 30)} ${pad("Time", 8)} ${pad("Found", 6)} ${pad("TopCPT", 8)} ${pad("Match", 6)} ${pad("Results", 8)}`);
  console.log(`  ${"-".repeat(80)}`);

  let searchTotalMs = 0;
  let searchCorrect = 0;
  let searchFound = 0;
  const searchTimes: number[] = [];

  for (const tc of TEST_CASES) {
    try {
      const { data, ms } = await testSearch(tc.query);
      searchTotalMs += ms;
      searchTimes.push(ms);
      const topCpt = data.procedures?.[0]?.cptCode ?? "—";
      const isCorrect = topCpt === tc.expectedCpt;
      const hasResults = data.procedures?.length > 0;
      if (isCorrect) searchCorrect++;
      if (hasResults) searchFound++;

      console.log(
        `  ${pad(tc.label, 30)} ${pad(ms + "ms", 8)} ${pad(flag(hasResults), 6)} ${pad(topCpt, 8)} ${pad(flag(isCorrect), 6)} ${pad(String(data.procedures?.length ?? 0), 8)}`
      );
    } catch (e) {
      console.log(`  ${pad(tc.label, 30)} ERROR: ${e instanceof Error ? e.message : e}`);
    }
  }

  const avgSearch = Math.round(searchTotalMs / TEST_CASES.length);
  const p95Search = searchTimes.sort((a, b) => a - b)[Math.floor(searchTimes.length * 0.95)];
  console.log(`\n  Search accuracy: ${searchCorrect}/${TEST_CASES.length} correct top CPT match`);
  console.log(`  Search coverage: ${searchFound}/${TEST_CASES.length} returned results`);
  console.log(`  Speed — avg: ${avgSearch}ms, p95: ${p95Search}ms\n`);

  // ── Phase 3: Compare API speed + data quality ─────────────────────────────
  console.log("── PHASE 3: COMPARE API (hospitals/compare) ────────────────────────────────\n");
  console.log(`  ${pad("Procedure", 30)} ${pad("Time", 8)} ${pad("Hosps", 6)} ${pad("Real", 5)} ${pad("PriceRange", 22)} ${pad("Varied", 7)} ${pad("Flags", 20)}`);
  console.log(`  ${"-".repeat(110)}`);

  let compareTotalMs = 0;
  let compareHasData = 0;
  let compareVaried = 0;
  const compareTimes: number[] = [];
  const flags: string[] = [];

  for (const tc of TEST_CASES) {
    try {
      const { data, ms } = await testCompare(tc.expectedCpt, tc.insurer, tc.payerType);
      compareTotalMs += ms;
      compareTimes.push(ms);
      const entries = data.entries ?? [];
      const hasData = entries.length > 0;
      if (hasData) compareHasData++;

      const realCount = entries.filter(e => e.dataQuality === "real").length;
      const prices = entries.map(e => e.patientCost ?? e.cashPrice).filter((p): p is number => p != null);
      const uniquePrices = new Set(prices).size;
      const isVaried = uniquePrices > 1;
      if (isVaried) compareVaried++;

      const lo = prices.length ? Math.min(...prices) : 0;
      const hi = prices.length ? Math.max(...prices) : 0;
      const rangeStr = prices.length ? `$${lo.toLocaleString()} – $${hi.toLocaleString()}` : "—";

      // Flags
      const entryFlags: string[] = [];
      if (!hasData) entryFlags.push("NO_DATA");
      if (entries.length > 0 && !isVaried) entryFlags.push("ALL_SAME_PRICE");
      if (entries.some(e => e.isAiEstimate)) entryFlags.push("HAS_AI_EST");
      if (entries.length === 1) entryFlags.push("SINGLE_HOSP");
      if (prices.some(p => p < 50)) entryFlags.push("SUSPICIOUSLY_LOW");
      if (lo > 0 && hi > 0 && hi > lo * 10) entryFlags.push("HUGE_SPREAD");
      const db = dbResults[tc.expectedCpt];
      if (db && !db.hasProcedure) entryFlags.push("NOT_IN_DB");

      const flagStr = entryFlags.length ? entryFlags.join(", ") : "OK";
      if (entryFlags.length > 0 && entryFlags[0] !== "OK") flags.push(`${tc.label}: ${flagStr}`);

      console.log(
        `  ${pad(tc.label, 30)} ${pad(ms + "ms", 8)} ${pad(String(entries.length), 6)} ${pad(String(realCount), 5)} ${pad(rangeStr, 22)} ${pad(flag(isVaried), 7)} ${flagStr}`
      );
    } catch (e) {
      console.log(`  ${pad(tc.label, 30)} ERROR: ${e instanceof Error ? e.message : e}`);
      flags.push(`${tc.label}: ERROR`);
    }
  }

  const avgCompare = Math.round(compareTotalMs / TEST_CASES.length);
  const p95Compare = compareTimes.sort((a, b) => a - b)[Math.floor(compareTimes.length * 0.95)];
  console.log(`\n  Compare coverage: ${compareHasData}/${TEST_CASES.length} have hospital data`);
  console.log(`  Price variation: ${compareVaried}/${compareHasData} show different prices per hospital`);
  console.log(`  Speed — avg: ${avgCompare}ms, p95: ${p95Compare}ms\n`);

  // ── Summary ───────────────────────────────────────────────────────────────
  console.log("── SUMMARY ─────────────────────────────────────────────────────────────────\n");
  console.log(`  DB coverage:      ${dbHits}/${TEST_CASES.length} (${Math.round(dbHits / TEST_CASES.length * 100)}%)`);
  console.log(`  Search accuracy:  ${searchCorrect}/${TEST_CASES.length} (${Math.round(searchCorrect / TEST_CASES.length * 100)}%)`);
  console.log(`  Search speed:     avg ${avgSearch}ms, p95 ${p95Search}ms`);
  console.log(`  Compare coverage: ${compareHasData}/${TEST_CASES.length} (${Math.round(compareHasData / TEST_CASES.length * 100)}%)`);
  console.log(`  Price variation:  ${compareVaried}/${Math.max(compareHasData, 1)} (${Math.round(compareVaried / Math.max(compareHasData, 1) * 100)}%)`);
  console.log(`  Compare speed:    avg ${avgCompare}ms, p95 ${p95Compare}ms`);

  if (flags.length) {
    console.log(`\n  ⚠ FLAGS (${flags.length}):`);
    for (const f of flags) console.log(`    - ${f}`);
  } else {
    console.log(`\n  No flags — all procedures passed.`);
  }

  // Speed grades
  const searchGrade = avgSearch < 500 ? "A" : avgSearch < 1500 ? "B" : avgSearch < 3000 ? "C" : "F";
  const compareGrade = avgCompare < 1000 ? "A" : avgCompare < 3000 ? "B" : avgCompare < 5000 ? "C" : "F";
  const accuracyGrade = searchCorrect >= 18 ? "A" : searchCorrect >= 14 ? "B" : searchCorrect >= 10 ? "C" : "F";
  const coverageGrade = compareHasData >= 16 ? "A" : compareHasData >= 12 ? "B" : compareHasData >= 8 ? "C" : "F";

  console.log(`\n  GRADES:`);
  console.log(`    Search speed:    ${searchGrade} (${avgSearch}ms avg)`);
  console.log(`    Compare speed:   ${compareGrade} (${avgCompare}ms avg)`);
  console.log(`    Search accuracy: ${accuracyGrade} (${searchCorrect}/${TEST_CASES.length})`);
  console.log(`    Data coverage:   ${coverageGrade} (${compareHasData}/${TEST_CASES.length})`);

  console.log(`\n${"=".repeat(100)}\n`);
  await prisma.$disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
