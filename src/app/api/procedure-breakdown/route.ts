import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { anthropicStream } from "@/lib/anthropic-fetch";
import { redis } from "@/lib/redis";
import { searchCptCodes } from "@/lib/cpt-lookup";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

// ── Types ──────────────────────────────────────────────────────────────────────

export interface BreakdownComponent {
  id: string;
  name: string;
  category: string;
  description: string;
  cptCode: string;
  hcpcsCode?: string;
  chargemasterLow: number | null;
  chargemasterHigh: number | null;
  insuranceLow: number | null;
  insuranceHigh: number | null;
  cashLow: number | null;
  cashHigh: number | null;
  notes: string;
  /** "real" = prices come from the chargemaster DB. "unavailable" = no DB data for this component. */
  dataSource: "real" | "unavailable";
}

export interface AlternativeProcedure {
  name: string;
  cptCode: string;
  approach: string;
  typicalRecovery: string;
  pros: string;
  cons: string;
}

export interface ConditionAnalysis {
  originalQuery: string;
  isConditionDescription: boolean;
  identifiedProcedure: string;
  reasoning: string;
  alternatives?: AlternativeProcedure[];
}

export interface ProcedureBreakdown {
  procedureName: string;
  cptCode: string;
  description: string;
  conditionAnalysis?: ConditionAnalysis;
  components: BreakdownComponent[];
  chargemasterTotalLow: number;
  chargemasterTotalHigh: number;
  insuranceTotalLow: number | null;
  insuranceTotalHigh: number | null;
  cashTotalLow: number;
  cashTotalHigh: number;
  coinsurance: number;
  insurerName: string | null;
  assumptions: string;
  importantNotes: string[];
  /** Fraction of components backed by real chargemaster data (0–1). */
  dataCompleteness: number;
  /** Confidence level based on data quality: "high" (>50% real), "medium" (some real), "low" (all estimated). */
  confidence: "high" | "medium" | "low";
}

// ── Constants ─────────────────────────────────────────────────────────────────

const CATEGORY_LIST = [
  "Professional Services",
  "Facility & OR",
  "Anesthesia",
  "Diagnostics & Imaging",
  "Medical Devices & Implants",
  "Medications & Consumables",
  "Rehabilitation",
  "Follow-up Care",
] as const;

// ── Helpers ───────────────────────────────────────────────────────────────────

type PriceRange = { min: number; max: number; count: number };

type CptPriceMap = Record<
  string,
  { name: string; gross: PriceRange | null; negotiated: PriceRange | null; cash: PriceRange | null }
>;

function safeMin(arr: number[]): number {
  let m = arr[0];
  for (let i = 1; i < arr.length; i++) if (arr[i] < m) m = arr[i];
  return m;
}
function safeMax(arr: number[]): number {
  let m = arr[0];
  for (let i = 1; i < arr.length; i++) if (arr[i] > m) m = arr[i];
  return m;
}

function buildRange(prices: number[]): PriceRange | null {
  if (!prices.length) return null;
  return { min: safeMin(prices), max: safeMax(prices), count: prices.length };
}

function formatRangeLine(label: string, range: PriceRange | null): string | null {
  if (!range) return null;
  return `${label} $${Math.round(range.min).toLocaleString()}–$${Math.round(range.max).toLocaleString()} (n=${range.count})`;
}

function sumField(components: BreakdownComponent[], field: keyof BreakdownComponent): number {
  return components.reduce((s, c) => {
    const v = c[field];
    return s + (typeof v === "number" ? v : 0);
  }, 0);
}

function repairJson(jsonStr: string): string {
  const repair = jsonStr.trimEnd().replace(/,\s*$/, "");
  const opens = (repair.match(/[\[{]/g) ?? []).length;
  const closes = (repair.match(/[\]}]/g) ?? []).length;
  if (opens > closes) return repair + "]".repeat(opens - closes - 1) + "}";
  return repair;
}

function byCode(
  rows: { priceInCents: number; procedure: { cptCode: string } }[],
): Record<string, number[]> {
  return rows.reduce<Record<string, number[]>>((acc, r) => {
    (acc[r.procedure.cptCode] ??= []).push(r.priceInCents / 100);
    return acc;
  }, {});
}

