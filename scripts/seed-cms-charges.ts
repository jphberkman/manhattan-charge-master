/**
 * Seeds the CmsChargeData table from CMS data.gov SODA API.
 *
 * Data sources (Socrata/SODA API — free, no auth needed):
 *   - Inpatient: https://data.cms.gov/resource/97k6-zzx3.json
 *   - Outpatient: https://data.cms.gov/resource/fhn5-hzrm.json
 *
 * Fetches charge data for major Manhattan hospitals by CMS CCN.
 * Safe to re-run — uses upsert on (providerId, drgCode, dataYear, serviceType).
 *
 * Usage:
 *   npx tsx scripts/seed-cms-charges.ts
 */

import { PrismaClient } from "../src/generated/prisma";

const prisma = new PrismaClient();

// ── Manhattan hospital CCNs ──────────────────────────────────────────────────

const MANHATTAN_CCNS = [
  "330214", // NYU Langone
  "330101", // NYP Cornell
  "330024", // Mount Sinai
  "330154", // MSK
  "330064", // Bellevue
  "330119", // Lenox Hill
  "330270", // HSS
  "330234", // NYP Columbia
];

// ── SODA API endpoints ───────────────────────────────────────────────────────

const ENDPOINTS = {
  inpatient: "https://data.cms.gov/resource/97k6-zzx3.json",
  outpatient: "https://data.cms.gov/resource/fhn5-hzrm.json",
} as const;

// ── Field name normalization ─────────────────────────────────────────────────
// The SODA API sometimes returns camelCase, sometimes snake_case.
// We normalize to a common shape.

interface RawRecord {
  [key: string]: string | number | undefined;
}

interface NormalizedRecord {
  providerId: string;
  hospitalName: string;
  drgCode: string;
  drgDescription: string;
  totalDischarges: number;
  avgCoveredCharges: number;  // dollars from API
  avgTotalPayments: number;   // dollars from API
  avgMedicarePayments: number; // dollars from API
}

function getField(row: RawRecord, ...candidates: string[]): string {
  for (const key of candidates) {
    // Try exact match, then lowercase
    if (row[key] !== undefined) return String(row[key]);
    const lower = key.toLowerCase();
    const found = Object.entries(row).find(([k]) => k.toLowerCase() === lower);
    if (found && found[1] !== undefined) return String(found[1]);
  }
  return "";
}

function normalize(row: RawRecord, serviceType: "inpatient" | "outpatient"): NormalizedRecord | null {
  const providerId = getField(row,
    "rndrng_prvdr_ccn", "Rndrng_Prvdr_CCN", "provider_ccn",
    "prvdr_num", "provider_id", "facility_id"
  );
  const hospitalName = getField(row,
    "rndrng_prvdr_org_name", "Rndrng_Prvdr_Org_Name", "provider_name",
    "prvdr_name", "facility_name"
  );

  let drgCode: string;
  let drgDescription: string;

  if (serviceType === "inpatient") {
    drgCode = getField(row, "drg_cd", "DRG_Cd", "ms_drg", "drg_definition", "drg_code");
    drgDescription = getField(row, "drg_desc", "DRG_Desc", "drg_description", "drg_definition");
  } else {
    drgCode = getField(row, "apc_cd", "APC_Cd", "apc", "apc_code", "hcpcs_code");
    drgDescription = getField(row, "apc_desc", "APC_Desc", "apc_description");
  }

  const totalDischarges = parseFloat(getField(row,
    "tot_dschrgs", "Tot_Dschrgs", "total_discharges",
    "capc_srvcs", "total_services"
  )) || 0;

  const avgCoveredCharges = parseFloat(getField(row,
    "avg_submtd_cvrd_chrg", "Avg_Submtd_Cvrd_Chrg",
    "avg_tot_sbmtd_chrg", "average_covered_charges",
    "avg_submtd_chrg"
  )) || 0;

  const avgTotalPayments = parseFloat(getField(row,
    "avg_tot_pymt_amt", "Avg_Tot_Pymt_Amt",
    "avg_tot_pymt", "average_total_payments"
  )) || 0;

  const avgMedicarePayments = parseFloat(getField(row,
    "avg_mdcr_pymt_amt", "Avg_Mdcr_Pymt_Amt",
    "avg_mdcr_pymt", "average_medicare_payments"
  )) || 0;

  if (!providerId || !drgCode) return null;

  return {
    providerId,
    hospitalName,
    drgCode,
    drgDescription,
    totalDischarges: Math.round(totalDischarges),
    avgCoveredCharges,
    avgTotalPayments,
    avgMedicarePayments,
  };
}

// ── Fetch from SODA API ──────────────────────────────────────────────────────

