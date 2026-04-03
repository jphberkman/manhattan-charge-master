/**
 * Seeds CptCode table with CMS MPFS (Medicare Physician Fee Schedule) data.
 * Populates facilityRate, nonFacilityRate, and totalRvu for Manhattan locality.
 *
 * Data source: CMS MPFS Public Use File via data.cms.gov SODA API.
 * Falls back to computing from existing medicareRate if API is unavailable.
 *
 * Also updates Hospital records with CMS CCN (Provider ID) for Manhattan hospitals.
 *
 * Usage:
 *   npx tsx scripts/seed-mpfs-rates.ts
 */

import { PrismaClient } from "../src/generated/prisma";

const prisma = new PrismaClient();

/* ---------- Manhattan hospital CCN map ---------- */
const MANHATTAN_CCNS: Record<string, string> = {
  "330214": "NYU Langone Health (Tisch Hospital)",
  "330101": "NewYork-Presbyterian / Weill Cornell",
  "330024": "The Mount Sinai Hospital",
  "330154": "Memorial Sloan Kettering Cancer Center",
  "330064": "Bellevue Hospital Center",
  "330119": "Lenox Hill Hospital (Northwell)",
  "330270": "Hospital for Special Surgery",
  "330234": "NYP / Columbia University Irving Medical Center",
};

/* ---------- Types ---------- */
interface MpfsRow {
  hcpcs_code?: string;
  hcpcs_cd?: string;
  locality?: string;
  mac_locality?: string;
  facility_fee_amount?: string;
  fac_pe_rvu?: string;
  non_facility_fee_amount?: string;
  nfac_pe_rvu?: string;
  total_rvu?: string;
  tot_rvu?: string;
  pf_facility?: string;
  pf_nonfacility?: string;
}

interface ParsedRate {
  code: string;
  facilityRate: number;
  nonFacilityRate: number;
  totalRvu: number;
}

/* ---------- SODA API fetch ---------- */

const SODA_ENDPOINTS = [
  // 2025 MPFS PUF — try multiple known resource IDs
  "https://data.cms.gov/resource/8we4-shhx.json",
  "https://data.cms.gov/resource/hi7n-wgkc.json",
  "https://data.cms.gov/resource/aah4-99qh.json",
];

async function fetchFromSodaApi(): Promise<ParsedRate[]> {
  const results: ParsedRate[] = [];

  for (const baseUrl of SODA_ENDPOINTS) {
    console.log(`Trying SODA endpoint: ${baseUrl}`);

    try {
      // Try different locality filter formats
      const queries = [
        `${baseUrl}?$limit=50000&$where=locality='01' OR locality='00'`,
        `${baseUrl}?$limit=50000&$where=mac_locality='01' OR mac_locality='00'`,
        `${baseUrl}?$limit=50000&locality=01`,
      ];

      for (const url of queries) {
        try {
          const resp = await fetch(url, {
            headers: { Accept: "application/json" },
            signal: AbortSignal.timeout(30000),
          });

          if (!resp.ok) continue;

          const rows: MpfsRow[] = await resp.json();
          if (!Array.isArray(rows) || rows.length === 0) continue;

          console.log(`  Got ${rows.length} rows from ${url.split("?")[0]}`);

          for (const row of rows) {
            const code = (row.hcpcs_code || row.hcpcs_cd || "").trim();
            if (!code || code.length < 4) continue;

            const facilityRate = parseFloat(
              row.facility_fee_amount || row.pf_facility || "0"
            );
            const nonFacilityRate = parseFloat(
              row.non_facility_fee_amount || row.pf_nonfacility || "0"
            );
            const totalRvu = parseFloat(
              row.total_rvu || row.tot_rvu || "0"
            );

            if (facilityRate > 0 || nonFacilityRate > 0) {
              results.push({ code, facilityRate, nonFacilityRate, totalRvu });
            }
          }

          if (results.length > 0) {
            console.log(`  Parsed ${results.length} valid MPFS rates.\n`);
            return results;
          }
        } catch {
          // try next query format
        }
      }
    } catch {
      // try next endpoint
    }
  }

  return results;
}

/* ---------- Fallback: derive from existing medicareRate ---------- */

async function deriveFromExistingRates(): Promise<ParsedRate[]> {
  console.log("Falling back to deriving rates from existing CptCode.medicareRate...");

  const codes = await prisma.cptCode.findMany({
    where: { medicareRate: { not: null } },
    select: { code: true, medicareRate: true },
  });

  console.log(`  Found ${codes.length} codes with existing medicareRate.`);

  // Rough heuristic: facility rate ~85% of medicare rate, non-facility ~100%
  // This is imprecise but better than nothing as a fallback.
  return codes
    .filter((c) => c.medicareRate && c.medicareRate > 0)
    .map((c) => ({
      code: c.code,
      facilityRate: Math.round((c.medicareRate! * 0.85) * 100) / 100,
      nonFacilityRate: c.medicareRate!,
      totalRvu: 0, // unknown without RVU data
    }));
}

