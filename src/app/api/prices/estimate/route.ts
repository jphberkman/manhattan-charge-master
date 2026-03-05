import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { anthropicCall } from "@/lib/anthropic-fetch";
import type { PriceApiEntry } from "@/lib/price-transparency/types";

export const dynamic = "force-dynamic";

const MANHATTAN_HOSPITALS = [
  { id: "est-nyu", name: "NYU Langone Medical Center", address: "550 1st Ave, New York, NY 10016" },
  { id: "est-nyp", name: "NewYork-Presbyterian Hospital", address: "525 E 68th St, New York, NY 10065" },
  { id: "est-msh", name: "Mount Sinai Hospital", address: "1 Gustave L. Levy Pl, New York, NY 10029" },
  { id: "est-lh", name: "Lenox Hill Hospital", address: "100 E 77th St, New York, NY 10075" },
  { id: "est-hss", name: "Hospital for Special Surgery", address: "535 E 70th St, New York, NY 10021" },
  { id: "est-bel", name: "Bellevue Hospital Center", address: "462 1st Ave, New York, NY 10016" },
  { id: "est-har", name: "Harlem Hospital Center", address: "506 Lenox Ave, New York, NY 10037" },
  { id: "est-col", name: "Columbia University Medical Center", address: "622 W 168th St, New York, NY 10032" },
];

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const procedureId = searchParams.get("procedureId");
  const payerType = searchParams.get("payerType") ?? "all";

  if (!procedureId) {
    return NextResponse.json({ error: "procedureId is required" }, { status: 400 });
  }

  const procedure = await prisma.procedure.findUnique({
    where: { id: procedureId },
    select: { cptCode: true, name: true, category: true },
  });

  if (!procedure) {
    return NextResponse.json({ error: "Procedure not found" }, { status: 404 });
  }

  const payerLabel =
    payerType === "all" ? "negotiated (commercial insurance)" : payerType;

  const prompt = `You are a healthcare pricing analyst with expertise in Manhattan hospital costs.

Provide realistic estimated prices for the following procedure at 8 Manhattan hospitals.

Procedure: ${procedure.name} (CPT ${procedure.cptCode})
Category: ${procedure.category}
Payer type: ${payerLabel}

Return ONLY a JSON array with exactly this shape (no explanation, no markdown):
[
  { "hospitalIndex": 0, "priceUsd": 12500, "priceType": "negotiated" },
  ...
]

hospitalIndex maps to:
${MANHATTAN_HOSPITALS.map((h, i) => `  ${i}: ${h.name}`).join("\n")}

Rules:
- priceUsd must be a realistic integer in USD (no decimals)
- Use actual market knowledge for NYC hospital pricing; vary prices meaningfully across hospitals
- priceType must be one of: gross, negotiated, discounted, min, max
- For payer type "${payerLabel}", use appropriate rate levels (cash < negotiated < gross)
- Teaching/academic hospitals (NYP, Columbia, NYU, HSS) tend to have higher gross but competitive negotiated rates
- Safety-net hospitals (Bellevue, Harlem) tend to have lower rates`;

  try {
    const text = await anthropicCall({
      max_tokens: 512,
      messages: [{ role: "user", content: prompt }],
    });

    // Extract JSON array from response (handle any surrounding text)
    const match = text.match(/\[[\s\S]*\]/);
    if (!match) throw new Error("Could not parse AI response");

    const estimates: { hospitalIndex: number; priceUsd: number; priceType: string }[] =
      JSON.parse(match[0]);

    const entries: (PriceApiEntry & { source: "ai-estimate" })[] = estimates
      .filter((e) => e.hospitalIndex >= 0 && e.hospitalIndex < MANHATTAN_HOSPITALS.length)
      .map((e) => {
        const hospital = MANHATTAN_HOSPITALS[e.hospitalIndex];
        return {
          id: `ai-${hospital.id}-${procedureId}`,
          hospital: { id: hospital.id, name: hospital.name, address: hospital.address },
          payerName: payerLabel,
          payerType: (payerType === "all" ? "commercial" : payerType) as any,
          priceUsd: e.priceUsd,
          priceType: e.priceType as any,
          source: "ai-estimate" as const,
        };
      })
      .sort((a, b) => a.priceUsd - b.priceUsd);

    return NextResponse.json(entries);
  } catch (err) {
    console.error("AI estimate error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to generate estimates" },
      { status: 500 }
    );
  }
}
