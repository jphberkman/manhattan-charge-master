/**
 * Real-time CMS Medicare Physician Fee Schedule (MPFS) API fallback.
 *
 * Queries the CMS SODA API when the local DB doesn't have a Medicare rate
 * for a given CPT/HCPCS code. Results are cached in Redis for 30 days.
 *
 * Data source: CMS MPFS via data.cms.gov (Socrata/SODA — free, no auth)
 */

import { redis } from "@/lib/redis";

// ── SODA endpoints to try (dataset IDs change by year) ──────────────────────

const MPFS_ENDPOINTS = [
  "https://data.cms.gov/resource/8we4-shhx.json",  // 2024 PFS
  "https://data.cms.gov/resource/k3dr-jzi3.json",  // 2023 PFS
  "https://data.cms.gov/resource/aah6-j3u6.json",  // Alternative
];

// Manhattan MAC locality codes to prefer
const MANHATTAN_LOCALITIES = ["01", "1", "0100", "1102"];

export interface MpfsRate {
  facilityRate: number;
  nonFacilityRate: number;
}

/**
 * Looks up Medicare facility and non-facility rates for a CPT code
 * from the CMS MPFS SODA API. Results cached in Redis for 30 days.
 */
export async function lookupMpfsRate(cptCode: string): Promise<MpfsRate | null> {
  const cacheKey = `mpfs:${cptCode}`;
  const cached = await redis.get<MpfsRate>(cacheKey);
  if (cached) return cached;

  for (const endpoint of MPFS_ENDPOINTS) {
    const result = await tryEndpoint(endpoint, cptCode);
    if (result) {
      await redis.set(cacheKey, result, { ex: 30 * 86400 }); // 30 days
      return result;
    }
  }

  // Cache the miss too (shorter TTL) to avoid hammering API
  await redis.set(cacheKey, null, { ex: 7 * 86400 });
  return null;
}

// ── Internal ─────────────────────────────────────────────────────────────────

async function tryEndpoint(endpoint: string, cptCode: string): Promise<MpfsRate | null> {
  // Try multiple field name patterns for the HCPCS code filter
  const queries = [
    `hcpcs_code='${cptCode}'`,
    `hcpcs_cd='${cptCode}'`,
    `HCPCS_Cd='${cptCode}'`,
  ];

  for (const whereClause of queries) {
    try {
      const url = `${endpoint}?$where=${whereClause}&$limit=50`;
      const res = await fetch(url, {
        signal: AbortSignal.timeout(10000),
        headers: { Accept: "application/json" },
      });

      if (!res.ok) continue;
      const data: Record<string, string>[] = await res.json();
      if (!data.length) continue;

      return pickBestRow(data);
    } catch {
      continue;
    }
  }

  return null;
}

function pickBestRow(rows: Record<string, string>[]): MpfsRate | null {
  // Prefer Manhattan locality
  const manhattan = rows.find((r) => {
    const loc = r.locality ?? r.mac_locality ?? r.carrier_locality ?? "";
    return MANHATTAN_LOCALITIES.includes(loc);
  });

  const row = manhattan ?? rows[0];
  if (!row) return null;

  const facilityRate = parseFloat(
    row.facility_fee_amount ??
    row.opps_facility_fee ??
    row.fac_pe_rvu ??
    row.facility_price ??
    row.fac_total ??
    "0"
  );

  const nonFacilityRate = parseFloat(
    row.non_facility_fee_amount ??
    row.opps_non_facility_fee ??
    row.nf_total ??
    row.non_fac_pe_rvu ??
    row.non_facility_price ??
    "0"
  );

  // If we got RVUs instead of dollar amounts, apply conversion factor (~$33.89 for 2024)
  const CF = 33.89;
  const facFinal = facilityRate < 50 && facilityRate > 0 ? facilityRate * CF : facilityRate;
  const nfFinal = nonFacilityRate < 50 && nonFacilityRate > 0 ? nonFacilityRate * CF : nonFacilityRate;

  if (facFinal <= 0 && nfFinal <= 0) return null;

  return {
    facilityRate: Math.round(facFinal * 100) / 100,
    nonFacilityRate: Math.round(nfFinal * 100) / 100,
  };
}
