import { NextRequest, NextResponse } from "next/server";
import { anthropicCall } from "@/lib/anthropic-fetch";
import type { HospitalComparisonEntry } from "@/app/api/hospitals/compare/route";

export const dynamic = "force-dynamic";

export interface PhysicianHospital {
  hospitalName: string;
  hospitalId: string;
  yourCost: number | null;
  cashPrice: number | null;
  isLowestCost: boolean;
}

export interface PhysicianRecommendation {
  name: string;
  credentials: string;
  specialty: string;
  highlights: string[];
  hospitals: PhysicianHospital[];
  cheapestHospital: PhysicianHospital | null;
  whyRecommended: string;
}

// Short display names for the hospital cards
const SHORT_NAMES: Record<string, string> = {
  "nyu-langone":      "NYU Langone",
  "nyu-orthopedic":   "NYU Langone Orthopedic",
  "nyp-cornell":      "NYP / Weill Cornell",
  "nyp-columbia":     "NYP / Columbia",
  "mount-sinai":      "Mount Sinai",
  "mount-sinai-west": "Mount Sinai West",
  "msk":              "Memorial Sloan Kettering",
  "lenox-hill":       "Lenox Hill (Northwell)",
  "hss":              "Hospital for Special Surgery",
  "bellevue":         "Bellevue Hospital",
};

export async function POST(req: NextRequest) {
  const {
    procedureName,
    cptCode,
    insurerName,
    payerType,
    coinsurance = 0.20,
    hospitalPrices = [] as HospitalComparisonEntry[],
  } = await req.json();

  if (!procedureName) {
    return NextResponse.json({ error: "procedureName is required" }, { status: 400 });
  }

  // Build a lookup map from hospital id → prices (from the real comparison data)
  const priceMap = new Map<string, { yourCost: number | null; cashPrice: number | null }>();
  for (const entry of hospitalPrices as HospitalComparisonEntry[]) {
    priceMap.set(entry.hospital.id, {
      yourCost: entry.patientCost ?? null,
      cashPrice: entry.cashPrice ?? null,
    });
  }

  // Summarise available hospitals + prices for the AI prompt
  const priceList = (hospitalPrices as HospitalComparisonEntry[])
    .sort((a, b) => (a.patientCost ?? a.cashPrice ?? 0) - (b.patientCost ?? b.cashPrice ?? 0))
    .map((e) => {
      const yourCost = e.patientCost != null ? `$${e.patientCost.toLocaleString()} (your cost)` : null;
      const cash = e.cashPrice != null ? `$${e.cashPrice.toLocaleString()} cash` : null;
      const prices = [yourCost, cash].filter(Boolean).join(" / ");
      return `- ${e.hospital.name} [id: ${e.hospital.id}]: ${prices || "price unknown"}`;
    })
    .join("\n");

  const insurerContext = insurerName
    ? `Patient has ${insurerName} (${payerType ?? "commercial"}) insurance with ${Math.round(coinsurance * 100)}% coinsurance.`
    : `No specific insurer. Generic commercial insurance, ${Math.round(coinsurance * 100)}% coinsurance.`;

  try {
    const text = await anthropicCall({
      max_tokens: 2000,
      system: `You are an expert in Manhattan healthcare who knows the top surgeons and specialists at every major hospital. Help patients find the best doctors for their specific procedure. Return ONLY valid JSON — no markdown.`,
      messages: [{
        role: "user",
        content: `Recommend the top 3 physicians in Manhattan for: "${procedureName}" (CPT ${cptCode ?? "unknown"}).

${insurerContext}

Here are the EXACT hospital prices already calculated for this procedure. You MUST use these exact prices — do not invent or modify them:
${priceList || "(No price data available yet — omit cost fields)"}

For each physician, pick 2–3 hospitals from the list above where they actually practice. Use the EXACT prices from the list for those hospitals.

Return JSON:
{
  "physicians": [
    {
      "name": "Dr. First Last",
      "credentials": "MD, FACS",
      "specialty": "Subspecialty name",
      "highlights": ["High-volume: 300+ procedures/year", "Fellowship-trained at HSS", "Board certified"],
      "whyRecommended": "One plain-English sentence on why this doctor stands out for this procedure.",
      "hospitals": [
        {
          "hospitalId": "<id from list above>",
          "hospitalName": "<name from list above>"
        }
      ]
    }
  ]
}

Guidelines:
- Pick real or highly plausible well-known surgeons/specialists practicing in Manhattan
- Vary the hospitals across the 3 physicians so patients can see options at different price points
- Include at least one physician at a lower-cost hospital (Bellevue, Mount Sinai West) if relevant
- HSS and NYU Orthopedic are top-tier for musculoskeletal; MSK for oncology; NYP/Columbia for complex cases`,
      }],
    });

    const match = text.match(/\{[\s\S]*\}/);
    if (!match) throw new Error("Could not parse AI response");

    const parsed = JSON.parse(match[0]) as {
      physicians: Array<{
        name: string;
        credentials: string;
        specialty: string;
        highlights: string[];
        whyRecommended: string;
        hospitals: Array<{ hospitalId: string; hospitalName: string }>;
      }>;
    };

    // Merge AI physician data with real prices from priceMap
    const physicians: PhysicianRecommendation[] = parsed.physicians.map((doc) => {
      const hospitals: PhysicianHospital[] = doc.hospitals.map((h) => {
        const prices = priceMap.get(h.hospitalId);
        return {
          hospitalName: SHORT_NAMES[h.hospitalId] ?? h.hospitalName,
          hospitalId: h.hospitalId,
          yourCost: prices?.yourCost ?? null,
          cashPrice: prices?.cashPrice ?? null,
          isLowestCost: false,
        };
      });

      // Mark cheapest
      const sorted = [...hospitals].sort(
        (a, b) => (a.yourCost ?? a.cashPrice ?? Infinity) - (b.yourCost ?? b.cashPrice ?? Infinity)
      );
      const cheapest = sorted[0] ?? null;
      const withCost = hospitals.map((h) => ({
        ...h,
        isLowestCost: cheapest ? h.hospitalId === cheapest.hospitalId : false,
      }));

      return {
        name: doc.name,
        credentials: doc.credentials,
        specialty: doc.specialty,
        highlights: doc.highlights,
        whyRecommended: doc.whyRecommended,
        hospitals: withCost,
        cheapestHospital: cheapest,
      };
    });

    return NextResponse.json({ physicians });
  } catch (err) {
    console.error("Physician recommend error:", err);
    return NextResponse.json({ error: "Failed to generate recommendations" }, { status: 500 });
  }
}