// ── DB helpers ────────────────────────────────────────────────────────────────

/**
 * Broad pre-query: fetches real chargemaster price ranges for procedures matching the query.
 * Pass 1: keyword search in our DB.
 * Pass 2: NLM CPT API lookup → retry DB by exact CPT codes (handles symptom descriptions).
 * Returns { priceMap, nlmHint } — nlmHint is the top NLM CPT match for the AI prompt.
 */
/** Common words that match too many chargemaster entries and add noise. */
const CHARGEMASTER_STOP = new Set([
  "need", "surgery", "surgical", "procedure", "operation", "treatment", "repair",
  "have", "want", "like", "just", "been", "pain", "right", "left",
  "doctor", "told", "recommend", "recommended", "diagnosed",
]);

async function fetchChargemasterData(
  query: string,
): Promise<{ priceMap: CptPriceMap; nlmHint: string | null }> {
  const words = query
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .filter((w) => w.length > 3 && !CHARGEMASTER_STOP.has(w))
    .slice(0, 6);

  // Run keyword DB search and NLM CPT lookup in parallel
  const [keywordProcedures, nlmMatches] = await Promise.all([
    words.length
      ? prisma.procedure.findMany({
          where: { OR: words.map((w) => ({ name: { contains: w, mode: "insensitive" as const } })) },
          select: {
            cptCode: true,
            name: true,
            prices: { select: { priceInCents: true, priceType: true, payerType: true }, take: 200 },
          },
          take: 40,
        })
      : Promise.resolve([]),
    searchCptCodes(query, 5),
  ]);

  // NLM hint: top match description for the AI prompt
  const nlmHint = nlmMatches.length
    ? `NLM CPT lookup suggests: CPT ${nlmMatches[0].code} — ${nlmMatches[0].description}`
    : null;

  // Pass 2: if keyword search missed, look up by NLM CPT codes
  const nlmCptCodes = nlmMatches.map((m) => m.code);
  const nlmProcedures =
    nlmCptCodes.length && keywordProcedures.length === 0
      ? await prisma.procedure.findMany({
          where: { cptCode: { in: nlmCptCodes } },
          select: {
            cptCode: true,
            name: true,
            prices: { select: { priceInCents: true, priceType: true, payerType: true }, take: 200 },
          },
          take: 40,
        })
      : [];

  const procedures = keywordProcedures.length ? keywordProcedures : nlmProcedures;

  if (!procedures.length) return { priceMap: {}, nlmHint };

  const buckets: Record<string, { name: string; gross: number[]; negotiated: number[]; cash: number[] }> = {};

  for (const proc of procedures) {
    for (const row of proc.prices) {
      buckets[proc.cptCode] ??= { name: proc.name, gross: [], negotiated: [], cash: [] };
      const price = row.priceInCents / 100;
      if (row.priceType === "gross") buckets[proc.cptCode].gross.push(price);
      else if (row.payerType === "cash") buckets[proc.cptCode].cash.push(price);
      else if (row.priceType === "negotiated" || row.priceType === "discounted")
        buckets[proc.cptCode].negotiated.push(price);
    }
  }

  const priceMap = Object.fromEntries(
    Object.entries(buckets).map(([cpt, b]) => [
      cpt,
      {
        name: b.name,
        gross: buildRange(b.gross),
        negotiated: buildRange(b.negotiated),
        cash: buildRange(b.cash),
      },
    ]),
  );

  return { priceMap, nlmHint };
}

/** Formats the chargemaster map as a human-readable constraint table for the AI prompt.
 *  Capped at 20 entries to keep the system prompt within a safe token budget. */
function buildChargemasterContext(priceMap: CptPriceMap): string {
  const lines = Object.entries(priceMap)
    .slice(0, 20)
    .map(([cpt, data]) => {
      const parts = [
        formatRangeLine("list", data.gross),
        formatRangeLine("negotiated", data.negotiated),
        formatRangeLine("cash", data.cash),
      ].filter(Boolean);
      return parts.length ? `  CPT ${cpt} (${data.name}): ${parts.join(" | ")}` : null;
    })
    .filter(Boolean);
  return lines.join("\n");
}

