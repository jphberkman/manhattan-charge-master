import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { anthropicStream } from "@/lib/anthropic-fetch";
import { redis } from "@/lib/redis";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// ── Types ──────────────────────────────────────────────────────────────────────

export interface BreakdownComponent {
  id: string;
  name: string;
  category: string;
  description: string;
  cptCode: string;
  hcpcsCode?: string;
  chargemasterLow: number;
  chargemasterHigh: number;
  insuranceLow: number | null;
  insuranceHigh: number | null;
  cashLow: number;
  cashHigh: number;
  notes: string;
  /** "real" = prices come from the chargemaster DB. "estimated" = AI estimate (no DB match). */
  dataSource: "real" | "estimated";
}

export interface ConditionAnalysis {
  originalQuery: string;
  isConditionDescription: boolean;
  identifiedProcedure: string;
  reasoning: string;
  alternatives?: string[];
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

function buildRange(prices: number[]): PriceRange | null {
  if (!prices.length) return null;
  return { min: Math.min(...prices), max: Math.max(...prices), count: prices.length };
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

/** Broad pre-query: fetches real chargemaster price ranges for procedures matching the query. */
async function fetchChargemasterData(query: string): Promise<CptPriceMap> {
  const words = query
    .trim()
    .split(/\s+/)
    .filter((w) => w.length > 3)
    .slice(0, 6);

  if (!words.length) return {};

  const procedures = await prisma.procedure.findMany({
    where: { OR: words.map((w) => ({ name: { contains: w, mode: "insensitive" as const } })) },
    select: { id: true, cptCode: true, name: true },
    take: 40,
  });

  if (!procedures.length) return {};

  const idToProc = Object.fromEntries(procedures.map((p) => [p.id, p]));

  const rows = await prisma.priceEntry.findMany({
    where: { procedureId: { in: procedures.map((p) => p.id) } },
    select: { procedureId: true, priceInCents: true, priceType: true, payerType: true },
  });

  const buckets: Record<string, { name: string; gross: number[]; negotiated: number[]; cash: number[] }> = {};

  for (const row of rows) {
    const proc = idToProc[row.procedureId];
    if (!proc) continue;
    buckets[proc.cptCode] ??= { name: proc.name, gross: [], negotiated: [], cash: [] };
    const price = row.priceInCents / 100;
    if (row.priceType === "gross") buckets[proc.cptCode].gross.push(price);
    else if (row.payerType === "cash") buckets[proc.cptCode].cash.push(price);
    else if (row.priceType === "negotiated" || row.priceType === "discounted")
      buckets[proc.cptCode].negotiated.push(price);
  }

  return Object.fromEntries(
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

  const cacheKey = `breakdown3:${query.trim().toLowerCase()}|${insurerName ?? ""}|${payerType ?? ""}|${coinsurance}`;

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

      // 2. Pre-load real chargemaster data BEFORE calling AI
      //    This gives Claude hard price bounds instead of making up numbers.
      const chargemasterData = await fetchChargemasterData(query);
      const chargemasterContext = buildChargemasterContext(chargemasterData);
      const hasDbData = Object.keys(chargemasterData).length > 0;

      const insurerContext = insurerName
        ? `The patient has ${insurerName} insurance (${payerType ?? "commercial"}).`
        : "No specific insurer selected — use typical commercial in-network estimates.";

      // 3. Build AI prompt — real data as hard constraints, not suggestions
      const systemPrompt = `You are a healthcare cost transparency expert for Manhattan hospitals with deep clinical knowledge.

Your job is to produce a structured JSON cost breakdown for medical procedures.

CLINICAL REASONING PROTOCOL — before building the bill, reason through:
1. What condition is described and what does standard of care dictate? (reference AAOS, ACS, ACC/AHA, ACOG guidelines as applicable)
2. What is the MOST COMMON surgical/procedural treatment path and why?
3. What are the specific procedure steps, typical OR time, and anesthesia type?
4. What specific implants, hardware, or devices are typically used? Be granular — not "hardware" but "titanium locking compression plate 3.5mm, 6 cortical screws (HCPCS C1713)"
5. What pre-op diagnostics are required? (MRI, CT, labs, cardiac clearance, etc.)
6. Expected hospital stay: inpatient days or same-day/23-hour?
7. Post-op rehabilitation protocol?

Use this reasoning to ensure the bill includes EVERY component a patient would actually be charged for.

${
  hasDbData
    ? `REAL CHARGEMASTER DATA — use these as reference ranges for matching CPT codes.
${chargemasterContext}

IMPORTANT INTERPRETATION RULES:
- These DB entries are often professional fee line items (surgeon only), NOT full episode prices.
- A total knee replacement surgeon fee of $3,000–$5,000 is correct for that line item, but the
  full episode (facility + implants + anesthesia) costs $50,000–$100,000 at Manhattan hospitals.
- Use DB prices for the SPECIFIC component they represent (e.g. surgeon fee for that CPT).
- Set "dataSource": "real" for components whose CPT matches the table above.
- For all other components, use realistic full Manhattan market rates and set "dataSource": "estimated".
- Do NOT let a low professional fee line item constrain your facility fee or implant cost estimates.`
    : `No chargemaster database matches found for this query.
Set "dataSource": "estimated" for all components and use realistic Manhattan market rates.`
}

RULES:
1. Handle both condition descriptions (e.g. "torn ACL") and direct procedure names.
2. For conditions, identify the most appropriate surgical procedure first (most common treatment, not the most aggressive).
3. For surgical procedures, list every individual implant, screw, plate, nail, anchor, and graft separately with HCPCS codes.
4. Never fabricate prices for CPT codes listed in the real data table above — use those exact ranges.
5. Manhattan hospital prices are significantly higher than national averages — apply a 1.4–1.8x multiplier vs. national benchmarks.
6. Respond with ONLY valid JSON — no markdown, no commentary.`;

      const userPrompt = `Patient query: "${query}"
${insurerContext}

Return a complete JSON breakdown:
{
  "procedureName": "Full official procedure name",
  "cptCode": "primary CPT code",
  "description": "2-3 sentence plain-language description",
  "conditionAnalysis": {
    "originalQuery": "${query.replace(/"/g, "'")}",
    "isConditionDescription": <true if user described a condition, false if they named a procedure directly>,
    "identifiedProcedure": "Procedure identified from their description",
    "reasoning": "1-2 sentences explaining why this procedure is appropriate",
    "alternatives": ["Alternative 1 if applicable"]
  },
  "components": [
    {
      "id": "1",
      "name": "Specific component name (e.g. 'Titanium Locking Plate' not 'Hardware')",
      "category": "One of: ${CATEGORY_LIST.join(" | ")}",
      "description": "What this charge covers and why it is needed",
      "cptCode": "CPT code if applicable, else empty string",
      "hcpcsCode": "HCPCS L/C code for devices if applicable, else empty string",
      "chargemasterLow": <integer USD — hospital list price lower bound>,
      "chargemasterHigh": <integer USD — hospital list price upper bound>,
      "insuranceLow": <integer USD — in-network rate lower bound, or null if unknown>,
      "insuranceHigh": <integer USD — in-network rate upper bound, or null if unknown>,
      "cashLow": <integer USD — self-pay lower bound>,
      "cashHigh": <integer USD — self-pay upper bound>,
      "notes": "Key cost driver, or empty string",
      "dataSource": "real" or "estimated"
    }
  ],
  "chargemasterTotalLow": <sum of all chargemasterLow>,
  "chargemasterTotalHigh": <sum of all chargemasterHigh>,
  "insuranceTotalLow": <sum of all non-null insuranceLow, or null>,
  "insuranceTotalHigh": <sum of all non-null insuranceHigh, or null>,
  "cashTotalLow": <sum of all cashLow>,
  "cashTotalHigh": <sum of all cashHigh>,
  "assumptions": "What insurance type and clinical scenario these estimates assume",
  "importantNotes": ["3-4 important notes about cost variability, deductibles, etc."]
}

For surgical cases include ALL of: pre-op labs/imaging, anesthesia, OR facility fee,
surgeon fee, all implants individually, medications, post-op recovery, physical therapy,
and follow-up visits.`;

      // 4. Stream AI response
      const text = await anthropicStream(
        {
          max_tokens: 4096,
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

      let rawBreakdown: Omit<ProcedureBreakdown, "coinsurance" | "insurerName" | "dataCompleteness">;
      try {
        rawBreakdown = JSON.parse(match[0]);
      } catch {
        rawBreakdown = JSON.parse(repairJson(match[0]));
      }

      // 6. Server-side enrichment — authoritative DB override
      //    Even if Claude used the pre-loaded data correctly, we re-query by the exact
      //    component CPT codes it generated to ensure numbers are accurate and set
      //    dataSource authoritatively (not trusting AI self-reporting).
      const cptCodes = rawBreakdown.components.map((c) => c.cptCode).filter(Boolean);
      const insPayerType = payerType ?? "commercial";

      const [grossRows, cashRows, insRows] = await Promise.all([
        prisma.priceEntry.findMany({
          where: { procedure: { cptCode: { in: cptCodes } }, priceType: "gross" },
          select: { priceInCents: true, procedure: { select: { cptCode: true } } },
          take: 500,
        }),
        prisma.priceEntry.findMany({
          where: { procedure: { cptCode: { in: cptCodes } }, payerType: "cash" },
          select: { priceInCents: true, procedure: { select: { cptCode: true } } },
          take: 500,
        }),
        prisma.priceEntry.findMany({
          where: {
            procedure: { cptCode: { in: cptCodes } },
            payerType: insPayerType,
            priceType: { in: ["negotiated", "discounted"] },
          },
          select: { priceInCents: true, procedure: { select: { cptCode: true } } },
          take: 500,
        }),
      ]);

      const grossByCpt = byCode(grossRows);
      const cashByCpt = byCode(cashRows);
      const insByCpt = byCode(insRows);

      const enrichedComponents: BreakdownComponent[] = rawBreakdown.components.map((comp) => {
        if (!comp.cptCode) return { ...comp, dataSource: "estimated" as const };

        const gross = grossByCpt[comp.cptCode] ?? [];
        const cash = cashByCpt[comp.cptCode] ?? [];
        const ins = insByCpt[comp.cptCode] ?? [];

        if (!gross.length && !cash.length && !ins.length) {
          return { ...comp, dataSource: "estimated" as const };
        }

        return {
          ...comp,
          ...(gross.length && {
            chargemasterLow: Math.round(Math.min(...gross)),
            chargemasterHigh: Math.round(Math.max(...gross)),
          }),
          ...(ins.length && {
            insuranceLow: Math.round(Math.min(...ins)),
            insuranceHigh: Math.round(Math.max(...ins)),
          }),
          ...(cash.length && {
            cashLow: Math.round(Math.min(...cash)),
            cashHigh: Math.round(Math.max(...cash)),
          }),
          dataSource: "real" as const,
        };
      });

      const realCount = enrichedComponents.filter((c) => c.dataSource === "real").length;
      const dataCompleteness = enrichedComponents.length > 0 ? realCount / enrichedComponents.length : 0;

      const enrichedBreakdown: ProcedureBreakdown = {
        ...rawBreakdown,
        components: enrichedComponents,
        chargemasterTotalLow: sumField(enrichedComponents, "chargemasterLow"),
        chargemasterTotalHigh: sumField(enrichedComponents, "chargemasterHigh"),
        insuranceTotalLow: sumField(enrichedComponents, "insuranceLow") || null,
        insuranceTotalHigh: sumField(enrichedComponents, "insuranceHigh") || null,
        cashTotalLow: sumField(enrichedComponents, "cashLow"),
        cashTotalHigh: sumField(enrichedComponents, "cashHigh"),
        coinsurance,
        insurerName: insurerName ?? null,
        dataCompleteness,
      };

      await redis.set(cacheKey, enrichedBreakdown, { ex: 86400 });
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
