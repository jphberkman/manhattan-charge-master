/**
 * CPT/HCPCS code lookup — condition mappings + CptCode table, cached in Redis.
 *
 * Merges both sources (never drops CptCode hits when a condition mapping exists)
 * and re-scores with clinical modifiers so "non-union ankle fracture" does not
 * resolve to acute ORIF 27766.
 */

import { prisma } from "@/lib/prisma";
import { Prisma } from "@/generated/prisma";
import { redis } from "@/lib/redis";
import {
  extractKeywords,
  scoreDescriptionMatch,
} from "@/lib/price-transparency/search-text";

export interface CptMatch {
  code: string;
  description: string;
  confidence: number;    // 0-100 score based on internal scoring logic
  matchReason: string;   // explanation of why this code matched
}

export { extractKeywords, scoreDescriptionMatch, normalizeSearchText } from "@/lib/price-transparency/search-text";

const CACHE_PREFIX = "cpt9";

function hyphenInsensitivePattern(keyword: string): string {
  return `%${keyword.replace(/-/g, "")}%`;
}

function sqlLikePatterns(keywords: string[]): string[] {
  const out: string[] = [];
  for (const k of keywords) {
    out.push(hyphenInsensitivePattern(k));
    if (k === "nonunion") {
      out.push("%nonhealed%");
      out.push("%non-union%");
      out.push("%non union%");
    }
    if (k === "fracture") out.push("%broken%");
  }
  return [...new Set(out)];
}

function consider(byCode: Map<string, CptMatch>, match: CptMatch) {
  const prev = byCode.get(match.code);
  if (!prev || match.confidence > prev.confidence) byCode.set(match.code, match);
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

  const cacheKey = `${CACHE_PREFIX}:${trimmed}:${limit}`;

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
      const results: CptMatch[] = rows.map((r) => ({
        code: r.code,
        description: r.description,
        confidence: r.code === trimmed.toUpperCase() ? 100 : 90,
        matchReason: r.code === trimmed.toUpperCase() ? "Exact CPT code match" : `CPT code prefix match (${trimmed.toUpperCase()}*)`,
      }));
      try { await redis.set(cacheKey, results, { ex: 86400 }); } catch { /* ignore */ }
      return results;
    }

    const keywords = extractKeywords(trimmed);
    if (keywords.length === 0) return [];

    const patterns = sqlLikePatterns(keywords);

    const [conditionRows, cptRows] = await Promise.all([
      prisma.$queryRaw<{ cptCode: string; procedureName: string; score: number; weight: number }[]>`
        SELECT "cptCode", "procedureName", weight,
          (${Prisma.join(
            patterns.map((p) => Prisma.sql`CASE WHEN REPLACE(LOWER(condition), '-', '') LIKE ${p} THEN 1 ELSE 0 END`),
            " + ",
          )}) AS score
        FROM "ConditionMapping"
        WHERE ${Prisma.join(
          patterns.map((p) => Prisma.sql`REPLACE(LOWER(condition), '-', '') LIKE ${p}`),
          " OR ",
        )}
        ORDER BY score DESC, weight DESC
        LIMIT ${limit * 3}
      `,
      prisma.$queryRaw<{ code: string; description: string; score: number }[]>`
        SELECT code, description,
          (${Prisma.join(
            patterns.map((p) => Prisma.sql`CASE WHEN REPLACE(LOWER(description), '-', '') LIKE ${p} THEN 1 ELSE 0 END`),
            " + ",
          )}) AS score
        FROM "CptCode"
        WHERE ${Prisma.join(
          patterns.map((p) => Prisma.sql`REPLACE(LOWER(description), '-', '') LIKE ${p}`),
          " OR ",
        )}
        ORDER BY score DESC
        LIMIT ${limit * 3}
      `,
    ]);

    const byCode = new Map<string, CptMatch>();

    for (const r of conditionRows) {
      const scored = scoreDescriptionMatch(trimmed, r.procedureName, { weight: Number(r.weight) });
      consider(byCode, {
        code: r.cptCode,
        description: r.procedureName,
        confidence: scored.confidence,
        matchReason: `Condition mapping: ${scored.matched}/${scored.keywords.length} keywords matched (weight ${r.weight})`,
      });
    }

    for (const r of cptRows) {
      const scored = scoreDescriptionMatch(trimmed, r.description);
      consider(byCode, {
        code: r.code,
        description: r.description,
        confidence: scored.confidence,
        matchReason: `Description keyword match: ${scored.matched}/${scored.keywords.length} keywords matched`,
      });
    }

    const results = [...byCode.values()]
      .sort((a, b) => b.confidence - a.confidence)
      .slice(0, limit);

    try { await redis.set(cacheKey, results, { ex: 86400 }); } catch { /* ignore */ }
    return results;
  } catch (err) {
    console.error("searchCptCodes failed", err);
    return [];
  }
}
