import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { redis } from "@/lib/redis";
import { searchCptCodes } from "@/lib/cpt-lookup";

export const dynamic = "force-dynamic";

// ── Types ──────────────────────────────────────────────────────────────────────

export interface ProcedureSearchResult {
  cptCode: string;
  name: string;
  category: string;
  priceCount: number;
  hospitalCount: number;
  /** Number of query keywords matched in the procedure name. */
  matchScore: number;
}

export interface ProcedureSearchResponse {
  procedures: ProcedureSearchResult[];
  noData: boolean;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Common stop words to exclude from keyword matching. */
const STOP_WORDS = new Set([
  "the", "and", "for", "with", "that", "this", "from", "have", "has",
  "had", "not", "are", "was", "were", "been", "being", "what", "how",
  "does", "need", "want", "like", "just", "get", "got", "can", "will",
  "its", "my", "me", "our", "your",
]);

/** Splits query into meaningful keywords (>=2 chars, no stop words) for DB matching. */
function extractKeywords(query: string): string[] {
  return query
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .filter((w) => w.length >= 2 && !STOP_WORDS.has(w))
    .slice(0, 6);
}

/** Returns true if the query looks like a CPT code (4-5 digits, optionally with suffix). */
function looksLikeCptCode(query: string): boolean {
  return /^\d{4,5}[A-Z]?$/i.test(query.trim());
}

/** Scores and filters procedure results by keyword relevance. */
function scoreAndFilter(
  procedures: { id: string; cptCode: string; name: string; category: string; _count: { prices: number } }[],
  hospitalCountMap: Record<string, number>,
  keywords: string[],
  minScore: number,
): ProcedureSearchResult[] {
  return procedures
    .map((p) => {
      const nameLower = p.name.toLowerCase();
      const matchScore = keywords.length
        ? keywords.filter((kw) => nameLower.includes(kw.toLowerCase())).length
        : 1; // CPT-code or NLM lookups — treat all as full match
      return {
        cptCode: p.cptCode,
        name: p.name,
        category: p.category,
        priceCount: p._count.prices,
        hospitalCount: hospitalCountMap[p.id] ?? 0,
        matchScore,
      };
    })
    .filter((r) => r.priceCount > 0 && r.matchScore >= minScore)
    .sort((a, b) => b.matchScore - a.matchScore || b.priceCount - a.priceCount);
}

// ── Route handler ─────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const { query } = await req.json() as { query: string };

  if (!query?.trim()) {
    return NextResponse.json({ procedures: [], noData: true } satisfies ProcedureSearchResponse);
  }

  const isCptQuery = looksLikeCptCode(query);
  const keywords   = extractKeywords(query);

  if (!isCptQuery && !keywords.length) {
    return NextResponse.json({ procedures: [], noData: true } satisfies ProcedureSearchResponse);
  }

  const cacheKey = `search4:${query.trim().toLowerCase()}`;
  const cached = await redis.get<ProcedureSearchResponse>(cacheKey);
  if (cached) return NextResponse.json(cached);

  // ── Pass 1: keyword / CPT-code search in our chargemaster DB ──────────────
  const pass1 = await prisma.procedure.findMany({
    where: isCptQuery
      ? { cptCode: { contains: query.trim(), mode: "insensitive" } }
      : { OR: keywords.map((w) => ({ name: { contains: w, mode: "insensitive" as const } })) },
    select: {
      id: true,
      cptCode: true,
      name: true,
      category: true,
      _count: { select: { prices: true } },
    },
    take: 20,
  });

  if (pass1.length) {
    const hospitalCounts = await prisma.priceEntry.groupBy({
      by: ["procedureId"],
      where: { procedureId: { in: pass1.map((p) => p.id) } },
      _count: { hospitalId: true },
    });
    const hospitalCountMap = Object.fromEntries(
      hospitalCounts.map((h) => [h.procedureId, h._count.hospitalId]),
    );

    // Require majority of keywords to match — prevents "total" alone matching "Bilirubin Total"
    const minScore = Math.max(1, Math.ceil(keywords.length * 0.6));
    const results = scoreAndFilter(pass1, hospitalCountMap, keywords, minScore);

    if (results.length) {
      const response: ProcedureSearchResponse = { procedures: results, noData: false };
      await redis.set(cacheKey, response, { ex: 3600 });
      return NextResponse.json(response);
    }
  }

  // ── Pass 2: NLM CPT lookup — maps natural language to CPT codes ────────────
  // Runs when keyword search finds nothing (e.g. user says "gallstones" but
  // our DB has "cholecystectomy"). NLM resolves the clinical concept to CPT
  // codes, then we retry the DB with exact code matches.
  if (!isCptQuery) {
    const nlmMatches = await searchCptCodes(query, 8);

    if (nlmMatches.length) {
      const nlmCptCodes = nlmMatches.map((m) => m.code);

      const pass2 = await prisma.procedure.findMany({
        where: { cptCode: { in: nlmCptCodes } },
        select: {
          id: true,
          cptCode: true,
          name: true,
          category: true,
          _count: { select: { prices: true } },
        },
        take: 20,
      });

      if (pass2.length) {
        const hospitalCounts = await prisma.priceEntry.groupBy({
          by: ["procedureId"],
          where: { procedureId: { in: pass2.map((p) => p.id) } },
          _count: { hospitalId: true },
        });
        const hospitalCountMap = Object.fromEntries(
          hospitalCounts.map((h) => [h.procedureId, h._count.hospitalId]),
        );

        // NLM matches are pre-scored by relevance — treat all as full match
        const results = scoreAndFilter(pass2, hospitalCountMap, [], 1);

        if (results.length) {
          const response: ProcedureSearchResponse = { procedures: results, noData: false };
          await redis.set(cacheKey, response, { ex: 3600 });
          return NextResponse.json(response);
        }
      }
    }
  }

  // ── No data found in either pass ─────────────────────────────────────────
  return NextResponse.json({ procedures: [], noData: true } satisfies ProcedureSearchResponse);
}
