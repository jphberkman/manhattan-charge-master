/**
 * CMS Medicare Physician & Other Practitioners utilization data.
 *
 * Queries the public CMS data.cms.gov Socrata API to get real procedure
 * volume counts for a given physician (NPI) and CPT/HCPCS code.
 *
 * Source: CMS Medicare Physician & Other Practitioners – by Provider and Service
 * Dataset: https://data.cms.gov/provider-summary-by-type-of-service/medicare-physician-other-practitioners
 */

import { redis } from "@/lib/redis";

// ── Types ──────────────────────────────────────────────────────────────────────

export interface CmsUtilization {
  npi: string;
  cptCode: string;
  /** Number of Medicare services rendered (procedure count). */
  totalServices: number;
  /** Number of distinct Medicare beneficiaries treated. */
  totalBeneficiaries: number;
  year: number;
}

export interface PhysicianProfileLinks {
  /** CMS NPI Registry — always available when NPI is known. */
  npiRegistry: string;
  /** Healthgrades search for this physician. */
  healthgrades: string;
  /** US News Health doctor search. */
  usNews: string;
  /** Google search for reviews. */
  googleSearch: string;
}

// ── Constants ─────────────────────────────────────────────────────────────────

/**
 * Socrata endpoint for CMS 2022 Medicare Physician & Other Practitioners data.
 * Field reference: https://data.cms.gov/resources/medicare-physician-other-practitioners-by-provider-and-service-data-dictionary
 */
const CMS_UTILIZATION_API = "https://data.cms.gov/resource/s55f-ussd.json";
const CMS_DATA_YEAR = 2022;
const FETCH_TIMEOUT_MS = 6000;

// ── Public API ─────────────────────────────────────────────────────────────────

/**
 * Fetches Medicare procedure volume for one physician + CPT code.
 * Returns null if not found in the dataset or on any network error.
 */
export async function getCmsUtilization(
  npi: string,
  cptCode: string,
): Promise<CmsUtilization | null> {
  // Redis cache — CMS data updates annually, so 24h TTL is safe
  const cacheKey = `cms:${npi}:${cptCode}`;
  try {
    const cached = await redis.get<CmsUtilization>(cacheKey);
    if (cached) return cached;
  } catch { /* ignore Redis errors */ }

  try {
    const params = new URLSearchParams({
      rndrng_npi: npi,
      hcpcs_cd: cptCode,
      $limit: "1",
    });

    const res = await fetch(`${CMS_UTILIZATION_API}?${params}`, {
      next: { revalidate: 86400 },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (!res.ok) return null;

    const data = (await res.json()) as Record<string, string>[];
    if (!data.length) {
      // Cache null result too (avoid hammering CMS for unknown NPIs)
      try { await redis.set(cacheKey, null, { ex: 3600 }); } catch { /* ignore */ }
      return null;
    }

    const row = data[0];
    const result: CmsUtilization = {
      npi,
      cptCode,
      totalServices: parseFloat(row.tot_srvcs ?? "0") || 0,
      totalBeneficiaries: parseFloat(row.tot_benes ?? "0") || 0,
      year: CMS_DATA_YEAR,
    };

    try { await redis.set(cacheKey, result, { ex: 86400 }); } catch { /* ignore */ }
    return result;
  } catch {
    return null;
  }
}

/**
 * Fetches Medicare procedure volumes for multiple physicians for one CPT code.
 * Returns a map of NPI → utilization. Missing entries = no Medicare data found.
 * All requests run in parallel with individual error isolation.
 */
export async function getBatchCmsUtilization(
  npis: string[],
  cptCode: string,
): Promise<Map<string, CmsUtilization>> {
  if (!npis.length || !cptCode) return new Map();

  const results = await Promise.allSettled(
    npis.map((npi) => getCmsUtilization(npi, cptCode)),
  );

  const map = new Map<string, CmsUtilization>();
  for (let i = 0; i < npis.length; i++) {
    const r = results[i];
    if (r.status === "fulfilled" && r.value) {
      map.set(npis[i], r.value);
    }
  }
  return map;
}

/**
 * Builds external profile / review links for a physician.
 * All links are search-based (not deep links) since external sites
 * use internal IDs, not NPIs, for canonical URLs.
 *
 * Exception: NPI Registry uses the NPI directly.
 */
export function buildProfileLinks(
  npi: string,
  firstName: string,
  lastName: string,
  specialty: string,
): PhysicianProfileLinks {
  const fullName = `${firstName} ${lastName}`;
  const namePart = encodeURIComponent(fullName);
  const specialtyPart = encodeURIComponent(specialty);

  return {
    npiRegistry: `https://npiregistry.cms.hhs.gov/provider-view/${npi}`,
    healthgrades: `https://www.healthgrades.com/usearch?what=${namePart}&state=NY&type=physician`,
    usNews: `https://health.usnews.com/doctors/search?name=${namePart}&location=New+York%2C+NY`,
    googleSearch: `https://www.google.com/search?q=${namePart}+${specialtyPart}+Manhattan+reviews`,
  };
}
