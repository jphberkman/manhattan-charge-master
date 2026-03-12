/**
 * Seeds the CptCode table from the CMS Medicare Physician Fee Schedule data.
 *
 * Source: CMS Medicare Physician & Other Practitioners – by Geography and Service (2023)
 * Contains 9,297 unique CPT/HCPCS codes with official descriptions.
 *
 * Safe to re-run — uses upsert so existing rows are updated, not duplicated.
 *
 * Usage:
 *   npx tsx scripts/seed-cpt-codes.ts
 */

import { PrismaClient } from "../src/generated/prisma";
import { readFileSync } from "fs";
import { join } from "path";

const prisma = new PrismaClient();

function parseCsv(content: string): { code: string; description: string }[] {
  const lines = content.split("\n").slice(1); // skip header
  const results: { code: string; description: string }[] = [];

  for (const line of lines) {
    if (!line.trim()) continue;

    // Handle CSV with quoted fields
    const match = line.match(/^"?([^",]+)"?,\s*"?(.+?)"?\s*$/);
    if (match) {
      results.push({ code: match[1].trim(), description: match[2].trim() });
    }
  }

  return results;
}

async function main() {
  const csvPath = join(__dirname, "..", "prisma", "cpt_codes.csv");
  console.log(`Reading CPT codes from ${csvPath}...`);

  const content = readFileSync(csvPath, "utf-8");
  const codes = parseCsv(content);
  console.log(`Parsed ${codes.length} CPT/HCPCS codes.\n`);

  // Upsert in batches using transactions
  const BATCH_SIZE = 200;
  let inserted = 0;

  for (let i = 0; i < codes.length; i += BATCH_SIZE) {
    const batch = codes.slice(i, i + BATCH_SIZE);

    await prisma.$transaction(
      batch.map(({ code, description }) =>
        prisma.cptCode.upsert({
          where: { code },
          create: { code, description },
          update: { description },
        }),
      ),
    );

    inserted += batch.length;
    if (inserted % 1000 === 0 || inserted === codes.length) {
      console.log(`  Upserted ${inserted}/${codes.length}`);
    }
  }

  const count = await prisma.cptCode.count();
  console.log(`\nDone! ${count} CPT/HCPCS codes in database.`);
}

main()
  .catch((err) => {
    console.error("Fatal error:", err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
