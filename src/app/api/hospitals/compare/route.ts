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

// All major Manhattan hospitals — used as the comparison universe
const MANHATTAN_HOSPITALS = [
  { id: "nyu-langone",      name: "NYU Langone Health (Tisch Hospital)",           address: "550 1st Ave, New York, NY 10016" },
  { id: "nyu-orthopedic",   name: "NYU Langone Orthopedic Hospital",               address: "301 E 17th St, New York, NY 10003" },
  { id: "nyp-cornell",      name: "NewYork-Presbyterian / Weill Cornell",          address: "525 E 68th St, New York, NY 10065" },
  { id: "nyp-columbia",     name: "NYP / Columbia University Irving Medical Center", address: "622 W 168th St, New York, NY 10032" },
  { id: "mount-sinai",      name: "The Mount Sinai Hospital",                      address: "One Gustave L. Levy Pl, New York, NY 10029" },
  { id: "mount-sinai-west", name: "Mount Sinai West",                              address: "1000 10th Ave, New York, NY 10019" },
  { id: "msk",              name: "Memorial Sloan Kettering Cancer Center",        address: "1275 York Ave, New York, NY 10065" },
  { id: "lenox-hill",       name: "Lenox Hill Hospital (Northwell)",               address: "100 E 77th St, New York, NY 10075" },
  { id: "hss",              name: "Hospital for Special Surgery",                  address: "535 E 70th St, New York, NY 10021" },
  { id: "bellevue",         name: "Bellevue Hospital Center",                      address: "462 1st Ave, New York, NY 10016" },
];

// Map DB hospital names to canonical list ids (only exact/known matches)
const DB_NAME_TO_CANONICAL: Record<string, string> = {
  "nyu langone health (tisch hospital)": "nyu-langone",
  "nyu langone health":                  "nyu-langone",
  "nyu langone orthopedic hospital":     "nyu-orthopedic",
  "bellevue hospital center":            "bellevue",
  "memorial sloan kettering cancer center": "msk",
  "mount sinai hospital":                "mount-sinai",
  "the mount sinai hospital":            "mount-sinai",
};

// Sanity-check: minimum believable price for a full procedure (filters fee-schedule fragments)
const MIN_PROCEDURE_PRICE = 500;

