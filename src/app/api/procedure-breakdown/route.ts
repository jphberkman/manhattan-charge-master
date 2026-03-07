import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { anthropicCall } from "@/lib/anthropic-fetch";

export const dynamic = "force-dynamic";

// In-memory cache: key → { data, timestamp }
const breakdownCache = new Map<string, { data: ProcedureBreakdown; ts: number }>();
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

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
  hasRealData?: boolean;
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
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { query, insurerName, payerType, coinsurance = 0.20 } = body as {
    query: string;
    insurerName?: string;
    payerType?: string;
    coinsurance?: number;
  };

  if (!query?.trim()) {
    return NextResponse.json({ error: "Query is required" }, { status: 400 });
  }

  // Return cached result if available
  const cacheKey = `${query.trim().toLowerCase()}|${insurerName ?? ""}|${payerType ?? ""}|${coinsurance}`;
  const cached = breakdownCache.get(cacheKey);
  if (cached && Date.now() - cached.ts < CACHE_TTL_MS) {
    return NextResponse.json(cached.data);
  }

  // Fetch only relevant CPT codes (top 20 fuzzy match) instead of all 200
  const words = query.trim().split(/\s+/).slice(0, 3);
  const dbProcedures = await prisma.procedure.findMany({
    where: {
      OR: words.map((w) => ({ name: { contains: w, mode: "insensitive" as const } })),
    },
    select: { cptCode: true, name: true },
    take: 20,
  });
  const dbCptList = dbProcedures.map((p) => `${p.cptCode}: ${p.name}`).join("\n");

  const insurerContext = insurerName
    ? `The patient has ${insurerName} insurance (${payerType ?? "commercial"}).`
    : "No specific insurer selected — use typical commercial in-network estimates.";

  const systemPrompt = `You are a healthcare cost transparency expert specializing in Manhattan hospital charge master pricing, surgical planning, and medical coding.

You help patients understand the COMPLETE cost of medical procedures — including every piece of hardware, implant, surgical supply, and billable service.

CRITICAL RULES:
1. The user may describe a medical CONDITION (e.g., "non-union ankle fracture", "torn ACL", "gallstones") or a PROCEDURE directly. You must handle both.
2. If they describe a condition, first identify the most appropriate surgical procedure, then provide a full breakdown.
3. Always include a "Medical Devices & Implants" category for surgical procedures — list each implant, screw, plate, nail, anchor, graft, etc. individually with HCPCS codes where applicable.
4. Provide THREE price tiers per component reflecting real Manhattan hospital market data:
   - chargemaster: hospital gross/list price (typically 3-8x the insurance rate for implants, 2-4x for services)
   - insurance: in-network negotiated rate
   - cash: self-pay discount price (usually 10-40% above insurance rate)
5. For implant/device items specifically, chargemaster prices can be $500–$25,000+ each.

${dbCptList ? `\nDatabase CPT codes available (prefer these when they match):\n${dbCptList}` : ""}

Respond with ONLY valid JSON — no markdown, no commentary.`;

  const userPrompt = `Patient query: "${query}"
${insurerContext}

Return a complete JSON breakdown:
{
  "procedureName": "Full official procedure name",
  "cptCode": "primary CPT code",
  "description": "2-3 sentence plain-language description of what this procedure involves",
  "conditionAnalysis": {
    "originalQuery": "${query.replace(/"/g, "'")}",
    "isConditionDescription": <true if user described a condition rather than a procedure name, false otherwise>,
    "identifiedProcedure": "Procedure identified from their description",
    "reasoning": "1-2 sentences explaining why this procedure is appropriate for their condition",
    "alternatives": ["Alternative procedure 1 if applicable", "Alternative procedure 2"]
  },
  "components": [
    {
      "id": "1",
      "name": "Component name (be specific — e.g., 'Titanium Locking Compression Plate' not just 'Hardware')",
      "category": "One of: Professional Services | Facility & OR | Anesthesia | Diagnostics & Imaging | Medical Devices & Implants | Medications & Consumables | Rehabilitation | Follow-up Care",
      "description": "What this charge covers and why it's needed",
      "cptCode": "CPT code if applicable, else empty string",
      "hcpcsCode": "HCPCS L/C code for devices if applicable, else empty string",
      "chargemasterLow": <integer USD — hospital gross list price lower bound>,
      "chargemasterHigh": <integer USD — hospital gross list price upper bound>,
      "insuranceLow": <integer USD — in-network negotiated rate lower bound>,
      "insuranceHigh": <integer USD — in-network negotiated rate upper bound>,
      "cashLow": <integer USD — self-pay cash price lower bound>,
      "cashHigh": <integer USD — self-pay cash price upper bound>,
      "notes": "Key cost driver or important note, or empty string"
    }
  ],
  "chargemasterTotalLow": <sum of all chargemasterLow>,
  "chargemasterTotalHigh": <sum of all chargemasterHigh>,
  "insuranceTotalLow": <sum of all insuranceLow>,
  "insuranceTotalHigh": <sum of all insuranceHigh>,
  "cashTotalLow": <sum of all cashLow>,
  "cashTotalHigh": <sum of all cashHigh>,
  "assumptions": "What insurance type, network status, and clinical scenario these estimates assume",
  "importantNotes": ["3-4 important notes about cost variability, deductibles, etc."]
}

Be thorough. For a surgical case include ALL of: pre-op labs/imaging, anesthesia, OR facility fee, surgeon fee, all implants/hardware individually, medications/blood products, post-op recovery, physical therapy, and follow-up visits. Use realistic current Manhattan market rates.`;

  try {
    const text = await anthropicCall({
      max_tokens: 4096,
      cacheSystemPrompt: true,
      system: systemPrompt,
      messages: [{ role: "user", content: userPrompt }],
    });

    const match = text.match(/\{[\s\S]*\}/);
    if (!match) throw new Error("Could not parse AI response");

    let jsonStr = match[0];
    let breakdown: Omit<ProcedureBreakdown, "coinsurance" | "insurerName">;
    try {
      breakdown = JSON.parse(jsonStr);
    } catch {
      const opens = (jsonStr.match(/[\[{]/g) ?? []).length;
      const closes = (jsonStr.match(/[\]}]/g) ?? []).length;
      let repair = jsonStr.trimEnd().replace(/,\s*$/, "");
      for (let i = closes; i < opens; i++) repair += (repair.endsWith("]") || repair.endsWith("}")) ? "" : '"..."}';
      if (opens > closes) repair += "]".repeat(opens - closes - 1) + "}";
      breakdown = JSON.parse(repair);
    }

    // Enrich components with real DB prices where CPT matches
    const enrichedComponents = await Promise.all(
      breakdown.components.map(async (comp) => {
        if (!comp.cptCode) return comp;
        const procedure = await prisma.procedure.findUnique({
          where: { cptCode: comp.cptCode },
          include: {
            prices: {
              include: { hospital: { select: { name: true } } },
            },
          },
        });
        if (!procedure || procedure.prices.length === 0) return comp;

        const prices = procedure.prices;

        const grossPrices = prices
          .filter((p) => p.priceType === "gross")
          .map((p) => p.priceInCents / 100);

        const cashPrices = prices
          .filter((p) => p.payerType === "cash")
          .map((p) => p.priceInCents / 100);

        const insPrices = prices
          .filter((p) => {
            if (payerType && p.payerType === payerType) return true;
            if (!payerType && p.payerType === "commercial") return true;
            return false;
          })
          .filter((p) => p.priceType === "negotiated" || p.priceType === "discounted")
          .map((p) => p.priceInCents / 100);

        const cheapest = [...prices].sort((a, b) => a.priceInCents - b.priceInCents)[0];

        return {
          ...comp,
          ...(grossPrices.length > 0 && {
            chargemasterLow: Math.round(Math.min(...grossPrices)),
            chargemasterHigh: Math.round(Math.max(...grossPrices)),
          }),
          ...(insPrices.length > 0 && {
            insuranceLow: Math.round(Math.min(...insPrices)),
            insuranceHigh: Math.round(Math.max(...insPrices)),
          }),
          ...(cashPrices.length > 0 && {
            cashLow: Math.round(Math.min(...cashPrices)),
            cashHigh: Math.round(Math.max(...cashPrices)),
          }),
          notes: comp.notes
            ? `${comp.notes} Best price: ${cheapest?.hospital.name}.`
            : `Real charge master data available. Best price: ${cheapest?.hospital.name}.`,
          hasRealData: true,
        };
      })
    );

    const sumField = (field: keyof BreakdownComponent) =>
      enrichedComponents.reduce((s, c) => {
        const v = c[field];
        return s + (typeof v === "number" ? v : 0);
      }, 0);

    const enrichedBreakdown: ProcedureBreakdown = {
      ...breakdown,
      components: enrichedComponents,
      chargemasterTotalLow: sumField("chargemasterLow"),
      chargemasterTotalHigh: sumField("chargemasterHigh"),
      insuranceTotalLow: sumField("insuranceLow") || null,
      insuranceTotalHigh: sumField("insuranceHigh") || null,
      cashTotalLow: sumField("cashLow"),
      cashTotalHigh: sumField("cashHigh"),
      coinsurance,
      insurerName: insurerName ?? null,
    };

    breakdownCache.set(cacheKey, { data: enrichedBreakdown, ts: Date.now() });
    return NextResponse.json(enrichedBreakdown);
  } catch (err) {
    console.error("Breakdown error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to generate breakdown" },
      { status: 500 }
    );
  }
}
