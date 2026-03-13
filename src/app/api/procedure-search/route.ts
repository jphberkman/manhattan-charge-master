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

type ProcRow = { id: string; cptCode: string; name: string; category: string; _count: { prices: number } };

/** Fetches hospital counts for a set of procedures and builds a map. */
async function getHospitalCountMap(procedures: ProcRow[]): Promise<Record<string, number>> {
  if (!procedures.length) return {};
  const hospitalCounts = await prisma.priceEntry.groupBy({
    by: ["procedureId"],
    where: { procedureId: { in: procedures.map((p) => p.id) } },
    _count: { hospitalId: true },
  });
  return Object.fromEntries(
    hospitalCounts.map((h) => [h.procedureId, h._count.hospitalId]),
  );
}

/** Scores procedure results by keyword relevance. */
function scoreResults(
  procedures: ProcRow[],
  hospitalCountMap: Record<string, number>,
  keywords: string[],
): ProcedureSearchResult[] {
  return procedures
    .map((p) => {
      const nameLower = p.name.toLowerCase();
      const matchScore = keywords.length
        ? keywords.filter((kw) => nameLower.includes(kw)).length
        : 1; // CPT-code or CPT-lookup results — treat all as full match
      return {
        cptCode: p.cptCode,
        name: p.name,
        category: p.category,
        priceCount: p._count.prices,
        hospitalCount: hospitalCountMap[p.id] ?? 0,
        matchScore,
      };
    })
    .filter((r) => r.priceCount > 0);
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

  const cacheKey = `search5:${query.trim().toLowerCase()}`;
  const cached = await redis.get<ProcedureSearchResponse>(cacheKey);
  if (cached) return NextResponse.json(cached);

  // ── Run Pass 1 (keyword search) and Pass 2 (CPT lookup) in PARALLEL ──────
  // This ensures we find chargemaster data even when keyword names don't match
  // (e.g. user says "hip replacement" but chargemaster has "arthroplasty").

  const pass1Promise = prisma.procedure.findMany({
    where: isCptQuery
      ? { cptCode: { contains: query.trim(), mode: "insensitive" } }
      : { OR: keywords.map((w) => ({ name: { contains: w, mode: "insensitive" as const } })) },
    select: {
      id: true, cptCode: true, name: true, category: true,
      _count: { select: { prices: true } },
    },
    take: 20,
  });

  const pass2Promise = !isCptQuery
    ? searchCptCodes(query, 8).then(async (cptMatches) => {
        if (!cptMatches.length) return [] as ProcRow[];
        return prisma.procedure.findMany({
          where: { cptCode: { in: cptMatches.map((m) => m.code) } },
          select: {
            id: true, cptCode: true, name: true, category: true,
            _count: { select: { prices: true } },
          },
          take: 20,
        });
      })
    : Promise.resolve([] as ProcRow[]);

  const [pass1, pass2] = await Promise.all([pass1Promise, pass2Promise]);

  // Merge and deduplicate — Pass 2 (CPT-resolved) results are more reliable
  const seenCpt = new Set<string>();
  const merged: ProcRow[] = [];

  // Add Pass 2 results first (CPT-resolved, higher confidence)
  for (const p of pass2) {
    if (!seenCpt.has(p.cptCode)) {
      seenCpt.add(p.cptCode);
      merged.push(p);
    }
  }
  // Add Pass 1 results that weren't already found
  for (const p of pass1) {
    if (!seenCpt.has(p.cptCode)) {
      seenCpt.add(p.cptCode);
      merged.push(p);
    }
  }

  if (!merged.length) {
    return NextResponse.json({ procedures: [], noData: true } satisfies ProcedureSearchResponse);
  }

  const hospitalCountMap = await getHospitalCountMap(merged);

  // Score Pass 1 results by keyword relevance, Pass 2 results get full score
  const pass2Ids = new Set(pass2.map((p) => p.id));
  const scored = scoreResults(merged, hospitalCountMap, keywords);

  // Boost Pass 2 (CPT-resolved) results — they matched the clinical concept
  for (const r of scored) {
    const proc = merged.find((p) => p.cptCode === r.cptCode);
    if (proc && pass2Ids.has(proc.id)) {
      r.matchScore = Math.max(r.matchScore, keywords.length); // full score
    }
  }

  // Require majority of keywords for Pass 1-only results (prevents false positives)
  const minScoreForKeyword = Math.max(1, Math.ceil(keywords.length * 0.6));
  const filtered = scored.filter((r) => {
    const proc = merged.find((p) => p.cptCode === r.cptCode);
    // Pass 2 results always pass — they matched via CPT resolution
    if (proc && pass2Ids.has(proc.id)) return true;
    // Pass 1-only results need majority keyword match
    return r.matchScore >= minScoreForKeyword;
  });

  // Sort: highest match score first, then by price count (more data = more reliable)
  filtered.sort((a, b) => b.matchScore - a.matchScore || b.priceCount - a.priceCount);

  const results = filtered.slice(0, 10);

  if (results.length) {
    const response: ProcedureSearchResponse = { procedures: results, noData: false };
    await redis.set(cacheKey, response, { ex: 3600 });
    return NextResponse.json(response);
  }

  return NextResponse.json({ procedures: [], noData: true } satisfies ProcedureSearchResponse);
}
