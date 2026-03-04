#!/usr/bin/env node
/**
 * Seed Manhattan hospital price data into SQLite.
 *
 * Usage:
 *   npm run seed:prices           # seed all hospitals
 *   npm run seed:prices msk       # seed one hospital by id
 */

import { createReadStream } from "fs";
import { Readable } from "stream";
import { PrismaClient } from "../../generated/prisma/index.js";
import {
  MANHATTAN_HOSPITALS,
  PROCEDURE_METADATA,
} from "./hospital-registry.js";
import { parseCmsJsonStream } from "./parsers/parse-cms-json.js";
import { parseNyuCsvStream } from "./parsers/parse-nyu-csv.js";
import type { NormalizedPriceEntry } from "./types.js";

const prisma = new PrismaClient();
const BATCH_SIZE = 500;

// ── Procedures ────────────────────────────────────────────────────────────────

async function seedProcedures() {
  for (const [cptCode, meta] of Object.entries(PROCEDURE_METADATA)) {
    await prisma.procedure.upsert({
      where: { cptCode },
      update: meta,
      create: { cptCode, ...meta },
    });
  }
  console.log(`✓ Procedures seeded (${Object.keys(PROCEDURE_METADATA).length})`);
}

// ── Single hospital ───────────────────────────────────────────────────────────

async function seedHospital(
  config: (typeof MANHATTAN_HOSPITALS)[0]
): Promise<void> {
  const hospital = await prisma.hospital.upsert({
    where: { id: config.id },
    update: { name: config.name, sourceFile: config.sourceFile },
    create: {
      id: config.id,
      name: config.name,
      address: config.address,
      sourceFile: config.sourceFile,
    },
  });

  await prisma.priceEntry.deleteMany({ where: { hospitalId: hospital.id } });

  const procedures = await prisma.procedure.findMany();
  const procedureMap = new Map(procedures.map((p) => [p.cptCode, p.id]));

  // Collect all matching entries first (we only keep ~13 CPT codes so memory
  // usage is bounded to a few thousand records even for multi-GB source files)
  const collected: NormalizedPriceEntry[] = [];

  if (config.format === "cms-json") {
    const stream = await openSource(config.sourceFile);
    await parseCmsJsonStream(stream, (e) => collected.push(e));
  } else {
    // Stream the CSV — file can exceed V8's string size limit (>512 MB)
    const stream = await openSource(config.sourceFile);
    await parseNyuCsvStream(stream, (e) => collected.push(e));
  }

  // Batch-insert into DB
  const rows = collected.flatMap((entry) => {
    const procedureId = procedureMap.get(entry.cptCode);
    if (!procedureId) return [];
    return [
      {
        hospitalId: hospital.id,
        procedureId,
        payerName: entry.payerName,
        payerType: entry.payerType,
        priceInCents: entry.priceInCents,
        priceType: entry.priceType,
        rawCode: entry.rawCode,
      },
    ];
  });

  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    await prisma.priceEntry.createMany({ data: rows.slice(i, i + BATCH_SIZE) });
  }

  await prisma.hospital.update({
    where: { id: hospital.id },
    data: { lastSeeded: new Date() },
  });

  console.log(`  ✓ ${hospital.name} — ${rows.length} price entries`);
}

// ── Helpers ───────────────────────────────────────────────────────────────────

async function openSource(sourceFile: string): Promise<Readable> {
  if (!sourceFile.startsWith("http")) {
    return createReadStream(sourceFile, { encoding: "utf-8" });
  }
  console.log(`  Fetching ${sourceFile} …`);
  const res = await fetch(sourceFile, {
    headers: { "User-Agent": "HospitalPriceTransparency/1.0" },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${sourceFile}`);
  const reader = res.body!.getReader();
  return new Readable({
    async read() {
      const { done, value } = await reader.read();
      if (done) this.push(null);
      else this.push(Buffer.from(value));
    },
  });
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  const target = process.argv[2];
  console.log("🏥 Seeding hospital price data…\n");

  await seedProcedures();

  for (const hospital of MANHATTAN_HOSPITALS) {
    if (target && hospital.id !== target) continue;
    console.log(`Processing: ${hospital.name}`);
    try {
      await seedHospital(hospital);
    } catch (err) {
      console.error(`  ✗ Failed: ${err instanceof Error ? err.message : err}`);
    }
  }

  await prisma.$disconnect();
  console.log("\n✅ Done");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
