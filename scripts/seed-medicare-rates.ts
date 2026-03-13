/**
 * Enriches the CptCode table with Medicare allowed amounts and average charges.
 * Source: CMS Medicare Physician & Other Practitioners Geo dataset (national level).
 *
 * Prerequisite: Run `python3` extraction first to generate /tmp/medicare_rates.csv
 * (see inline docs). Or just run this script — it reads from the pre-generated CSV.
 *
 * Usage:
 *   npx tsx scripts/seed-medicare-rates.ts
 */

import { PrismaClient } from "../src/generated/prisma";
import { readFileSync } from "fs";

const prisma = new PrismaClient();

function parseCsv(content: string): { code: string; medicareRate: number; avgCharge: number; totalServices: number }[] {
  const lines = content.split("\n").slice(1); // skip header
  const results: { code: string; medicareRate: number; avgCharge: number; totalServices: number }[] = [];

  for (const line of lines) {
    if (!line.trim()) continue;
    const [code, rate, charge, services] = line.split(",");
    if (!code) continue;
    results.push({
      code: code.trim(),
      medicareRate: parseFloat(rate) || 0,
      avgCharge: parseFloat(charge) || 0,
      totalServices: parseFloat(services) || 0,
    });
  }
  return results;
}

async function main() {
  const csvPath = "/tmp/medicare_rates.csv";
  console.log(`Reading Medicare rates from ${csvPath}...`);

  const content = readFileSync(csvPath, "utf-8");
  const entries = parseCsv(content);
  console.log(`Parsed ${entries.length} codes.\n`);

  const BATCH_SIZE = 200;
  let updated = 0;

  for (let i = 0; i < entries.length; i += BATCH_SIZE) {
    const batch = entries.slice(i, i + BATCH_SIZE);

    await prisma.$transaction(
      batch.map(({ code, medicareRate, avgCharge, totalServices }) =>
        prisma.cptCode.updateMany({
          where: { code },
          data: { medicareRate, avgCharge, totalServices },
        }),
      ),
    );

    updated += batch.length;
    if (updated % 2000 === 0 || updated === entries.length) {
      console.log(`  Updated ${updated}/${entries.length}`);
    }
  }

  // Verify
  const examples = await prisma.cptCode.findMany({
    where: { code: { in: ["27447", "99213", "33533", "47562", "59510"] } },
    select: { code: true, description: true, medicareRate: true, avgCharge: true, totalServices: true },
  });
  console.log("\nVerification:");
  for (const e of examples) {
    console.log(`  ${e.code}: Medicare $${e.medicareRate?.toFixed(0)}, Charge $${e.avgCharge?.toFixed(0)}, Services ${e.totalServices?.toFixed(0)}`);
  }
}

main()
  .catch((err) => { console.error("Fatal:", err); process.exit(1); })
  .finally(() => prisma.$disconnect());
