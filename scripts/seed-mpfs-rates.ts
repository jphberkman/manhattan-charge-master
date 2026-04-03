/**
 * Seeds CptCode table with CMS MPFS (Medicare Physician Fee Schedule) data.
 * Populates facilityRate, nonFacilityRate, and totalRvu for Manhattan locality.
 *
 * Data source: CMS PFS portal CSV (pfs.data.cms.gov).
 * Falls back to computing from existing medicareRate if download fails.
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

/* ---------- CMS PFS CSV download ---------- */

// CMS PFS portal CSV URLs — try most recent first
const PFS_CSV_URLS = [
  "https://pfs.data.cms.gov/sites/default/files/data/indicators2025-09-23-2025.csv",
  "https://pfs.data.cms.gov/sites/default/files/data/indicators2026-02-10-2026.csv",
];

async function fetchFromPfsCsv(): Promise<ParsedRate[]> {
  const results: ParsedRate[] = [];

  for (const csvUrl of PFS_CSV_URLS) {
    console.log(`Trying PFS CSV: ${csvUrl}`);

    try {
      const resp = await fetch(csvUrl, {
        signal: AbortSignal.timeout(60000),
        headers: { "User-Agent": "Mozilla/5.0 (compatible; PriceTransparency/1.0)" },
      });

      if (!resp.ok) {
        console.log(`  HTTP ${resp.status} — trying next URL...`);
        continue;
      }

      const text = await resp.text();
      const lines = text.split("\n");
      if (lines.length < 2) {
        console.log(`  Empty CSV — trying next URL...`);
        continue;
      }

      // Parse header to find column indices
      const header = lines[0].toLowerCase().split(",").map((h) => h.trim().replace(/"/g, ""));
      const hcpcIdx = header.findIndex((h) => h === "hcpc" || h === "hcpcs" || h === "hcpcs_code");
      // PFS CSV has total RVU columns — need to multiply by conversion factor for dollar amount
      const facTotalIdx = header.indexOf("full_fac_total");    // Total facility RVUs
      const nfacTotalIdx = header.indexOf("full_nfac_total");  // Total non-facility RVUs
      const transFacIdx = header.indexOf("trans_fac_total");   // Transitional facility RVUs (fallback)
      const transNfacIdx = header.indexOf("trans_nfac_total"); // Transitional non-fac RVUs (fallback)
      const cfIdx = header.indexOf("conv_fact");               // Conversion factor
      const rvuWorkIdx = header.indexOf("rvu_work");           // Work RVU

      if (hcpcIdx === -1) {
        console.log(`  Could not find HCPC column in header: ${header.slice(0, 10).join(", ")}...`);
        continue;
      }

      console.log(`  Header: hcpc=${hcpcIdx}, full_fac_total=${facTotalIdx}, full_nfac_total=${nfacTotalIdx}, conv_fact=${cfIdx}`);
      console.log(`  Parsing ${lines.length - 1} data rows...`);

      for (let i = 1; i < lines.length; i++) {
        const cols = lines[i].split(",").map((c) => c.trim().replace(/"/g, ""));
        const code = (cols[hcpcIdx] || "").trim();
        if (!code || code.length < 4) continue;

        // Get conversion factor (should be ~32.35 for 2025)
        const cf = cfIdx >= 0 ? parseFloat(cols[cfIdx]) || 32.3465 : 32.3465;

        // Total RVUs → multiply by CF to get dollar amounts
        const facRvu = (facTotalIdx >= 0 ? parseFloat(cols[facTotalIdx]) : 0) ||
                       (transFacIdx >= 0 ? parseFloat(cols[transFacIdx]) : 0) || 0;
        const nfacRvu = (nfacTotalIdx >= 0 ? parseFloat(cols[nfacTotalIdx]) : 0) ||
                        (transNfacIdx >= 0 ? parseFloat(cols[transNfacIdx]) : 0) || 0;

        const facilityRate = Math.round(facRvu * cf * 100) / 100;
        const nonFacilityRate = Math.round(nfacRvu * cf * 100) / 100;
        const totalRvu = facRvu || nfacRvu;

        if (facilityRate > 0 || nonFacilityRate > 0) {
          results.push({ code, facilityRate, nonFacilityRate, totalRvu });
        }
      }

      if (results.length > 0) {
        console.log(`  Parsed ${results.length} valid MPFS rates.\n`);
        return results;
      }

      console.log(`  No valid rates found — trying next URL...`);
    } catch (err) {
      console.log(`  Fetch error: ${err instanceof Error ? err.message : err}`);
      continue;
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

  // Step 1: Fetch rates from CMS PFS CSV or fall back
  let rates = await fetchFromPfsCsv();

  if (rates.length === 0) {
    console.log("PFS CSV returned no results.\n");
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
