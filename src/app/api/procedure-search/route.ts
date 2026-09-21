import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { redis } from "@/lib/redis";
import { searchCptCodes } from "@/lib/cpt-lookup";
import { scoreDescriptionMatch } from "@/lib/price-transparency/search-text";
import { classifyMedicalCode } from "@/lib/authoritative/code-kind";
import { searchHcpcs, searchIcd10Cm, type NlmCodeHit } from "@/lib/authoritative/nlm-clinical-tables";
import {
  codesWithFreshPrices,
  searchServiceDescriptions,
} from "@/lib/price-transparency/price-read-model";

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
  matchQuality: "exact" | "strong" | "partial" | "weak";
}

export interface ProcedureSearchResponse {
  procedures: ProcedureSearchResult[];
  noData: boolean;
  queryKind?: "icd10-cm" | "hcpcs-level-2" | "cpt-shaped" | "text";
  diagnosisMatches?: NlmCodeHit[];
  hcpcsMatches?: NlmCodeHit[];
  note?: string;
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

  const cacheKey = `search13:${query.trim().toLowerCase()}`;
  const cached = await redis.get<ProcedureSearchResponse>(cacheKey);
  if (cached) return NextResponse.json(cached);

  const codeKind = classifyMedicalCode(query);

  if (codeKind === "icd10-cm") {
    const diagnosisMatches = await searchIcd10Cm(query, 8);
    const response: ProcedureSearchResponse = {
      procedures: [],
      noData: true,
      queryKind: "icd10-cm",
      diagnosisMatches,
      note: "ICD-10-CM is a diagnosis code. It is not a hospital price key.",
    };
    await redis.set(cacheKey, response, { ex: 3600 });
    return NextResponse.json(response);
  }

  const isCptQuery = looksLikeCptCode(query);

  // ── Step 1: Resolve query to CPT/HCPCS codes ────────────────────────────────────

  let cptCodes: string[] = [];
  const cptDescriptions = new Map<string, string>();

  const cptConfidence = new Map<string, number>();

  let hcpcsMatches: NlmCodeHit[] = [];
  if (codeKind === "hcpcs-level-2") {
    hcpcsMatches = await searchHcpcs(query, 8);
    cptCodes = hcpcsMatches.map((m) => m.code);
    for (const m of hcpcsMatches) {
      cptDescriptions.set(m.code, m.description);
      cptConfidence.set(m.code, 100);
    }
  } else if (isCptQuery) {
    cptCodes = [query.trim()];
    cptConfidence.set(query.trim(), 100);
  } else {
    // Text query: search the hospitals' own service descriptions (fresh corpus,
    // FTS) in parallel with the curated mapping/CPT tables.
    const [descHits, cptMatches] = await Promise.all([
      searchServiceDescriptions(query, 12).catch((err) => {
        console.error("searchServiceDescriptions failed", err);
        return [];
      }),
      searchCptCodes(query, 10),
    ]);
    const consider = (code: string, description: string, confidence: number) => {
      if (!cptDescriptions.has(code)) {
        cptCodes.push(code);
        cptDescriptions.set(code, description);
        cptConfidence.set(code, confidence);
        return;
      }
      const prev = cptConfidence.get(code) ?? 0;
      if (confidence > prev) {
        cptConfidence.set(code, confidence);
        if (description.length > (cptDescriptions.get(code)?.length ?? 0)) {
          cptDescriptions.set(code, description);
        }
      }
    };
    for (const m of cptMatches) {
      consider(m.code, m.description, m.confidence);
    }
    for (const hit of descHits) {
      if (hit.codeKind !== "cpt-shaped" && hit.codeKind !== "hcpcs-level-2") continue;
      const scored = scoreDescriptionMatch(query, hit.description);
      consider(hit.code, hit.description, scored.confidence);
    }
  }

  if (!cptCodes.length) {
    return NextResponse.json({
      procedures: [],
      noData: true,
      queryKind: codeKind === "cpt-shaped" ? "cpt-shaped" : "text",
      hcpcsMatches: hcpcsMatches.length ? hcpcsMatches : undefined,
    } satisfies ProcedureSearchResponse);
  }

  // ── Step 2: keep only codes that actually have fresh published prices ─────
  const withPrices = await codesWithFreshPrices(cptCodes);
  const priced = cptCodes.filter((c) => withPrices.has(c));

  if (priced.length === 0) {
    return NextResponse.json({
      procedures: [],
      noData: true,
      queryKind: codeKind === "hcpcs-level-2" ? "hcpcs-level-2" : isCptQuery ? "cpt-shaped" : "text",
      hcpcsMatches: hcpcsMatches.length ? hcpcsMatches : undefined,
      note: hcpcsMatches.length
        ? "HCPCS validated against NLM Clinical Tables, but no hospital price rows are stored for this code yet."
        : undefined,
    } satisfies ProcedureSearchResponse);
  }

  // Prefer curated CptCode descriptions when we have them
  const missingDescs = priced.filter((c) => !cptDescriptions.has(c));
  if (missingDescs.length) {
    const cptRows = await prisma.cptCode.findMany({
      where: { code: { in: missingDescs } },
      select: { code: true, description: true },
    });
    for (const r of cptRows) cptDescriptions.set(r.code, r.description);
  }

  // ── Step 3: Build results ─────────────────────────────────────────────────
  const results: ProcedureSearchResult[] = priced
    .map((code) => {
      const confidence = cptConfidence.get(code) ?? 0;
      const matchQuality: ProcedureSearchResult["matchQuality"] =
        confidence >= 100 ? "exact" :
        confidence > 80   ? "strong" :
        confidence >= 50  ? "partial" :
                            "weak";
      return {
        cptCode: code,
        name: cptDescriptions.get(code) ?? code,
        category: "General",
        priceCount: 1, // real counts shown in compare view
        hospitalCount: 0,
        matchScore: confidence,
        matchQuality,
      };
    })
    .sort((a, b) => b.matchScore - a.matchScore)
    .slice(0, 10);

  const response: ProcedureSearchResponse = {
    procedures: results,
    noData: false,
    queryKind: codeKind === "hcpcs-level-2" ? "hcpcs-level-2" : isCptQuery ? "cpt-shaped" : "text",
    hcpcsMatches: hcpcsMatches.length ? hcpcsMatches : undefined,
  };
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
