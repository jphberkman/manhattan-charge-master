import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { anthropicCall } from "@/lib/anthropic-fetch";
import { redis } from "@/lib/redis";
import { getBestMedicareBenchmark } from "@/lib/medicare";
import type { MedicareBenchmark } from "@/lib/medicare";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// ── Types ──────────────────────────────────────────────────────────────────────

export interface HospitalComparisonEntry {
  hospital: { id: string; name: string; address: string };
  chargemasterPrice: number | null;
  insuranceRate: number | null;
  patientCost: number | null;
  insurerPays: number | null;
  cashPrice: number | null;
  payerName: string | null;
  /**
   * "real"      — both negotiated and cash come directly from the chargemaster DB.
   * "partial"   — only one price type (ins or cash) found in the DB.
   * "estimated" — no DB record; AI-generated estimate.
   */
  dataQuality: "real" | "partial" | "estimated";
  /** Backward-compat alias for dataQuality === "estimated". */
  isAiEstimate: boolean;
  /** ISO date string of when this hospital's data was last uploaded. */
  dataLastUpdated: string | null;
  /**
   * "episode"   — price represents the full episode of care (facility + professional + ancillary).
   * "line-item" — price is a single fee-schedule line item (e.g. surgeon fee only); scaled to episode.
   * "unknown"   — scope cannot be determined from available data.
   */
  priceScope: "episode" | "line-item" | "unknown";
  rank: number;
}

export interface CompareResponse {
  entries: HospitalComparisonEntry[];
  medicare: MedicareBenchmark | null;
}

// ── Constants ─────────────────────────────────────────────────────────────────

/** All major Manhattan hospitals — the fixed comparison universe. */
const MANHATTAN_HOSPITALS = [
  { id: "nyu-langone",      name: "NYU Langone Health (Tisch Hospital)",              address: "550 1st Ave, New York, NY 10016" },
  { id: "nyu-orthopedic",   name: "NYU Langone Orthopedic Hospital",                  address: "301 E 17th St, New York, NY 10003" },
  { id: "nyp-cornell",      name: "NewYork-Presbyterian / Weill Cornell",             address: "525 E 68th St, New York, NY 10065" },
  { id: "nyp-columbia",     name: "NYP / Columbia University Irving Medical Center",  address: "622 W 168th St, New York, NY 10032" },
  { id: "mount-sinai",      name: "The Mount Sinai Hospital",                         address: "One Gustave L. Levy Pl, New York, NY 10029" },
  { id: "mount-sinai-west", name: "Mount Sinai West",                                 address: "1000 10th Ave, New York, NY 10019" },
  { id: "msk",              name: "Memorial Sloan Kettering Cancer Center",           address: "1275 York Ave, New York, NY 10065" },
  { id: "lenox-hill",       name: "Lenox Hill Hospital (Northwell)",                  address: "100 E 77th St, New York, NY 10075" },
  { id: "hss",              name: "Hospital for Special Surgery",                     address: "535 E 70th St, New York, NY 10021" },
  { id: "bellevue",         name: "Bellevue Hospital Center",                         address: "462 1st Ave, New York, NY 10016" },
] as const;

/** Maps DB hospital names (lowercased) to canonical IDs. Handles exact, partial, and pipe-separated names. */
const DB_NAME_TO_CANONICAL: Record<string, string> = {
  // NYU Langone
  "nyu langone health (tisch hospital)":                      "nyu-langone",
  "nyu langone health":                                       "nyu-langone",
  "nyu langone":                                              "nyu-langone",
  "nyu langone orthopedic hospital":                          "nyu-orthopedic",
  "nyu langone orthopedic":                                   "nyu-orthopedic",
  // NYP / Weill Cornell
  "newyork-presbyterian weill cornell medical center":        "nyp-cornell",
  "new york-presbyterian weill cornell":                      "nyp-cornell",
  "nyp weill cornell":                                        "nyp-cornell",
  "weill cornell":                                            "nyp-cornell",
  // NYP / Columbia
  "newyork-presbyterian columbia university irving medical center": "nyp-columbia",
  "nyp columbia":                                             "nyp-columbia",
  "columbia university irving medical center":                "nyp-columbia",
  // Mount Sinai
  "the mount sinai hospital":                                 "mount-sinai",
  "mount sinai hospital":                                     "mount-sinai",
  "mount sinai":                                              "mount-sinai",
  "mount sinai morningside":                                  "mount-sinai-west",
  "mount sinai west":                                         "mount-sinai-west",
  // MSK
  "memorial sloan kettering cancer center":                   "msk",
  "memorial sloan-kettering":                                 "msk",
  "msk":                                                      "msk",
  // HSS
  "hospital for special surgery":                             "hss",
  "hss":                                                      "hss",
  // Lenox Hill / Northwell
  "lenox hill hospital":                                      "lenox-hill",
  "lenox hill hospital (northwell)":                          "lenox-hill",
  "northwell lenox hill":                                     "lenox-hill",
  // Bellevue / NYC H+H
  "bellevue hospital center":                                 "bellevue",
  "bellevue hospital":                                        "bellevue",
  "nyc health + hospitals":                                   "bellevue",
  "nyc health and hospitals":                                 "bellevue",
  "new york city health and hospitals":                       "bellevue",
};

