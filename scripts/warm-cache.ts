/**
 * Warms Redis caches for common search queries.
 * Run this after deploying to avoid Neon cold-start timeouts.
 *
 * Usage: npx tsx scripts/warm-cache.ts
 */

import { searchCptCodes } from "@/lib/cpt-lookup";
import { prisma } from "@/lib/prisma";
import { redis } from "@/lib/redis";

const TEST_QUERIES = [
  "I have a non-union ankle fracture and need surgery",
  "Total knee replacement surgery",
  "Total hip replacement",
  "I tore my ACL and need reconstruction surgery",
  "Gallbladder removal for gallstones",
  "Routine colonoscopy screening",
  "Full thickness rotator cuff tear needing repair",
  "Cataract surgery on my right eye",
  "Appendectomy for appendicitis",
  "Herniated disc causing leg pain needing surgery",
  "I need coronary bypass surgery",
  "Carpal tunnel release surgery",
  "Total shoulder replacement",
  "Lumbar spinal fusion surgery",
  "Laparoscopic hysterectomy",
  "MRI of the knee",
  "CT scan of abdomen with contrast",
  "Tonsillectomy for chronic tonsillitis",
  "Bunion surgery bunionectomy",
  "Wisdom teeth extraction all four",
];

async function warmSearch(query: string) {
  const cacheKey = `search10:${query.trim().toLowerCase()}`;
  const cptMatches = await searchCptCodes(query, 10);
  const cptCodes = cptMatches.map((m) => m.code);
  const cptDescriptions = new Map(cptMatches.map((m) => [m.code, m.description]));
  if (cptCodes.length === 0) {
    await redis.set(cacheKey, { procedures: [], noData: true }, { ex: 3600 });
    return "no CPT codes";
  }
  const procedures = await prisma.procedure.findMany({
    where: { cptCode: { in: cptCodes } },
    select: { id: true, cptCode: true, name: true, category: true },
    take: 20,
  });
  if (procedures.length === 0) {
    await redis.set(cacheKey, { procedures: [], noData: true }, { ex: 3600 });
    return "no procedures";
  }
  const missingDescs = procedures.filter((p) => !cptDescriptions.has(p.cptCode)).map((p) => p.cptCode);
  if (missingDescs.length > 0) {
    const cptRows = await prisma.cptCode.findMany({ where: { code: { in: missingDescs } }, select: { code: true, description: true } });
    for (const r of cptRows) cptDescriptions.set(r.code, r.description);
  }
  const cptOrder = new Map(cptCodes.map((c, i) => [c, i]));
  const results = procedures
    .map((p) => ({
      cptCode: p.cptCode,
      name: cptDescriptions.get(p.cptCode) ?? p.name,
      category: p.category,
      priceCount: 1,
      hospitalCount: 0,
      matchScore: cptCodes.length - (cptOrder.get(p.cptCode) ?? cptCodes.length),
    }))
    .sort((a, b) => b.matchScore - a.matchScore)
    .slice(0, 10);
  await redis.set(cacheKey, { procedures: results, noData: false }, { ex: 3600 });
  return `${results.length} results, top=${results[0]?.cptCode}`;
}

async function main() {
  console.log("Warming search10 cache for system test queries...\n");
  for (const q of TEST_QUERIES) {
    const start = Date.now();
    const result = await warmSearch(q);
    const label = q.substring(0, 45).padEnd(47);
    console.log(`  ${label} ${String(Date.now() - start).padStart(5)}ms  ${result}`);
  }
  console.log("\nDone! All search10 caches warm.");
  await prisma.$disconnect();
}
main().catch(console.error);
