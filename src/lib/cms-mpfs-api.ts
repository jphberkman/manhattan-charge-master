/**
 * CMS Medicare Physician Fee Schedule (MPFS) rate lookup.
 * Local CptCode table only. Does not call CMS PPL (AMA license required).
 */

import { redis } from "@/lib/redis";

export interface MpfsRate {
  facilityRate: number;
  nonFacilityRate: number;
}

/**
 * Looks up Medicare facility and non-facility rates for a CPT code.
 * Uses the local CptCode table only.
 *
 * CMS Procedure Price Lookup is not called: it requires an AMA CPT license and
 * a CMS API key. CPT descriptions are not a public unlicensed API.
 */
export async function lookupMpfsRate(cptCode: string): Promise<MpfsRate | null> {
  const cacheKey = `mpfs3:${cptCode}`;
  const cached = await redis.get<MpfsRate | "miss">(cacheKey);
  if (cached === "miss") return null;
  if (cached) return cached;

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
    // DB not available
  }

  await redis.set(cacheKey, "miss", { ex: 7 * 86400 });
  return null;
}