function median(arr: number[]): number {
  if (!arr.length) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const cptCode = searchParams.get("cptCode");
  const payerType = searchParams.get("payerType");
  const payerName = searchParams.get("payerName");
  const coinsurance = parseFloat(searchParams.get("coinsurance") ?? "0.20");

  if (!cptCode) {
    return NextResponse.json({ error: "cptCode is required" }, { status: 400 });
  }

  // 1. Look up the procedure (optional — AI fallback works without it)
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

  // 3. Build per-canonical-hospital map from DB data
  type HospMap = {
    hospital: { id: string; name: string; address: string };
    grossPrices: number[];
    cashPrices: number[];
    insPrices: number[];
    insPayerName: string | null;
  };

  const hospMap = new Map<string, HospMap>();

  for (const e of dbEntries) {
    const price = e.priceInCents / 100;
    if (price < MIN_PROCEDURE_PRICE) continue; // filter out fee-schedule fragments

    // Map to canonical hospital id
    const canonicalId =
      DB_NAME_TO_CANONICAL[e.hospital.name.toLowerCase()] ?? null;

    // Use canonical id if available, else hospital's own DB id
    const key = canonicalId ?? e.hospital.id;
    const canonicalHosp = canonicalId
      ? MANHATTAN_HOSPITALS.find((h) => h.id === canonicalId) ?? e.hospital
      : e.hospital;

    if (!hospMap.has(key)) {
      hospMap.set(key, {
        hospital: { id: key, name: canonicalHosp.name, address: canonicalHosp.address },
        grossPrices: [],
        cashPrices: [],
        insPrices: [],
        insPayerName: null,
      });
    }
    const h = hospMap.get(key)!;

    if (e.priceType === "gross") h.grossPrices.push(price);
    if (e.payerType === "cash") h.cashPrices.push(price);

    if (payerType) {
      if (e.payerType === payerType && (e.priceType === "negotiated" || e.priceType === "discounted")) {
        const nameMatch = !payerName || e.payerName.toLowerCase().includes(payerName.split(" ")[0].toLowerCase());
        if (nameMatch) {
          h.insPrices.push(price);
          if (!h.insPayerName) h.insPayerName = e.payerName;
        }
      }
      // Broader: any negotiated rate for that payer type if no name match found
      if (h.insPrices.length === 0 && e.payerType === payerType && (e.priceType === "negotiated" || e.priceType === "discounted")) {
        h.insPrices.push(price);
        if (!h.insPayerName) h.insPayerName = e.payerName;
      }
    } else {
      // No insurer selected — use commercial negotiated rates
      if (e.payerType === "commercial" && (e.priceType === "negotiated" || e.priceType === "discounted")) {
        h.insPrices.push(price);
        if (!h.insPayerName) h.insPayerName = e.payerName;
      }
    }
  }

  // 4. Convert to comparison entries from real DB data
  //    Use median to avoid outliers, with a reasonable floor
  const realEntries: Omit<HospitalComparisonEntry, "rank">[] = [];
  const coveredIds = new Set<string>();

  for (const h of hospMap.values()) {
    // Need at least insurance OR cash data (both meaningful)
    const insuranceRate = h.insPrices.length >= 2
      ? Math.round(median(h.insPrices))
      : h.insPrices.length === 1
      ? Math.round(h.insPrices[0])
      : null;

    const cashPrice = h.cashPrices.length >= 2
      ? Math.round(median(h.cashPrices))
      : h.cashPrices.length === 1
      ? Math.round(h.cashPrices[0])
      : null;

    const chargemasterPrice = h.grossPrices.length >= 2
      ? Math.round(Math.max(...h.grossPrices))
      : h.grossPrices.length === 1
      ? Math.round(h.grossPrices[0])
      : null;

    // Skip if both are null — no usable data
    if (insuranceRate == null && cashPrice == null) continue;

    // Fill in missing prices with calibrated estimates
    const effectiveInsuranceRate = insuranceRate ?? (cashPrice != null ? Math.round(cashPrice * 0.82) : null);
    const effectiveCashPrice = cashPrice ?? (insuranceRate != null ? Math.round(insuranceRate * 1.22) : null);

    const patientCost = effectiveInsuranceRate !== null ? Math.round(effectiveInsuranceRate * coinsurance) : null;
    const insurerPays = effectiveInsuranceRate !== null ? Math.round(effectiveInsuranceRate * (1 - coinsurance)) : null;

    realEntries.push({
      hospital: h.hospital,
      chargemasterPrice,
      insuranceRate: effectiveInsuranceRate,
      patientCost,
      insurerPays,
      cashPrice: effectiveCashPrice,
      payerName: h.insPayerName,
      isAiEstimate: false,
    });
    coveredIds.add(h.hospital.id);
  }

  // 5. AI fallback — estimate for all hospitals not covered by real DB data
  //    (Always runs — does NOT require procedure to exist in DB)
  const missingHospitals = MANHATTAN_HOSPITALS.filter((h) => !coveredIds.has(h.id));

  let aiEntries: Omit<HospitalComparisonEntry, "rank">[] = [];

  if (missingHospitals.length > 0) {
    const procName = procedure?.name ?? `procedure for CPT ${cptCode}`;
    const effectivePayerType = payerType ?? "commercial";
    const payerDesc = payerName
      ? `${payerName} (${effectivePayerType})`
      : `typical ${effectivePayerType} insurance`;

    try {
      const aiText = await anthropicCall({
        max_tokens: 1500,
        system: `You are an expert in Manhattan hospital pricing and healthcare cost transparency. You have deep knowledge of NYC hospital chargemasters, CMS data, and negotiated insurance rates for 2024-2025. Return ONLY valid JSON — no markdown, no commentary.`,
        messages: [{
          role: "user",
          content: `Provide realistic, shoppable ALL-IN episode-of-care pricing for CPT ${cptCode} (${procName}) at these Manhattan hospitals:

${missingHospitals.map((h, i) => `${i}: ${h.name}`).join("\n")}

Insurance context: The patient has ${payerDesc}.

IMPORTANT GUIDELINES:
- Prices must reflect the COMPLETE episode of care (facility + professional fees bundled), not just a fee-schedule line item
- chargemasterPrice = hospital's gross/list price before any discounts (typically 3-6× negotiated)
- insuranceRate = the in-network negotiated rate this hospital accepts from ${payerDesc}
- cashPrice = self-pay / uninsured price (typically 15-30% above negotiated, but well below chargemaster)
- Use realistic 2024-2025 Manhattan market data — do not underestimate
- HSS and NYP/Cornell typically charge 10-20% more than average; Bellevue charges 20-30% less
- Major academic centers (Columbia, Weill Cornell, Mount Sinai) are premium-priced
- Specialty centers (HSS for ortho, MSK for oncology) command premium rates

Return a JSON array:
[
  {
    "hospitalIndex": <0-based index from list above>,
    "chargemasterPrice": <integer USD>,
    "insuranceRate": <integer USD in-network negotiated, or null if truly cash-only context>,
    "cashPrice": <integer USD self-pay>
  }
]`,
        }],
      });

      const match = aiText.match(/\[[\s\S]*\]/);
      if (match) {
        const aiData: Array<{
          hospitalIndex: number;
          chargemasterPrice: number;
          insuranceRate: number | null;
          cashPrice: number;
        }> = JSON.parse(match[0]);

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
            payerName: payerName ?? (payerType ? `${payerType} insurance` : null),
            isAiEstimate: true,
          }];
        });
      }
    } catch (err) {
      console.error("AI hospital estimate failed:", err);
    }
  }

  // 6. Merge real + AI, rank by patient cost (or cash if no insurance)
  const allEntries = [...realEntries, ...aiEntries];

  const sortValue = (e: Omit<HospitalComparisonEntry, "rank">) =>
    e.patientCost ?? e.cashPrice ?? Infinity;

  allEntries.sort((a, b) => sortValue(a) - sortValue(b));

  const ranked: HospitalComparisonEntry[] = allEntries.map((e, i) => ({ ...e, rank: i + 1 }));

  return NextResponse.json(ranked);
}