// ── Route handler ─────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { query, insurerName, payerType, coinsurance = 0.2 } = body as {
    query: string;
    insurerName?: string;
    payerType?: string;
    coinsurance?: number;
  };

  if (!query?.trim()) {
    return NextResponse.json({ error: "Query is required" }, { status: 400 });
  }

  // coinsurance is UI-only — doesn't affect price components, only the "you pay" calc in the client
  const cacheKey = `breakdown4:${query.trim().toLowerCase()}|${insurerName ?? ""}|${payerType ?? ""}`;

  // ── SSE setup ──────────────────────────────────────────────────────────────
  const encoder = new TextEncoder();
  const { readable, writable } = new TransformStream<Uint8Array, Uint8Array>();
  const writer = writable.getWriter();

  const send = (event: string, data: unknown) => {
    void writer.write(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
  };

  void (async () => {
    try {
      // 1. Cache hit
      const cached = await redis.get<ProcedureBreakdown>(cacheKey);
      if (cached) {
        send("result", cached);
        await writer.close();
        return;
      }

      // 2. Pre-load NLM CPT hint to improve AI's procedure identification
      const { nlmHint } = await Promise.race([
        fetchChargemasterData(query),
        new Promise<{ priceMap: CptPriceMap; nlmHint: string | null }>(
          (resolve) => setTimeout(() => resolve({ priceMap: {}, nlmHint: null }), 5000),
        ),
      ]);

      // 3. Build AI prompt — AI identifies procedure, components, and CPT codes only.
      //    It must NOT generate any dollar amounts. Prices come from DB only.
      const systemPrompt = `You are a healthcare cost transparency expert for Manhattan hospitals with deep clinical knowledge.

Your job is to identify the correct procedure for a patient's query and enumerate all billable components with their CPT/HCPCS codes. You do NOT generate any prices or dollar amounts.

CLINICAL REASONING PROTOCOL — before listing components, reason through:
1. What condition is described and what does standard of care dictate?
2. What is the MOST COMMON surgical/procedural treatment path and why?
3. What are the specific procedure steps, typical OR time, and anesthesia type?
4. What specific implants, hardware, or devices are typically used? Be granular — not "hardware" but "titanium locking compression plate 3.5mm, 6 cortical screws (HCPCS C1713)"
5. What pre-op diagnostics are required? (MRI, CT, labs, cardiac clearance, etc.)
6. Expected hospital stay: inpatient days or same-day/23-hour?
7. Post-op rehabilitation protocol?

RULES:
1. Handle both condition descriptions (e.g. "torn ACL") and direct procedure names.
2. For conditions, identify the most appropriate surgical procedure first (most common treatment, not the most aggressive).
2b. For the "alternatives" array, return structured objects ONLY when genuinely different surgical approaches exist. Include CPT codes so users can search for detailed costs. Recovery times should be realistic ranges. Return an empty array if there are no meaningful alternatives.
3. For surgical procedures, list every individual implant, screw, plate, nail, anchor, and graft separately with HCPCS codes.
4. DO NOT include any dollar amounts, price estimates, or cost figures in your response. All price fields must be null.
5. Respond with ONLY valid JSON — no markdown, no commentary.`;

      const nlmContext = nlmHint ? `\nCPT CODE HINT (from NLM database): ${nlmHint}` : "";

      const userPrompt = `Patient query: "${query}"${nlmContext}

Return a complete JSON breakdown (all price fields must be null — prices are populated from our database separately):
{
  "procedureName": "Full official procedure name",
  "cptCode": "primary CPT code",
  "description": "2-3 sentence plain-language description",
  "conditionAnalysis": {
    "originalQuery": "${query.replace(/"/g, "'")}",
    "isConditionDescription": <true if user described a condition, false if they named a procedure directly>,
    "identifiedProcedure": "Procedure identified from their description",
    "reasoning": "1-2 sentences explaining why this procedure is appropriate",
    "alternatives": [
      {
        "name": "Alternative procedure name",
        "cptCode": "CPT code for the alternative",
        "approach": "e.g. Arthroscopic vs Open",
        "typicalRecovery": "e.g. 4-6 months",
        "pros": "Brief advantage of this approach",
        "cons": "Brief disadvantage of this approach"
      }
    ]
  },
  "components": [
    {
      "id": "1",
      "name": "Specific component name (e.g. 'Titanium Locking Plate' not 'Hardware')",
      "category": "One of: ${CATEGORY_LIST.join(" | ")}",
      "description": "One sentence: what this charge covers",
      "cptCode": "CPT code if applicable, else empty string",
      "hcpcsCode": "HCPCS L/C code for devices if applicable, else empty string",
      "notes": "Key cost driver note, or empty string"
    }
  ],
  "assumptions": "What clinical scenario these components assume",
  "importantNotes": ["3-4 important notes about cost variability, deductibles, etc."]
}

For surgical cases include ALL of: pre-op labs/imaging, anesthesia, OR facility fee,
surgeon fee, all implants individually, medications, post-op recovery, physical therapy,
and follow-up visits.`;

      // 4. Stream AI response — use Haiku for speed (structured JSON task, 5-15s vs 40-60s for Sonnet)
      const text = await anthropicStream(
        {
          model: "claude-haiku-4-5-20251001",
          max_tokens: 2500,
          cacheSystemPrompt: true,
          system: systemPrompt,
          messages: [{ role: "user", content: userPrompt }],
        },
        (chunk) => send("chunk", { text: chunk }),
      );

      // 5. Parse JSON
      const match = text.match(/\{[\s\S]*\}/);
      if (!match) {
        console.error("AI response contained no JSON. Length:", text.length, "Preview:", text.slice(0, 300));
        throw new Error("Could not parse AI response");
      }

      let rawBreakdown: {
        procedureName: string;
        cptCode: string;
        description: string;
        conditionAnalysis?: ConditionAnalysis;
        components: Array<{
          id: string;
          name: string;
          category: string;
          description: string;
          cptCode: string;
          hcpcsCode?: string;
          notes: string;
        }>;
        assumptions: string;
        importantNotes: string[];
      };
      try {
        rawBreakdown = JSON.parse(match[0]);
      } catch {
        rawBreakdown = JSON.parse(repairJson(match[0]));
      }

      // 6. Populate prices exclusively from DB — AI provides no dollar amounts
      const cptCodes = rawBreakdown.components.map((c) => c.cptCode).filter(Boolean);
      const insPayerType = payerType ?? "commercial";

      const dbTimeout = <T>(promise: Promise<T>, fallback: T): Promise<T> =>
        Promise.race([promise, new Promise<T>((resolve) => setTimeout(() => resolve(fallback), 5000))]);

      const [grossRows, cashRows, insRows] = await Promise.all([
        dbTimeout(prisma.priceEntry.findMany({
          where: { procedure: { cptCode: { in: cptCodes } }, priceType: "gross" },
          select: { priceInCents: true, procedure: { select: { cptCode: true } } },
          take: 500,
        }), []),
        dbTimeout(prisma.priceEntry.findMany({
          where: { procedure: { cptCode: { in: cptCodes } }, payerType: "cash" },
          select: { priceInCents: true, procedure: { select: { cptCode: true } } },
          take: 500,
        }), []),
        dbTimeout(prisma.priceEntry.findMany({
          where: {
            procedure: { cptCode: { in: cptCodes } },
            payerType: insPayerType,
            priceType: { in: ["negotiated", "discounted"] },
          },
          select: { priceInCents: true, procedure: { select: { cptCode: true } } },
          take: 500,
        }), []),
      ]);

      const grossByCpt = byCode(grossRows);
      const cashByCpt = byCode(cashRows);
      const insByCpt = byCode(insRows);

      const enrichedComponents: BreakdownComponent[] = rawBreakdown.components.map((comp) => {
        const gross = comp.cptCode ? (grossByCpt[comp.cptCode] ?? []) : [];
        const cash = comp.cptCode ? (cashByCpt[comp.cptCode] ?? []) : [];
        const ins = comp.cptCode ? (insByCpt[comp.cptCode] ?? []) : [];

        const hasData = gross.length > 0 || cash.length > 0 || ins.length > 0;

        return {
          ...comp,
          chargemasterLow: gross.length ? Math.round(safeMin(gross)) : null,
          chargemasterHigh: gross.length ? Math.round(safeMax(gross)) : null,
          insuranceLow: ins.length ? Math.round(safeMin(ins)) : null,
          insuranceHigh: ins.length ? Math.round(safeMax(ins)) : null,
          cashLow: cash.length ? Math.round(safeMin(cash)) : null,
          cashHigh: cash.length ? Math.round(safeMax(cash)) : null,
          dataSource: hasData ? ("real" as const) : ("unavailable" as const),
        };
      });

      // ── Validate AI-returned CPT codes against DB ─────────────────────────
      const aiCptCodes = enrichedComponents
        .map((c) => c.cptCode)
        .filter((code) => code && code.length >= 4);
      if (aiCptCodes.length > 0) {
        const knownProcedures = await dbTimeout(
          prisma.procedure.findMany({
            where: { cptCode: { in: aiCptCodes } },
            select: { cptCode: true },
          }),
          [],
        );
        const knownCpts = new Set(knownProcedures.map((p) => p.cptCode));
        for (const comp of enrichedComponents) {
          if (comp.cptCode && comp.cptCode.length >= 4 && !knownCpts.has(comp.cptCode)) {
            comp.notes = comp.notes
              ? `${comp.notes} [CPT code not verified in database]`
              : "[CPT code not verified in database]";
          }
        }
      }

      const realCount = enrichedComponents.filter((c) => c.dataSource === "real").length;
      const dataCompleteness = enrichedComponents.length > 0 ? realCount / enrichedComponents.length : 0;

      // ── Confidence level — based purely on DB data availability ─────────────
      const confidence: "high" | "medium" | "low" =
        dataCompleteness > 0.5 ? "high" : dataCompleteness > 0 ? "medium" : "low";

      // ── Compute totals (only from real DB data) ────────────────────────────
      const chargemasterTotalLow = sumField(enrichedComponents, "chargemasterLow");
      const chargemasterTotalHigh = sumField(enrichedComponents, "chargemasterHigh");
      const cashTotalLow = sumField(enrichedComponents, "cashLow");
      const cashTotalHigh = sumField(enrichedComponents, "cashHigh");
      const insuranceTotalLow = sumField(enrichedComponents, "insuranceLow") || null;
      const insuranceTotalHigh = sumField(enrichedComponents, "insuranceHigh") || null;

      const totalNotes = [...(rawBreakdown.importantNotes ?? [])];
      if (dataCompleteness < 1) {
        totalNotes.push(
          `${Math.round((1 - dataCompleteness) * 100)}% of components have no chargemaster data available. Totals reflect only components with real hospital pricing.`
        );
      }

      const enrichedBreakdown: ProcedureBreakdown = {
        procedureName: rawBreakdown.procedureName,
        cptCode: rawBreakdown.cptCode,
        description: rawBreakdown.description,
        conditionAnalysis: rawBreakdown.conditionAnalysis,
        components: enrichedComponents,
        chargemasterTotalLow,
        chargemasterTotalHigh,
        insuranceTotalLow,
        insuranceTotalHigh,
        cashTotalLow,
        cashTotalHigh,
        coinsurance,
        insurerName: insurerName ?? null,
        dataCompleteness,
        confidence,
        assumptions: rawBreakdown.assumptions,
        importantNotes: totalNotes,
      };

      await redis.set(cacheKey, enrichedBreakdown, { ex: 86400 });

      // Fire-and-forget search log
      prisma.searchLog.create({
        data: {
          query: query.trim(),
          endpoint: "procedure-breakdown",
          resultCount: enrichedComponents.length,
          cptCode: enrichedBreakdown.cptCode ?? null,
          procedureName: enrichedBreakdown.procedureName ?? null,
          insurerName: insurerName ?? null,
          payerType: payerType ?? null,
        },
      }).catch(() => {});

      send("result", enrichedBreakdown);
    } catch (err) {
      console.error("Breakdown error:", err);
      send("error", { message: err instanceof Error ? err.message : "Failed to generate breakdown" });
    } finally {
      await writer.close();
    }
  })();

  return new Response(readable, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
