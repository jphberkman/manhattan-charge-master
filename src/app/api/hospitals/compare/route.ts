import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { anthropicCall } from "@/lib/anthropic-fetch";

export const dynamic = "force-dynamic";

export interface HospitalComparisonEntry {
  hospital: { id: string; name: string; address: string };
  chargemasterPrice: number | null;
  insuranceRate: number | null;
  patientCost: number | null;       // insuranceRate × coinsurance
  insurerPays: number | null;       // insuranceRate × (1 - coinsurance)
  cashPrice: number | null;
  payerName: string | null;
  isAiEstimate: boolean;
  rank: number;
}

// Major Manhattan hospitals for AI estimation fallback
const MANHATTAN_HOSPITALS = [
  { id: "nyu-langone", name: "NYU Langone Health", address: "550 1st Ave, New York, NY 10016" },
  { id: "nyp-cornell", name: "NewYork-Presbyterian / Weill Cornell", address: "525 E 68th St, New York, NY 10065" },
  { id: "mount-sinai", name: "The Mount Sinai Hospital", address: "One Gustave L. Levy Pl, New York, NY 10029" },
  { id: "msk", name: "Memorial Sloan Kettering Cancer Center", address: "1275 York Ave, New York, NY 10065" },
  { id: "lenox-hill", name: "Lenox Hill Hospital (Northwell)", address: "100 E 77th St, New York, NY 10075" },
  { id: "hss", name: "Hospital for Special Surgery", address: "535 E 70th St, New York, NY 10021" },
  { id: "columbia", name: "NYP / Columbia University Irving Medical Center", address: "622 W 168th St, New York, NY 10032" },
  { id: "bellevue", name: "Bellevue Hospital Center", address: "462 1st Ave, New York, NY 10016" },
];

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const cptCode = searchParams.get("cptCode");
  const payerType = searchParams.get("payerType");
  const payerName = searchParams.get("payerName");
  const coinsurance = parseFloat(searchParams.get("coinsurance") ?? "0.20");

  if (!cptCode) {
    return NextResponse.json({ error: "cptCode is required" }, { status: 400 });
  }

  // 1. Look up the procedure
  const procedure = await prisma.procedure.findUnique({ where: { cptCode } });

  // 2. Fetch DB price entries if procedure exists
  type PriceRow = {
    hospital: { id: string; name: string; address: string };
    payerName: string;
    payerType: string;
    priceInCents: number;
    priceType: string;
  };

  let dbEntries: PriceRow[] = [];
  if (procedure) {
    dbEntries = await prisma.priceEntry.findMany({
      where: { procedureId: procedure.id },
      include: { hospital: { select: { id: true, name: true, address: true } } },
    });
  }

  // 3. Build per-hospital map from DB data
  type HospMap = {
    hospital: { id: string; name: string; address: string };
    grossPrices: number[];
    cashPrices: number[];
    insPrices: number[];
    insPayerName: string | null;
  };

  const hospMap = new Map<string, HospMap>();
  for (const e of dbEntries) {
    const hid = e.hospital.id;
    if (!hospMap.has(hid)) {
      hospMap.set(hid, { hospital: e.hospital, grossPrices: [], cashPrices: [], insPrices: [], insPayerName: null });
    }
    const h = hospMap.get(hid)!;
    if (e.priceType === "gross") h.grossPrices.push(e.priceInCents / 100);
    if (e.payerType === "cash") h.cashPrices.push(e.priceInCents / 100);
    if (payerType && e.payerType === payerType && (e.priceType === "negotiated" || e.priceType === "discounted")) {
      const nameMatch = !payerName || e.payerName.toLowerCase().includes(payerName.split(" ")[0].toLowerCase());
      if (nameMatch) {
        h.insPrices.push(e.priceInCents / 100);
        if (!h.insPayerName) h.insPayerName = e.payerName;
      }
    }
    // If no specific insurer filter, grab any commercial negotiated rate
    if (!payerType && e.payerType === "commercial" && (e.priceType === "negotiated" || e.priceType === "discounted")) {
      h.insPrices.push(e.priceInCents / 100);
      if (!h.insPayerName) h.insPayerName = e.payerName;
    }
  }

  // 4. Convert to comparison entries from real DB data
  const realEntries: Omit<HospitalComparisonEntry, "rank">[] = [];
  for (const h of hospMap.values()) {
    const chargemasterPrice = h.grossPrices.length ? Math.min(...h.grossPrices) : null;
    const insuranceRate = h.insPrices.length ? Math.min(...h.insPrices) : null;
    const cashPrice = h.cashPrices.length ? Math.min(...h.cashPrices) : null;
    const patientCost = insuranceRate !== null ? Math.round(insuranceRate * coinsurance) : null;
    const insurerPays = insuranceRate !== null ? Math.round(insuranceRate * (1 - coinsurance)) : null;

    realEntries.push({
      hospital: h.hospital,
      chargemasterPrice,
      insuranceRate,
      patientCost,
      insurerPays,
      cashPrice,
      payerName: h.insPayerName,
      isAiEstimate: false,
    });
  }

  // 5. AI fallback — estimate for hospitals not in DB
  const existingNames = new Set(realEntries.map((e) => e.hospital.name.toLowerCase()));
  const missingHospitals = MANHATTAN_HOSPITALS.filter(
    (h) => !existingNames.has(h.name.toLowerCase())
  );

  let aiEntries: Omit<HospitalComparisonEntry, "rank">[] = [];
  if (missingHospitals.length > 0 && procedure) {
    try {
      const aiText = await anthropicCall({
        max_tokens: 1024,
        system: "You are a Manhattan hospital pricing expert. Return ONLY valid JSON, no markdown.",
        messages: [{
          role: "user",
          content: `For CPT code ${cptCode} (${procedure.name}), estimate realistic current Manhattan pricing for these hospitals:
${missingHospitals.map((h, i) => `${i}: ${h.name}`).join("\n")}

${payerType ? `The patient has ${payerName ?? ""} ${payerType} insurance. Provide insurance negotiated rates.` : ""}

Return JSON array:
[
  {
    "hospitalIndex": 0,
    "chargemasterPrice": <integer USD gross/list price>,
    "insuranceRate": <integer USD in-network negotiated rate, or null if cash/no-insurance>,
    "cashPrice": <integer USD self-pay price>
  }
]

Base estimates on realistic 2024-2025 Manhattan market rates. Chargemaster is typically 3-5× the negotiated rate.`
        }],
      });

      const match = aiText.match(/\[[\s\S]*\]/);
      if (match) {
        const aiData: Array<{ hospitalIndex: number; chargemasterPrice: number; insuranceRate: number | null; cashPrice: number }> = JSON.parse(match[0]);
        aiEntries = aiData.flatMap((item): Omit<HospitalComparisonEntry, "rank">[] => {
          const hosp = missingHospitals[item.hospitalIndex];
          if (!hosp) return [];
          const insuranceRate = item.insuranceRate ?? null;
          const patientCost = insuranceRate !== null ? Math.round(insuranceRate * coinsurance) : null;
          const insurerPays = insuranceRate !== null ? Math.round(insuranceRate * (1 - coinsurance)) : null;
          return [{
            hospital: { id: hosp.id, name: hosp.name, address: hosp.address },
            chargemasterPrice: item.chargemasterPrice,
            insuranceRate,
            patientCost,
            insurerPays,
            cashPrice: item.cashPrice,
            payerName: payerName ?? (payerType ?? null),
            isAiEstimate: true,
          }];
        });
      }
    } catch (err) {
      console.error("AI hospital estimate failed:", err);
    }
  }

  // 6. Merge and rank — prefer real data over AI
  const allEntries = [...realEntries, ...aiEntries];

  // Sort by patient cost (insurance path), then cash as fallback
  const sortValue = (e: Omit<HospitalComparisonEntry, "rank">) =>
    e.patientCost ?? e.cashPrice ?? Infinity;

  allEntries.sort((a, b) => sortValue(a) - sortValue(b));

  const ranked: HospitalComparisonEntry[] = allEntries.map((e, i) => ({ ...e, rank: i + 1 }));

  return NextResponse.json(ranked);
}
