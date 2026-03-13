/**
 * CPT/HCPCS code lookup — local Postgres table first, Redis cache second.
 *
 * Data sourced from CMS Medicare Physician Fee Schedule (9,297 codes).
 * Stored in the CptCode table, queried via Prisma.
 */

import { prisma } from "@/lib/prisma";
import { redis } from "@/lib/redis";

export interface CptMatch {
  code: string;
  description: string;
}

/** Words to ignore in medical queries — they add noise to DB searches. */
const STOP_WORDS = new Set([
  "i", "a", "an", "the", "and", "or", "but", "in", "on", "at", "to", "for",
  "of", "is", "it", "my", "me", "we", "our", "am", "be", "do", "if", "so",
  "have", "has", "had", "was", "were", "been", "are", "will", "can", "may",
  "not", "no", "this", "that", "with", "from", "been", "being", "what", "how",
  "does", "need", "want", "like", "just", "get", "got", "its",
  "doctor", "told", "says", "think", "know", "going", "would", "could",
  "should", "very", "much", "some", "also", "about",
]);

/** Medical stop words — common in patient queries but unhelpful for CPT matching. */
const MEDICAL_STOP_WORDS = new Set([
  "surgery", "surgical", "procedure", "operation", "treatment", "repair",
  "diagnosed", "diagnosis", "condition", "problem", "issue", "pain",
  "recommend", "recommends", "recommended",
]);

/** Extract meaningful medical keywords from a query. */
function extractMedicalKeywords(query: string): string[] {
  return query
    .trim()
    .toLowerCase()
    .split(/[\s,;]+/)
    .filter((w) => w.length >= 2 && !STOP_WORDS.has(w) && !MEDICAL_STOP_WORDS.has(w))
    .slice(0, 6);
}

/**
 * Searches CPT/HCPCS codes by natural language description or code prefix.
 * Uses the local Postgres CptCode table for fast lookups.
 * Results are cached in Redis for 24h.
 */
export async function searchCptCodes(
  query: string,
  limit = 8,
): Promise<CptMatch[]> {
  const trimmed = query.trim().toLowerCase();
  if (!trimmed) return [];

  const cacheKey = `cpt3:${trimmed}:${limit}`;

  try {
    const cached = await redis.get<CptMatch[]>(cacheKey);
    if (cached) return cached;
  } catch { /* ignore Redis errors */ }

  try {
    const isCodeQuery = /^\d{4,5}[A-Z]?$/i.test(trimmed);
    const keywords = extractMedicalKeywords(trimmed);

    // ── Check condition mappings first ─────────────────────────────────────
    // Handles symptoms/diagnoses like "gallstones" → lap cholecystectomy.
    // Use AND-style matching: require ALL keywords to appear, not OR.
    if (!isCodeQuery && keywords.length > 0) {
      // Try exact condition match first
      let conditionMatches = await prisma.conditionMapping.findMany({
        where: {
          AND: keywords.map((w) => ({
            condition: { contains: w, mode: "insensitive" as const },
          })),
        },
        orderBy: { weight: "desc" },
        take: limit,
      });

      // If AND is too strict, try matching on the most specific keywords (longest ones)
      if (!conditionMatches.length && keywords.length > 1) {
        const topKeywords = [...keywords].sort((a, b) => b.length - a.length).slice(0, 2);
        conditionMatches = await prisma.conditionMapping.findMany({
          where: {
            AND: topKeywords.map((w) => ({
              condition: { contains: w, mode: "insensitive" as const },
            })),
          },
          orderBy: { weight: "desc" },
          take: limit,
        });
      }

      if (conditionMatches.length) {
        const seen = new Set<string>();
        const deduped = conditionMatches
          .map((m) => ({ code: m.cptCode, description: m.procedureName }))
          .filter((r) => { if (seen.has(r.code)) return false; seen.add(r.code); return true; });

        try { await redis.set(cacheKey, deduped, { ex: 86400 }); } catch { /* ignore */ }
        return deduped;
      }
    }

    // ── CptCode table search ──────────────────────────────────────────────
    let results: CptMatch[];

    if (isCodeQuery) {
      const rows = await prisma.cptCode.findMany({
        where: { code: { startsWith: trimmed.toUpperCase() } },
        select: { code: true, description: true },
        take: limit,
      });
      results = rows;
    } else if (keywords.length === 0) {
      results = [];
    } else if (keywords.length === 1) {
      const rows = await prisma.cptCode.findMany({
        where: { description: { contains: keywords[0], mode: "insensitive" } },
        select: { code: true, description: true },
        take: limit,
      });
      results = rows;
    } else {
      // Multi-keyword: AND match on ALL keywords
      let rows = await prisma.cptCode.findMany({
        where: {
          AND: keywords.map((w) => ({
            description: { contains: w, mode: "insensitive" as const },
          })),
        },
        select: { code: true, description: true },
        take: limit,
      });

      // If AND is too strict, try the top 2-3 most specific keywords
      if (rows.length === 0) {
        const topKeywords = [...keywords].sort((a, b) => b.length - a.length).slice(0, 3);
        rows = await prisma.cptCode.findMany({
          where: {
            AND: topKeywords.map((w) => ({
              description: { contains: w, mode: "insensitive" as const },
            })),
          },
          select: { code: true, description: true },
          take: limit,
        });
      }

      // If still nothing, try the top 2 keywords
      if (rows.length === 0 && keywords.length > 2) {
        const topKeywords = [...keywords].sort((a, b) => b.length - a.length).slice(0, 2);
        rows = await prisma.cptCode.findMany({
          where: {
            AND: topKeywords.map((w) => ({
              description: { contains: w, mode: "insensitive" as const },
            })),
          },
          select: { code: true, description: true },
          take: limit * 2,
        });

        // Score remaining results by total keyword coverage
        if (rows.length > limit) {
          rows = rows
            .map((r) => {
              const desc = r.description.toLowerCase();
              const score = keywords.filter((w) => desc.includes(w)).length;
              return { ...r, score };
            })
            .sort((a, b) => (b as { score: number }).score - (a as { score: number }).score)
            .slice(0, limit);
        }
      }

      results = rows;
    }

    try {
      await redis.set(cacheKey, results, { ex: 86400 });
    } catch { /* ignore */ }

    return results;
  } catch {
    return [];
  }
}