/* ---------- Seed CPT codes ---------- */

async function seedMpfsRates(rates: ParsedRate[]) {
  const BATCH_SIZE = 200;
  let updated = 0;
  let notFound = 0;

  // Deduplicate — prefer Manhattan locality (locality='01') over national ('00')
  const deduped = new Map<string, ParsedRate>();
  for (const r of rates) {
    const existing = deduped.get(r.code);
    // Later entries (locality-specific) overwrite national if they have data
    if (!existing || r.facilityRate > 0) {
      deduped.set(r.code, r);
    }
  }

  const uniqueRates = Array.from(deduped.values());
  console.log(`Seeding ${uniqueRates.length} unique CPT codes with MPFS rates...`);

  for (let i = 0; i < uniqueRates.length; i += BATCH_SIZE) {
    const batch = uniqueRates.slice(i, i + BATCH_SIZE);

    const txOps = batch.map(({ code, facilityRate, nonFacilityRate, totalRvu }) => {
      const data: Record<string, number> = {};
      if (facilityRate > 0) data.facilityRate = facilityRate;
      if (nonFacilityRate > 0) data.nonFacilityRate = nonFacilityRate;
      if (totalRvu > 0) data.totalRvu = totalRvu;
      // Also update medicareRate to the non-facility rate if it's a better value
      if (nonFacilityRate > 0) data.medicareRate = nonFacilityRate;

      return prisma.cptCode.updateMany({
        where: { code },
        data,
      });
    });

    const results = await prisma.$transaction(txOps);
    const batchNotFound = results.filter((r) => r.count === 0).length;
    notFound += batchNotFound;
    updated += batch.length - batchNotFound;

    if ((i + BATCH_SIZE) % 2000 < BATCH_SIZE || i + BATCH_SIZE >= uniqueRates.length) {
      console.log(
        `  Processed ${Math.min(i + BATCH_SIZE, uniqueRates.length)}/${uniqueRates.length} (${updated} updated, ${notFound} not in DB)`
      );
    }
  }

  console.log(`\nMPFS seeding complete: ${updated} codes updated, ${notFound} codes not in CptCode table.`);
}

/* ---------- Seed hospital CCNs ---------- */

async function seedHospitalCcns() {
  console.log("\nUpdating Manhattan hospital CMS Provider IDs...");

  for (const [ccn, hospitalName] of Object.entries(MANHATTAN_CCNS)) {
    // Try to match by name substring — hospital names in DB may not match exactly
    const nameWords = hospitalName
      .replace(/[()]/g, "")
      .split(/\s+/)
      .filter((w) => w.length > 3 && !["Hospital", "Center", "Medical"].includes(w));

    // Build OR conditions for flexible matching
    let hospital = null;

    // Try exact-ish matches first
    for (const word of nameWords) {
      hospital = await prisma.hospital.findFirst({
        where: {
          name: { contains: word, mode: "insensitive" as const },
          borough: "Manhattan",
        },
      });
      if (hospital) break;
    }

    if (hospital) {
      await prisma.hospital.update({
        where: { id: hospital.id },
        data: { cmsProviderId: ccn },
      });
      console.log(`  ${ccn} → ${hospital.name} (matched)`);
    } else {
      console.log(`  ${ccn} → "${hospitalName}" (no match in DB — skipped)`);
    }
  }
}

/* ---------- Main ---------- */

async function main() {
  console.log("=== CMS MPFS Rate Seeder ===\n");

  // Step 1: Fetch rates from SODA API or fall back
  let rates = await fetchFromSodaApi();

  if (rates.length === 0) {
    console.log("SODA API returned no results.\n");
    rates = await deriveFromExistingRates();
  }

  if (rates.length === 0) {
    console.log("No rates available to seed. Skipping CPT update.");
  } else {
    // Step 2: Seed CPT codes
    await seedMpfsRates(rates);
  }

  // Step 3: Verify
  const examples = await prisma.cptCode.findMany({
    where: { code: { in: ["27447", "99213", "33533", "47562", "59510"] } },
    select: {
      code: true,
      description: true,
      medicareRate: true,
      facilityRate: true,
      nonFacilityRate: true,
      totalRvu: true,
    },
  });
  console.log("\nVerification (sample CPT codes):");
  for (const e of examples) {
    console.log(
      `  ${e.code}: Facility $${e.facilityRate?.toFixed(2) ?? "—"}, ` +
        `Non-Facility $${e.nonFacilityRate?.toFixed(2) ?? "—"}, ` +
        `RVU ${e.totalRvu?.toFixed(2) ?? "—"}, ` +
        `Medicare $${e.medicareRate?.toFixed(2) ?? "—"}`
    );
  }

  // Step 4: Seed hospital CCNs
  await seedHospitalCcns();

  console.log("\nDone.");
}

main()
  .catch((err) => {
    console.error("Fatal:", err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
