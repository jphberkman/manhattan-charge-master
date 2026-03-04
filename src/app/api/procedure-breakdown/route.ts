import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { anthropicCall } from "@/lib/anthropic-fetch";

export const dynamic = "force-dynamic";

export interface BreakdownComponent {
  id: string;
  name: string;
  category: string;
  description: string;
  cptCode: string;
  estimatedLow: number;
  estimatedHigh: number;
  notes: string;
}

export interface ProcedureBreakdown {
  procedureName: string;
  cptCode: string;
  description: string;
  components: BreakdownComponent[];
  totalEstimateLow: number;
  totalEstimateHigh: number;
  assumptions: string;
  importantNotes: string[];
}

export async function POST(req: NextRequest) {
  const { query } = await req.json();

  if (!query?.trim()) {
    return NextResponse.json({ error: "Query is required" }, { status: 400 });
  }

  // Check if we have any DB prices to enrich the response
  const dbProcedures = await prisma.procedure.findMany({
    select: { cptCode: true, name: true },
    take: 200,
  });
  const dbCptList = dbProcedures.map((p) => `${p.cptCode}: ${p.name}`).join("\n");

  const systemPrompt = `You are a healthcare cost transparency expert specializing in Manhattan hospital pricing. You help patients understand the COMPLETE cost of medical procedures — not just the surgeon's fee, but every service, supply, and associated cost they will encounter.

When given a procedure, you break it down into ALL billable components with realistic Manhattan market pricing.

${dbCptList ? `\nDatabase has prices for these CPT codes:\n${dbCptList}\n\nPrefer using these CPT codes when they match a component.` : ""}

Always respond with ONLY valid JSON — no markdown fences, no explanation.`;

  const userPrompt = `Patient query: "${query}"

Return a complete cost breakdown as JSON with this exact structure:
{
  "procedureName": "Full official name of the procedure",
  "cptCode": "primary CPT code",
  "description": "1-2 sentence plain-language description of what this procedure involves",
  "components": [
    {
      "id": "1",
      "name": "Component name (e.g. Orthopedic Surgeon Fee)",
      "category": "One of: Professional Services | Facility & OR | Anesthesia | Diagnostics & Imaging | Medications & Supplies | Rehabilitation | Follow-up Care",
      "description": "What this charge covers",
      "cptCode": "CPT code if applicable, else empty string",
      "estimatedLow": <integer USD, Manhattan in-network commercial>,
      "estimatedHigh": <integer USD, Manhattan in-network commercial>,
      "notes": "Brief note about what affects this cost, or empty string"
    }
  ],
  "totalEstimateLow": <sum of all estimatedLow>,
  "totalEstimateHigh": <sum of all estimatedHigh>,
  "assumptions": "1-2 sentences about what these estimates assume (insurance type, in-network, etc.)",
  "importantNotes": ["note 1", "note 2", "note 3"]
}

Include ALL realistic billable components for Manhattan hospitals. Be thorough — include pre-op tests, imaging, anesthesia, facility fees, implants/supplies, medications, post-op care, and follow-up visits if applicable. Use realistic current Manhattan market rates.`;

  try {
    const text = await anthropicCall({
      max_tokens: 4096,
      system: systemPrompt,
      messages: [{ role: "user", content: userPrompt }],
    });

    const match = text.match(/\{[\s\S]*\}/);
    if (!match) throw new Error("Could not parse AI response");

    // Attempt to recover truncated JSON by closing open structures
    let jsonStr = match[0];
    let breakdown: ProcedureBreakdown;
    try {
      breakdown = JSON.parse(jsonStr);
    } catch {
      // Close any unclosed arrays/objects caused by truncation
      const opens = (jsonStr.match(/[\[{]/g) ?? []).length;
      const closes = (jsonStr.match(/[\]}]/g) ?? []).length;
      let repair = jsonStr.trimEnd().replace(/,\s*$/, "");
      for (let i = closes; i < opens; i++) repair += (repair.endsWith("]") || repair.endsWith("}")) ? "" : '"..."}';
      if (opens > closes) repair += "]".repeat(opens - closes - 1) + "}";
      breakdown = JSON.parse(repair);
    }

    // Enrich components that have a matching CPT in the DB with real prices
    const enrichedComponents = await Promise.all(
      breakdown.components.map(async (comp) => {
        if (!comp.cptCode) return comp;
        const procedure = await prisma.procedure.findUnique({
          where: { cptCode: comp.cptCode },
          include: {
            prices: {
              orderBy: { priceInCents: "asc" },
              take: 20,
              include: { hospital: { select: { name: true } } },
            },
          },
        });
        if (!procedure || procedure.prices.length === 0) return comp;

        const usdPrices = procedure.prices.map((p) => p.priceInCents / 100);
        const dbLow = Math.min(...usdPrices);
        const dbHigh = Math.max(...usdPrices);
        const cheapestHospital = procedure.prices[0].hospital.name;

        return {
          ...comp,
          estimatedLow: Math.round(dbLow),
          estimatedHigh: Math.round(dbHigh),
          notes: comp.notes
            ? `${comp.notes} Best price: ${cheapestHospital}.`
            : `Based on real data. Best price: ${cheapestHospital}.`,
          hasRealData: true,
        };
      })
    );

    const enrichedBreakdown = {
      ...breakdown,
      components: enrichedComponents,
      totalEstimateLow: enrichedComponents.reduce((s, c) => s + c.estimatedLow, 0),
      totalEstimateHigh: enrichedComponents.reduce((s, c) => s + c.estimatedHigh, 0),
    };

    return NextResponse.json(enrichedBreakdown);
  } catch (err) {
    console.error("Breakdown error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to generate breakdown" },
      { status: 500 }
    );
  }
}
