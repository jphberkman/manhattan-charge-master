/**
 * NLM Clinical Tables CPT Code Search API
 *
 * Free public API from the National Library of Medicine.
 * Searches ~10,000 CPT procedure codes by natural language description.
 * No API key required. Rate limits are generous for production use.
 *
 * Docs: https://clinicaltables.nlm.nih.gov/apidoc/cpt_codes/v3/doc.html
 */

import { redis } from "@/lib/redis";

export interface CptMatch {
  code: string;
  description: string;
}

const NLM_CPT_API = "https://clinicaltables.nlm.nih.gov/api/cpt_codes/v3/search";
const TIMEOUT_MS = 3000;

/**
 * Searches CPT codes by natural language query.
 * Returns up to `limit` matches ordered by relevance.
 * Returns [] on any network or parse error (fail-open).
 *
 * Cached in Redis for 7 days — CPT codes change only with annual AMA updates.
 */
export async function searchCptCodes(
  query: string,
  limit = 8,
): Promise<CptMatch[]> {
  const cacheKey = `cpt:${query.trim().toLowerCase()}:${limit}`;

  try {
    const cached = await redis.get<CptMatch[]>(cacheKey);
    if (cached) return cached;
  } catch { /* ignore Redis errors */ }

  try {
    const params = new URLSearchParams({
      terms: query.trim(),
      maxList: String(limit),
      df: "code,display",
    });

    const res = await fetch(`${NLM_CPT_API}?${params}`, {
      signal: AbortSignal.timeout(TIMEOUT_MS),
      next: { revalidate: 604800 }, // 7 days
    });

    if (!res.ok) return [];

    // NLM response format: [totalCount, [codes], [displayStrings], [[code, description], ...]]
    const [, , , extraData] = (await res.json()) as [
      number,
      string[],
      string[],
      [string, string][],
    ];

    if (!extraData?.length) return [];

    const results: CptMatch[] = extraData.map(([code, description]) => ({
      code,
      description,
    }));

    try {
      await redis.set(cacheKey, results, { ex: 604800 }); // 7 days
    } catch { /* ignore */ }

    return results;
  } catch {
    return [];
  }
}
