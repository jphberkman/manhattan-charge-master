import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { redis } from "@/lib/redis";
import { searchCptCodes } from "@/lib/cpt-lookup";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

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

// ── Route handler ─────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const startTime = Date.now();
  const { query } = await req.json() as { query: string };
  if (!query?.trim()) {
    return NextResponse.json({ procedures: [], noData: true } satisfies ProcedureSearchResponse);
  }

  const cacheKey = `search10:${query.trim().toLowerCase()}`;
  const cached = await redis.get<ProcedureSearchResponse>(cacheKey);
  if (cached) return NextResponse.json(cached);

  const isCptQuery = looksLikeCptCode(query);

  // ── Step 1: Resolve query to CPT codes ────────────────────────────────────

  let cptCodes: string[] = [];
  const cptDescriptions = new Map<string, string>();

  if (isCptQuery) {
    cptCodes = [query.trim()];
  } else {
    const cptMatches = await searchCptCodes(query, 10);
    cptCodes = cptMatches.map((m) => m.code);
    for (const m of cptMatches) cptDescriptions.set(m.code, m.description);
  }

  if (!cptCodes.length) {
    return NextResponse.json({ procedures: [], noData: true } satisfies ProcedureSearchResponse);
  }

  // ── Step 2: Find procedures with basic info (no expensive counts) ─────────
  // Skip _count.prices and COUNT(DISTINCT hospitalId) — they scan millions of
  // rows on Neon and cause 30+ second timeouts. Use lightweight existence check.

  const procedures = await prisma.procedure.findMany({
    where: { cptCode: { in: cptCodes } },
    select: { id: true, cptCode: true, name: true, category: true },
    take: 20,
  });

  if (procedures.length === 0) {
    return NextResponse.json({ procedures: [], noData: true } satisfies ProcedureSearchResponse);
  }

  // Fetch human-readable names from CptCode table for any codes we don't already have
  const missingDescs = procedures.filter((p) => !cptDescriptions.has(p.cptCode)).map((p) => p.cptCode);
  if (missingDescs.length) {
    const cptRows = await prisma.cptCode.findMany({
      where: { code: { in: missingDescs } },
      select: { code: true, description: true },
    });
    for (const r of cptRows) cptDescriptions.set(r.code, r.description);
  }

  // ── Step 3: Build results ─────────────────────────────────────────────────
  // We skip expensive per-procedure hospital/price counts. The compare API
  // provides detailed per-hospital data when the user selects a procedure.

  const cptOrder = new Map(cptCodes.map((c, i) => [c, i]));
  const results: ProcedureSearchResult[] = procedures
    .map((p) => ({
      cptCode: p.cptCode,
      name: cptDescriptions.get(p.cptCode) ?? p.name,
      category: p.category,
      priceCount: 1, // placeholder — real counts shown in compare view
      hospitalCount: 0, // placeholder — real counts shown in compare view
      matchScore: cptCodes.length - (cptOrder.get(p.cptCode) ?? cptCodes.length),
    }))
    .sort((a, b) => b.matchScore - a.matchScore)
    .slice(0, 10);

  const response: ProcedureSearchResponse = { procedures: results, noData: false };
  await redis.set(cacheKey, response, { ex: 3600 });

  // Fire-and-forget search log
  prisma.searchLog.create({
    data: {
      query: query.trim(),
      endpoint: "procedure-search",
      resultCount: results.length,
      cptCode: results[0]?.cptCode ?? null,
      procedureName: results[0]?.name ?? null,
      responseTimeMs: Date.now() - startTime,
    },
  }).catch(() => {});

  return NextResponse.json(response);
}
