import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

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

/** Splits query into meaningful keywords (>3 chars) for DB matching. */
function extractKeywords(query: string): string[] {
  return query
    .trim()
    .split(/\s+/)
    .filter((w) => w.length > 3)
    .slice(0, 6);
}

/** Returns true if the query looks like a CPT code (4-5 digits, optionally with suffix). */
function looksLikeCptCode(query: string): boolean {
  return /^\d{4,5}[A-Z]?$/i.test(query.trim());
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

  // 1. Find matching procedures in the DB
  const procedures = await prisma.procedure.findMany({
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

  if (!procedures.length) {
    return NextResponse.json({ procedures: [], noData: true } satisfies ProcedureSearchResponse);
  }

  // 2. Get distinct hospital counts per procedure (one query for all)
  const procedureIds = procedures.map((p) => p.id);

  const hospitalCounts = await prisma.priceEntry.groupBy({
    by: ["procedureId"],
    where: { procedureId: { in: procedureIds } },
    _count: { hospitalId: true },
  });

  const hospitalCountMap = Object.fromEntries(
    hospitalCounts.map((h) => [h.procedureId, h._count.hospitalId]),
  );

  // 3. Score each procedure by how many query keywords appear in its name.
  //    For complex queries (3+ keywords), only return procedures that match ≥2 keywords.
  //    This prevents an "ankle X-ray" code from surfacing when the user describes
  //    a surgical condition like "non-union ankle fracture" (only "ankle" would match).
  const minScore = keywords.length >= 3 ? 2 : 1;

  const scored = procedures
    .map((p) => {
      const nameLower  = p.name.toLowerCase();
      const matchScore = keywords.filter((kw) => nameLower.includes(kw.toLowerCase())).length;
      return {
        cptCode:       p.cptCode,
        name:          p.name,
        category:      p.category,
        priceCount:    p._count.prices,
        hospitalCount: hospitalCountMap[p.id] ?? 0,
        matchScore,
      };
    })
    .filter((r) => r.priceCount > 0 && r.matchScore >= minScore);

  // Sort: highest match score first, then by price count (most data)
  const results: ProcedureSearchResult[] = scored.sort(
    (a, b) => b.matchScore - a.matchScore || b.priceCount - a.priceCount,
  );

  if (!results.length) {
    return NextResponse.json({ procedures: [], noData: true } satisfies ProcedureSearchResponse);
  }

  return NextResponse.json({ procedures: results, noData: false } satisfies ProcedureSearchResponse);
}
