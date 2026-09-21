/**
 * List SearchLog queries that resolved to nothing.
 * Review output by hand before adding ConditionMapping rows.
 *
 *   DATABASE_URL=... npx tsx scripts/review-search-misses.ts
 */
import { prisma } from "../src/lib/prisma";

async function main() {
  const misses = await prisma.searchLog.groupBy({
    by: ["query", "endpoint"],
    where: { resultCount: 0 },
    _count: { query: true },
    _max: { createdAt: true },
    orderBy: { _count: { query: "desc" } },
    take: 50,
  });

  if (!misses.length) {
    console.log("No zero-result search logs.");
    return;
  }

  console.log("Search misses (human review only — do not auto-map):\n");
  for (const row of misses) {
    console.log(
      `${row._count.query}\t${row.endpoint}\t${row._max.createdAt?.toISOString() ?? ""}\t${row.query}`,
    );
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
