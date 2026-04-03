/**
 * CMS Medicare Physician Fee Schedule (MPFS) rate lookup.
 *
 * Primary: queries the CptCode table (seeded by seed-mpfs-rates.ts).
 * Fallback: queries CMS Procedure Price Lookup API (developer.cms.gov).
 * Results are cached in Redis for 30 days.
 */

import { redis } from "@/lib/redis";

export interface MpfsRate {
  facilityRate: number;
  nonFacilityRate: number;
}

/**
 * Looks up Medicare facility and non-facility rates for a CPT code.
 * Tries local DB first (via direct Prisma import), then CMS PPL API.
 * Results cached in Redis for 30 days.
 */
export async function lookupMpfsRate(cptCode: string): Promise<MpfsRate | null> {
  const cacheKey = `mpfs2:${cptCode}`;
  const cached = await redis.get<MpfsRate | "miss">(cacheKey);
  if (cached === "miss") return null;
  if (cached) return cached;

  // 1. Try CptCode table (seeded by seed-mpfs-rates.ts)
  try {
    const { prisma } = await import("@/lib/prisma");
    const row = await prisma.cptCode.findUnique({
      where: { code: cptCode },
      select: { facilityRate: true, nonFacilityRate: true, medicareRate: true },
    });

    if (row && (row.facilityRate || row.nonFacilityRate || row.medicareRate)) {
      const result: MpfsRate = {
        facilityRate: row.facilityRate ?? row.medicareRate ?? 0,
        nonFacilityRate: row.nonFacilityRate ?? row.medicareRate ?? 0,
      };
      await redis.set(cacheKey, result, { ex: 30 * 86400 });
      return result;
    }
  } catch {
    // DB not available, try API
  }

  // 2. Try CMS Procedure Price Lookup API (free, no auth)
  try {
    const url = `https://developer.cms.gov/api/ppl/v1/prices?hcpcs_code=${cptCode}&geo_type=locality&geo_code=01`;
    const res = await fetch(url, {
      signal: AbortSignal.timeout(10000),
      headers: { Accept: "application/json" },
    });

    if (res.ok) {
      const data = await res.json();
      const items = Array.isArray(data) ? data : data?.items ?? data?.results ?? [];
      if (items.length > 0) {
        const item = items[0];
        const facilityRate = parseFloat(item.facility_price ?? item.facility_fee ?? "0");
        const nonFacilityRate = parseFloat(item.non_facility_price ?? item.non_facility_fee ?? "0");

        if (facilityRate > 0 || nonFacilityRate > 0) {
          const result: MpfsRate = {
            facilityRate: Math.round(facilityRate * 100) / 100,
            nonFacilityRate: Math.round(nonFacilityRate * 100) / 100,
          };
          await redis.set(cacheKey, result, { ex: 30 * 86400 });
          return result;
        }
      }
    }
  } catch {
    // API not available
  }

  // Cache the miss to avoid repeated lookups
  await redis.set(cacheKey, "miss", { ex: 7 * 86400 });
  return null;
}
