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
  matchScore: number;
}

export interface ProcedureSearchResponse {
  procedures: ProcedureSearchResult[];
  noData: boolean;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function looksLikeCptCode(query: string): boolean {
  return /^\d{4,5}[A-Z]?$/i.test(query.trim());
}

type ProcRow = { id: string; cptCode: string; name: string; category: string; _count: { prices: number } };

// ── Route handler ─────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const { query } = await req.json() as { query: string };
  if (!query?.trim()) {
    return NextResponse.json({ procedures: [], noData: true } satisfies ProcedureSearchResponse);
  }

  const cacheKey = `search6:${query.trim().toLowerCase()}`;
  const cached = await redis.get<ProcedureSearchResponse>(cacheKey);
  if (cached) return NextResponse.json(cached);

  const isCptQuery = looksLikeCptCode(query);

  // ── Step 1: Resolve query to CPT codes ────────────────────────────────────
  // For natural language queries, use the CPT lookup (condition mappings +
  // CptCode table with proper medical descriptions). This is reliable because
  // it searches against real medical descriptions, not cryptic chargemaster names.
  // For CPT code queries, search directly by code.

  let cptCodes: string[] = [];

  if (isCptQuery) {
    cptCodes = [query.trim()];
  } else {
    const cptMatches = await searchCptCodes(query, 10);
    cptCodes = cptMatches.map((m) => m.code);
  }

  if (!cptCodes.length) {
    return NextResponse.json({ procedures: [], noData: true } satisfies ProcedureSearchResponse);
  }

  // ── Step 2: Find chargemaster procedures by exact CPT code ────────────────
  // This is fast (indexed lookup) and accurate (no fuzzy name matching).

  const procedures = await prisma.procedure.findMany({
    where: { cptCode: { in: cptCodes } },
    select: {
      id: true, cptCode: true, name: true, category: true,
      _count: { select: { prices: true } },
    },
    take: 20,
  });

  const withPrices = procedures.filter((p) => p._count.prices > 0);

  if (!withPrices.length) {
    return NextResponse.json({ procedures: [], noData: true } satisfies ProcedureSearchResponse);
  }

  // ── Step 3: Get hospital counts and build results ─────────────────────────

  const hospitalCounts = await prisma.priceEntry.groupBy({
    by: ["procedureId"],
    where: { procedureId: { in: withPrices.map((p) => p.id) } },
    _count: { hospitalId: true },
  });
  const hospitalCountMap = Object.fromEntries(
    hospitalCounts.map((h) => [h.procedureId, h._count.hospitalId]),
  );

  // Preserve the order from CPT lookup (most relevant first)
  const cptOrder = new Map(cptCodes.map((c, i) => [c, i]));
  const results: ProcedureSearchResult[] = withPrices
    .map((p) => ({
      cptCode: p.cptCode,
      name: p.name,
      category: p.category,
      priceCount: p._count.prices,
      hospitalCount: hospitalCountMap[p.id] ?? 0,
      matchScore: cptCodes.length - (cptOrder.get(p.cptCode) ?? cptCodes.length),
    }))
    .sort((a, b) => b.matchScore - a.matchScore || b.priceCount - a.priceCount)
    .slice(0, 10);

  const response: ProcedureSearchResponse = { procedures: results, noData: false };
  await redis.set(cacheKey, response, { ex: 3600 });
  return NextResponse.json(response);
}
