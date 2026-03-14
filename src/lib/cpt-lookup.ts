/**
 * CPT/HCPCS code lookup — condition mappings + CptCode table, cached in Redis.
 *
 * PERFORMANCE: Uses single raw SQL queries with OR matching + scoring instead of
 * multiple sequential Prisma queries. This reduces Neon round-trips from 6-8 to 2
 * (one for condition mappings, one for CptCode table, in parallel).
 */

import { prisma } from "@/lib/prisma";
import { Prisma } from "@/generated/prisma";
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
 * Searches CPT/HCPCS codes by natural language or code prefix.
 * Uses TWO parallel SQL queries (condition mappings + CptCode table),
 * each with OR matching + keyword scoring — 2 DB round-trips total.
 */
export async function searchCptCodes(
  query: string,
  limit = 8,
): Promise<CptMatch[]> {
  const trimmed = query.trim().toLowerCase();
  if (!trimmed) return [];

  const cacheKey = `cpt6:${trimmed}:${limit}`;

  try {
    const cached = await redis.get<CptMatch[]>(cacheKey);
    if (cached) return cached;
  } catch { /* ignore */ }

  try {
    const isCodeQuery = /^\d{4,5}[A-Z]?$/i.test(trimmed);

    if (isCodeQuery) {
      const rows = await prisma.cptCode.findMany({
        where: { code: { startsWith: trimmed.toUpperCase() } },
        select: { code: true, description: true },
        take: limit,
      });
      try { await redis.set(cacheKey, rows, { ex: 86400 }); } catch { /* ignore */ }
      return rows;
    }

    const keywords = extractKeywords(trimmed);
    if (keywords.length === 0) return [];

    // Build LIKE patterns for each keyword
    const patterns = keywords.map((w) => `%${w}%`);

    // ── Single SQL query per table, run in PARALLEL ──────────────────────
    const [conditionRows, cptRows] = await Promise.all([
      // Condition mappings: OR match with scoring
      prisma.$queryRaw<{ cptCode: string; procedureName: string; score: number; weight: number }[]>`
        SELECT "cptCode", "procedureName", weight,
          (${Prisma.join(
            patterns.map((p) => Prisma.sql`CASE WHEN LOWER(condition) LIKE ${p} THEN 1 ELSE 0 END`),
            Prisma.sql` + `,
          )}) AS score
        FROM "ConditionMapping"
        WHERE ${Prisma.join(
          patterns.map((p) => Prisma.sql`LOWER(condition) LIKE ${p}`),
          Prisma.sql` OR `,
        )}
        ORDER BY score DESC, weight DESC
        LIMIT ${limit * 2}
      `,
      // CptCode table: OR match with scoring
      prisma.$queryRaw<{ code: string; description: string; score: number }[]>`
        SELECT code, description,
          (${Prisma.join(
            patterns.map((p) => Prisma.sql`CASE WHEN LOWER(description) LIKE ${p} THEN 1 ELSE 0 END`),
            Prisma.sql` + `,
          )}) AS score
        FROM "CptCode"
        WHERE ${Prisma.join(
          patterns.map((p) => Prisma.sql`LOWER(description) LIKE ${p}`),
          Prisma.sql` OR `,
        )}
        ORDER BY score DESC
        LIMIT ${limit * 2}
      `,
    ]);

    // Dedupe condition matches by CPT code, prefer highest score
    const conditionResults: CptMatch[] = [];
    const seenCodes = new Set<string>();
    for (const r of conditionRows) {
      if (seenCodes.has(r.cptCode)) continue;
      seenCodes.add(r.cptCode);
      conditionResults.push({ code: r.cptCode, description: r.procedureName });
      if (conditionResults.length >= limit) break;
    }

    // CptCode results (already ordered by score DESC)
    const cptResults: CptMatch[] = cptRows
      .slice(0, limit)
      .map((r) => ({ code: r.code, description: r.description }));

    // Prefer condition mappings (curated symptom→procedure), fall back to CptCode
    const results = conditionResults.length ? conditionResults : cptResults;

    try { await redis.set(cacheKey, results, { ex: 86400 }); } catch { /* ignore */ }
    return results;
  } catch {
    return [];
  }
}
