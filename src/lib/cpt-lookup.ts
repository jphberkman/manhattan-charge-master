/**
 * CPT/HCPCS code lookup — condition mappings + CptCode table, cached in Redis.
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

/** Common English words that add noise. */
const STOP_WORDS = new Set([
  "i", "a", "an", "the", "and", "or", "but", "in", "on", "at", "to", "for",
  "of", "is", "it", "my", "me", "we", "our", "am", "be", "do", "if", "so",
  "have", "has", "had", "was", "were", "been", "are", "will", "can", "may",
  "not", "no", "this", "that", "with", "from", "being", "what", "how",
  "does", "need", "want", "like", "just", "get", "got", "its",
  "doctor", "told", "says", "think", "know", "going", "would", "could",
  "should", "very", "much", "some", "also", "about",
]);

/** Medical terms common in patient queries but too generic for CPT matching. */
const MEDICAL_STOP_WORDS = new Set([
  "surgery", "surgical", "procedure", "operation", "treatment",
  "diagnosed", "diagnosis", "condition", "problem", "issue",
  "recommend", "recommends", "recommended",
]);

/** Extract meaningful medical keywords from a query. */
function extractKeywords(query: string): string[] {
  return query
    .trim()
    .toLowerCase()
    .split(/[\s,;]+/)
    .filter((w) => w.length >= 2 && !STOP_WORDS.has(w) && !MEDICAL_STOP_WORDS.has(w))
    .slice(0, 6);
}

/**
 * Searches CPT/HCPCS codes by natural language description or code prefix.
 * Strategy:
 *   1. Condition mappings (AND, then top-2 keywords)
 *   2. CptCode table (AND, then top-2, then OR with scoring)
 * Condition + CptCode searches run IN PARALLEL for speed.
 * Results cached in Redis for 24h.
 */
export async function searchCptCodes(
  query: string,
  limit = 8,
): Promise<CptMatch[]> {
  const trimmed = query.trim().toLowerCase();
  if (!trimmed) return [];

  // Bump cache key when search logic changes to clear stale empty results
  const cacheKey = `cpt4:${trimmed}:${limit}`;

  try {
    const cached = await redis.get<CptMatch[]>(cacheKey);
    if (cached) return cached;
  } catch { /* ignore Redis errors */ }

  try {
    const isCodeQuery = /^\d{4,5}[A-Z]?$/i.test(trimmed);
    const keywords = extractKeywords(trimmed);

    if (isCodeQuery) {
      const rows = await prisma.cptCode.findMany({
        where: { code: { startsWith: trimmed.toUpperCase() } },
        select: { code: true, description: true },
        take: limit,
      });
      try { await redis.set(cacheKey, rows, { ex: 86400 }); } catch { /* ignore */ }
      return rows;
    }

    if (keywords.length === 0) return [];

    // ── Run condition mapping + CptCode search in PARALLEL ──────────────
    const [conditionResults, cptResults] = await Promise.all([
      searchConditionMappings(keywords, limit),
      searchCptTable(keywords, limit),
    ]);

    // Prefer condition mappings (curated), fall back to CptCode table
    const results = conditionResults.length ? conditionResults : cptResults;

    try { await redis.set(cacheKey, results, { ex: 86400 }); } catch { /* ignore */ }
    return results;
  } catch {
    return [];
  }
}

/** Search condition mappings (symptoms → CPT). */
async function searchConditionMappings(keywords: string[], limit: number): Promise<CptMatch[]> {
  // Try AND on all keywords
  let matches = await prisma.conditionMapping.findMany({
    where: {
      AND: keywords.map((w) => ({
        condition: { contains: w, mode: "insensitive" as const },
      })),
    },
    orderBy: { weight: "desc" },
    take: limit,
  });

  // Fallback: top 2 longest keywords (most specific)
  if (!matches.length && keywords.length > 1) {
    const top2 = [...keywords].sort((a, b) => b.length - a.length).slice(0, 2);
    matches = await prisma.conditionMapping.findMany({
      where: {
        AND: top2.map((w) => ({
          condition: { contains: w, mode: "insensitive" as const },
        })),
      },
      orderBy: { weight: "desc" },
      take: limit,
    });
  }

  // Fallback: single longest keyword
  if (!matches.length) {
    const longest = [...keywords].sort((a, b) => b.length - a.length)[0];
    matches = await prisma.conditionMapping.findMany({
      where: { condition: { contains: longest, mode: "insensitive" } },
      orderBy: { weight: "desc" },
      take: limit,
    });
  }

  // Dedupe by CPT code
  const seen = new Set<string>();
  return matches
    .map((m) => ({ code: m.cptCode, description: m.procedureName }))
    .filter((r) => { if (seen.has(r.code)) return false; seen.add(r.code); return true; });
}

/** Search CptCode table (CMS fee schedule descriptions). */
async function searchCptTable(keywords: string[], limit: number): Promise<CptMatch[]> {
  // Try AND on all keywords
  let rows = await prisma.cptCode.findMany({
    where: {
      AND: keywords.map((w) => ({
        description: { contains: w, mode: "insensitive" as const },
      })),
    },
    select: { code: true, description: true },
    take: limit,
  });
  if (rows.length) return rows;

  // Fallback: top 2 longest keywords AND
  if (keywords.length > 1) {
    const top2 = [...keywords].sort((a, b) => b.length - a.length).slice(0, 2);
    rows = await prisma.cptCode.findMany({
      where: {
        AND: top2.map((w) => ({
          description: { contains: w, mode: "insensitive" as const },
        })),
      },
      select: { code: true, description: true },
      take: limit,
    });
    if (rows.length) return rows;
  }

  // Fallback: OR matching with scoring — finds results even when CMS descriptions
  // don't match layman terms (e.g., "arthroplasty" vs "replacement")
  rows = await prisma.cptCode.findMany({
    where: {
      OR: keywords.map((w) => ({
        description: { contains: w, mode: "insensitive" as const },
      })),
    },
    select: { code: true, description: true },
    take: limit * 4,
  });

  if (!rows.length) return [];

  // Score by keyword coverage and prioritize results matching more keywords
  return rows
    .map((r) => {
      const desc = r.description.toLowerCase();
      const score = keywords.filter((w) => desc.includes(w)).length;
      return { ...r, score };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(({ code, description }) => ({ code, description }));
}