/**
 * Minimum believable price to include a DB entry in hospital comparison.
 * Filters out tiny fee-schedule fragments (e.g. a $12 lab add-on code).
 * Note: legitimate line items like $3–5K surgeon fees still pass through —
 * those are handled by the episode-anchor calibration below.
 */
const MIN_PROCEDURE_PRICE = 100;

// ── Helpers ───────────────────────────────────────────────────────────────────

function median(arr: number[]): number {
  if (!arr.length) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

/** Resolves a raw DB hospital name to a canonical ID. Handles pipe-separated compound names. */
function resolveCanonicalId(rawName: string): string | null {
  const lower = rawName.toLowerCase().trim();

  if (DB_NAME_TO_CANONICAL[lower]) return DB_NAME_TO_CANONICAL[lower];

  if (lower.includes("|")) {
    for (const segment of lower.split("|")) {
      const s = segment.trim();
      if (DB_NAME_TO_CANONICAL[s]) return DB_NAME_TO_CANONICAL[s];
      const match = Object.entries(DB_NAME_TO_CANONICAL).find(([k]) => s.includes(k) || k.includes(s));
      if (match) return match[1];
    }
  }

  const partial = Object.entries(DB_NAME_TO_CANONICAL).find(
    ([k]) => lower.includes(k) || k.includes(lower),
  );
  return partial ? partial[1] : null;
}

function sortValue(e: Omit<HospitalComparisonEntry, "rank">): number {
  return e.patientCost ?? e.cashPrice ?? Infinity;
}

// ── Route handler ─────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const cptCode    = searchParams.get("cptCode");
  const payerType  = searchParams.get("payerType");
  const payerName  = searchParams.get("payerName");
  const coinsurance = parseFloat(searchParams.get("coinsurance") ?? "0.20");

  // Episode totals passed from the breakdown — used ONLY as an anchor for AI estimates
  // when real DB data doesn't exist. Never used to distort real DB prices.
  const episodeInsLow   = searchParams.get("episodeInsLow")   ? parseInt(searchParams.get("episodeInsLow")!)   : null;
  const episodeInsHigh  = searchParams.get("episodeInsHigh")  ? parseInt(searchParams.get("episodeInsHigh")!)  : null;
  const episodeCashLow  = searchParams.get("episodeCashLow")  ? parseInt(searchParams.get("episodeCashLow")!)  : null;
  const episodeCashHigh = searchParams.get("episodeCashHigh") ? parseInt(searchParams.get("episodeCashHigh")!) : null;
  const episodeInsMedian  = episodeInsLow  && episodeInsHigh  ? Math.round((episodeInsLow  + episodeInsHigh)  / 2) : null;
  const episodeCashMedian = episodeCashLow && episodeCashHigh ? Math.round((episodeCashLow + episodeCashHigh) / 2) : null;

  if (!cptCode) return NextResponse.json({ error: "cptCode is required" }, { status: 400 });

  const allCptCodes = [cptCode];
  const cacheKey = `compare7:${cptCode}|${payerType ?? ""}|${payerName ?? ""}|${coinsurance}`;
  const cached = await redis.get<CompareResponse>(cacheKey);
  if (cached) return NextResponse.json(cached);

  // Single query with include — avoids 2 sequential round-trips (saves 10-15s on Neon cold-start)
  type PriceRow = {
    hospital: { id: string; name: string; address: string; lastSeeded: Date | null };
    payerName: string;
    payerType: string;
    priceInCents: number;
    priceType: string;
  };

  const procedureResults = await prisma.procedure.findMany({
    where: { cptCode: { in: allCptCodes } },
    select: {
      id: true,
      cptCode: true,
      name: true,
      prices: {
        include: { hospital: { select: { id: true, name: true, address: true, lastSeeded: true } } },
      },
    },
  });

  const procedures = procedureResults.map(({ id, cptCode, name }) => ({ id, cptCode, name }));
  const procedure = procedures.find((p) => p.cptCode === cptCode) ?? null;
  const dbEntries: PriceRow[] = procedureResults.flatMap((p) => p.prices);

  // 3. Group price entries by canonical hospital ID
  type HospMap = {
    hospital: { id: string; name: string; address: string };
    grossPrices: number[];
    cashPrices: number[];
    insPrices: number[];
    insPayerName: string | null;
    lastSeeded: Date | null;
  };

  const hospMap = new Map<string, HospMap>();

  for (const e of dbEntries) {
    const price = e.priceInCents / 100;
    if (price < MIN_PROCEDURE_PRICE) continue;

    const canonicalId  = resolveCanonicalId(e.hospital.name);
    const key          = canonicalId ?? e.hospital.id;
    const canonicalHosp = canonicalId
      ? (MANHATTAN_HOSPITALS.find((h) => h.id === canonicalId) ?? e.hospital)
      : e.hospital;

    if (!hospMap.has(key)) {
      hospMap.set(key, {
        hospital: { id: key, name: canonicalHosp.name, address: canonicalHosp.address },
        grossPrices: [],
        cashPrices: [],
        insPrices: [],
        insPayerName: null,
        lastSeeded: e.hospital.lastSeeded ?? null,
      });
    }

    const h = hospMap.get(key)!;
    if (e.priceType === "gross") h.grossPrices.push(price);
    if (e.payerType === "cash")  h.cashPrices.push(price);

    const isNegotiated = e.priceType === "negotiated" || e.priceType === "discounted";
    if (payerType) {
      if (e.payerType === payerType && isNegotiated) {
        const nameMatch = !payerName ||
          e.payerName.toLowerCase().includes(payerName.split(" ")[0].toLowerCase());
        if (nameMatch || h.insPrices.length === 0) {
          h.insPrices.push(price);
          if (!h.insPayerName) h.insPayerName = e.payerName;
        }
      }
    } else if (e.payerType === "commercial" && isNegotiated) {
      h.insPrices.push(price);
      if (!h.insPayerName) h.insPayerName = e.payerName;
    }
  }

  // 4. Convert DB groups to comparison entries
  //    Use median to reduce outlier impact. No artificial tier multipliers.
  //    If DB price looks like a single line item (< 30% of the AI episode estimate),
  //    scale it up to episode level using the AI anchor and mark as "partial".
  //    This handles chargemasters that list professional fees only, not full episode prices.
  const realEntries: Omit<HospitalComparisonEntry, "rank">[] = [];
  const coveredIds = new Set<string>();

  for (const h of hospMap.values()) {
    const insuranceRate    = h.insPrices.length  ? Math.round(median(h.insPrices))          : null;
    const cashPrice        = h.cashPrices.length  ? Math.round(median(h.cashPrices))         : null;
    const chargemasterPrice = h.grossPrices.length ? Math.round(Math.max(...h.grossPrices))  : null;

    if (insuranceRate == null && cashPrice == null) continue;

    let effectiveInsuranceRate = insuranceRate ?? (cashPrice != null ? Math.round(cashPrice * 0.82) : null);
    let effectiveCashPrice     = cashPrice     ?? (insuranceRate != null ? Math.round(insuranceRate * 1.22) : null);

    // Sanity check: cash prices cannot be less than ~60% of negotiated rate in reality.
    // If we see cash < 60% of insurance, it's a data artifact (wrong CPT code mixed in,
    // or a fragment entry). Replace with the standard self-pay estimate (insurance * 1.22).
    if (effectiveCashPrice != null && effectiveInsuranceRate != null &&
        effectiveCashPrice < effectiveInsuranceRate * 0.60) {
      effectiveCashPrice = Math.round(effectiveInsuranceRate * 1.22);
    }

    // Detect line-item prices: if the DB price is less than 30% of the AI-estimated
    // episode total, it's almost certainly a single fee (surgeon, facility, etc.) rather
    // than the full episode cost. Scale to episode level using the AI anchor.
    // No tier multipliers — hospitals get differentiated by their own real data spread.
    let dataQuality: HospitalComparisonEntry["dataQuality"] =
      insuranceRate != null && cashPrice != null ? "real" : "partial";
    let priceScope: HospitalComparisonEntry["priceScope"] = "unknown";

    if (episodeInsMedian && effectiveInsuranceRate && effectiveInsuranceRate < episodeInsMedian * 0.30) {
      effectiveInsuranceRate = episodeInsMedian;
      effectiveCashPrice     = episodeCashMedian ?? Math.round(episodeInsMedian * 1.22);
      dataQuality            = "partial"; // clearly label — price is episode-scaled, not raw DB
      priceScope             = "line-item";
    } else if (episodeCashMedian && effectiveCashPrice && !effectiveInsuranceRate && effectiveCashPrice < episodeCashMedian * 0.30) {
      effectiveCashPrice = episodeCashMedian;
      dataQuality        = "partial";
      priceScope         = "line-item";
    }

    const patientCost = effectiveInsuranceRate != null ? Math.round(effectiveInsuranceRate * coinsurance) : null;
    const insurerPays = effectiveInsuranceRate != null ? Math.round(effectiveInsuranceRate * (1 - coinsurance)) : null;

    realEntries.push({
      hospital: h.hospital,
      chargemasterPrice,
      insuranceRate: effectiveInsuranceRate,
      patientCost,
      insurerPays,
      cashPrice: effectiveCashPrice,
      payerName: h.insPayerName,
      dataQuality,
      isAiEstimate: false,
      dataLastUpdated: h.lastSeeded?.toISOString() ?? null,
      priceScope,
    });
    coveredIds.add(h.hospital.id);
  }

  // 5. AI fallback — only for hospitals with no DB data at all, clearly labeled "estimated"
  const missingHospitals = MANHATTAN_HOSPITALS.filter((h) => !coveredIds.has(h.id));
  let aiEntries: Omit<HospitalComparisonEntry, "rank">[] = [];

  if (missingHospitals.length > 0) {
    const procName         = procedure?.name ?? `procedure for CPT ${cptCode}`;
    const effectivePayerType = payerType ?? "commercial";
    const payerDesc        = payerName
      ? `${payerName} (${effectivePayerType})`
      : `typical ${effectivePayerType} insurance`;

    // Anchor on episode totals from the breakdown if available.
    // We only use these to prevent the AI from producing single-line-item prices.
    const episodeAnchor = episodeInsMedian
      ? `Use $${episodeInsMedian.toLocaleString()} (negotiated) and $${episodeCashMedian?.toLocaleString() ?? "N/A"} (cash) as approximate episode total reference.`
      : `For inpatient surgical procedures, negotiated rates are typically $25,000–$100,000+. For outpatient, $2,000–$20,000.`;

    try {
      const aiText = await anthropicCall({
        max_tokens: 1200,
        system: `You are an expert in Manhattan hospital pricing. Return ONLY valid JSON — no markdown, no commentary.`,
        messages: [
          {
            role: "user",
            content: `Estimate ALL-IN episode-of-care prices for CPT ${cptCode} (${procName}) at these Manhattan hospitals:
${missingHospitals.map((h, i) => `${i}: ${h.name}`).join("\n")}

Insurance context: ${payerDesc}
${episodeAnchor}

Prices must reflect the complete episode (facility + professional + anesthesia + implants), not a single fee-schedule line item.
chargemasterPrice = gross list price (3-6× negotiated rate)
insuranceRate     = in-network negotiated episode total
cashPrice         = self-pay episode total (15-30% above negotiated)

Return JSON array:
[{ "hospitalIndex": <0-based>, "chargemasterPrice": <int USD>, "insuranceRate": <int USD>, "cashPrice": <int USD> }]`,
          },
        ],
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
          return [
            {
              hospital: { id: hosp.id, name: hosp.name, address: hosp.address },
              chargemasterPrice: item.chargemasterPrice,
              insuranceRate,
              patientCost: insuranceRate != null ? Math.round(insuranceRate * coinsurance) : null,
              insurerPays: insuranceRate != null ? Math.round(insuranceRate * (1 - coinsurance)) : null,
              cashPrice: item.cashPrice,
              payerName: payerName ?? (payerType ? `${payerType} insurance` : null),
              dataQuality: "estimated" as const,
              isAiEstimate: true,
              dataLastUpdated: null,
              priceScope: "episode" as const,
            },
          ];
        });
      }
    } catch (err) {
      console.error("AI hospital estimate failed:", err);
    }
  }

  // 6. Merge, sort by patient cost (real/partial first at same price tier), then rank
  const allEntries = [...realEntries, ...aiEntries];

  allEntries.sort((a, b) => {
    const av = sortValue(a);
    const bv = sortValue(b);
    if (av !== bv) return av - bv;
    // Tiebreak: real > partial > estimated
    const qualityRank = { real: 0, partial: 1, estimated: 2 } as const;
    return qualityRank[a.dataQuality] - qualityRank[b.dataQuality];
  });

  const ranked: HospitalComparisonEntry[] = allEntries.map((e, i) => ({ ...e, rank: i + 1 }));
  const medicare = getBestMedicareBenchmark(allCptCodes);
  const response: CompareResponse = { entries: ranked, medicare };

  await redis.set(cacheKey, response, { ex: 86400 });
  return NextResponse.json(response);
}