async function fetchChargeData(
  serviceType: "inpatient" | "outpatient"
): Promise<NormalizedRecord[]> {
  const endpoint = ENDPOINTS[serviceType];
  const ccnList = MANHATTAN_CCNS.map((c) => `'${c}'`).join(",");

  // Try CCN-based filter first, then city-based fallback
  const queries = [
    `$where=rndrng_prvdr_ccn in (${ccnList})&$limit=5000`,
    `$where=Rndrng_Prvdr_CCN in (${ccnList})&$limit=5000`,
    `$where=rndrng_prvdr_state_abrvtn='NY' AND rndrng_prvdr_city='NEW YORK'&$limit=5000`,
    `$where=prvdr_num in (${ccnList})&$limit=5000`,
  ];

  for (const query of queries) {
    const url = `${endpoint}?${query}`;
    console.log(`  Trying: ${url.slice(0, 120)}...`);

    try {
      const res = await fetch(url, {
        signal: AbortSignal.timeout(30000),
        headers: { Accept: "application/json" },
      });

      if (!res.ok) {
        console.log(`  HTTP ${res.status} — trying next query pattern...`);
        continue;
      }

      const data: RawRecord[] = await res.json();
      if (!data.length) {
        console.log(`  No results — trying next query pattern...`);
        continue;
      }

      console.log(`  Got ${data.length} raw records.`);

      // Normalize and filter
      const records: NormalizedRecord[] = [];
      for (const row of data) {
        const rec = normalize(row, serviceType);
        if (rec) records.push(rec);
      }

      console.log(`  Normalized to ${records.length} valid records.`);
      return records;
    } catch (err) {
      console.log(`  Fetch error: ${err instanceof Error ? err.message : err}`);
      continue;
    }
  }

  console.log(`  All query patterns exhausted for ${serviceType}. Returning empty.`);
  return [];
}

// ── Upsert into database ─────────────────────────────────────────────────────

const DATA_YEAR = 2022; // CMS data.gov currently has 2022 data

async function upsertBatch(records: NormalizedRecord[], serviceType: "inpatient" | "outpatient") {
  const BATCH_SIZE = 100;
  let upserted = 0;

  for (let i = 0; i < records.length; i += BATCH_SIZE) {
    const batch = records.slice(i, i + BATCH_SIZE);

    await prisma.$transaction(
      batch.map((rec) =>
        prisma.cmsChargeData.upsert({
          where: {
            providerId_drgCode_dataYear_serviceType: {
              providerId: rec.providerId,
              drgCode: rec.drgCode,
              dataYear: DATA_YEAR,
              serviceType,
            },
          },
          create: {
            providerId: rec.providerId,
            hospitalName: rec.hospitalName,
            drgCode: rec.drgCode,
            drgDescription: rec.drgDescription,
            totalDischarges: rec.totalDischarges,
            avgCoveredCharges: Math.round(rec.avgCoveredCharges * 100), // store as cents
            avgTotalPayments: Math.round(rec.avgTotalPayments * 100),
            avgMedicarePayments: Math.round(rec.avgMedicarePayments * 100),
            dataYear: DATA_YEAR,
            serviceType,
          },
          update: {
            hospitalName: rec.hospitalName,
            drgDescription: rec.drgDescription,
            totalDischarges: rec.totalDischarges,
            avgCoveredCharges: Math.round(rec.avgCoveredCharges * 100),
            avgTotalPayments: Math.round(rec.avgTotalPayments * 100),
            avgMedicarePayments: Math.round(rec.avgMedicarePayments * 100),
          },
        })
      )
    );

    upserted += batch.length;
    process.stdout.write(`\r  Upserted ${upserted}/${records.length}...`);
  }

  console.log(); // newline after progress
  return upserted;
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log("=== CMS Hospital Charge Data Seeder ===\n");

  let totalInpatient = 0;
  let totalOutpatient = 0;

  // Inpatient
  console.log("Fetching INPATIENT charge data...");
  const inpatient = await fetchChargeData("inpatient");
  if (inpatient.length) {
    totalInpatient = await upsertBatch(inpatient, "inpatient");
  }

  // Outpatient
  console.log("\nFetching OUTPATIENT charge data...");
  const outpatient = await fetchChargeData("outpatient");
  if (outpatient.length) {
    totalOutpatient = await upsertBatch(outpatient, "outpatient");
  }

  // Summary
  console.log("\n=== Summary ===");
  console.log(`  Inpatient records:  ${totalInpatient}`);
  console.log(`  Outpatient records: ${totalOutpatient}`);
  console.log(`  Total:              ${totalInpatient + totalOutpatient}`);
  console.log(`  Data year:          ${DATA_YEAR}`);

  // Show unique hospitals
  const hospitals = await prisma.cmsChargeData.groupBy({
    by: ["providerId", "hospitalName"],
    _count: { id: true },
  });
  console.log(`\n  Hospitals in DB:`);
  for (const h of hospitals) {
    console.log(`    ${h.providerId} — ${h.hospitalName} (${h._count.id} records)`);
  }
}

main()
  .catch((err) => {
    console.error("Fatal error:", err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
