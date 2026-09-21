/**
 * Build the consumer hospital grid: always the 13 shopper campuses.
 * Never copy another hospital’s dollars. Never include NYU Orthopedic or
 * a combined NYP file attributed to Columbia.
 */
import { SHOPPER_HOSPITALS, type ShopperHospital } from "./shopper-hospitals";
import type { HospitalPriceSummary } from "./price-read-model";

export type CampusFileStatus = "present" | "combined-unattributed" | "missing";
export type EvidenceState =
  | "published"
  | "payer-specific"
  | "no-code"
  | "no-file"
  | "combined-unattributed";
export type RateBasis = "payer-specific" | "class-median" | null;

const CAMPUS_FILE: Record<string, CampusFileStatus> = {
  "lenox-hill": "present",
  "mount-sinai-morningside": "present",
  "mount-sinai-west": "missing",
  "nyp-lower-manhattan": "combined-unattributed",
  "nyp-columbia": "combined-unattributed",
  "nyp-cornell": "combined-unattributed",
  "hhc-bellevue": "present",
  "hhc-harlem": "present",
  "hhc-metropolitan": "present",
  "nyu-langone": "present",
  "mount-sinai": "present",
  hss: "present",
  msk: "present",
};

/** Transparency files that list more than one site in the header. */
const MULTI_SITE_FILES = new Set(["hss", "lenox-hill"]);
const HHC_IDS = ["hhc-bellevue", "hhc-harlem", "hhc-metropolitan"] as const;

export function campusFileStatus(hospitalId: string): CampusFileStatus {
  return CAMPUS_FILE[hospitalId] ?? "missing";
}

export function coverageReason(hospital: ShopperHospital, hasPrice: boolean): string | null {
  if (hasPrice) return null;
  const status = campusFileStatus(hospital.id);
  if (status === "combined-unattributed") {
    return "Combined NewYork-Presbyterian file is not attributed to this campus";
  }
  if (status === "missing") {
    return "No campus-specific transparency file yet";
  }
  return "This hospital’s file does not list this billing code";
}

function evidenceStateFor(hospitalId: string, hasPrice: boolean, rateBasis: RateBasis): EvidenceState {
  if (hasPrice) return rateBasis === "payer-specific" ? "payer-specific" : "published";
  const status = campusFileStatus(hospitalId);
  if (status === "combined-unattributed") return "combined-unattributed";
  if (status === "missing") return "no-file";
  return "no-code";
}

export interface ShopperCompareEntry {
  hospital: { id: string; name: string; address: string };
  chargemasterPrice: number | null;
  insuranceRate: number | null;
  patientCost: number | null;
  insurerPays: number | null;
  cashPrice: number | null;
  payerName: string | null;
  dataQuality: "real" | "partial";
  dataSource: "chargemaster" | "none";
  isAiEstimate: boolean;
  dataLastUpdated: string | null;
  rank: number;
  publishedMin: number | null;
  publishedMax: number | null;
  warehouseObjectKey?: string;
  coverageReason: string | null;
  evidenceState: EvidenceState;
  rateBasis: RateBasis;
  /** True when H+H campuses published the same cash figure in the same-system files. */
  sameSystemCash: boolean;
  fileCoversMultipleSites: boolean;
  /** OOP math is never a hospital-published number. */
  patientCostIsEstimate: boolean;
}

export function buildShopperCompareEntries(input: {
  summaries: HospitalPriceSummary[];
  payerSpecific?: Map<string, { median: number; payerName: string }>;
  insClass: string;
  coinsurance: number | null;
  hasInsurance: boolean;
}): ShopperCompareEntry[] {
  const byId = new Map(input.summaries.map((s) => [s.hospitalId, s]));
  const priced: ShopperCompareEntry[] = [];
  const empty: ShopperCompareEntry[] = [];

  const hhcCash = HHC_IDS.map((id) => byId.get(id)?.cashMedian).filter(
    (n): n is number => n != null,
  );
  const hhcSameCash = hhcCash.length >= 2 && new Set(hhcCash).size === 1;

  for (const shopper of SHOPPER_HOSPITALS) {
    const fileStatus = campusFileStatus(shopper.id);
    // Combined NYP dumps and missing-campus files must not mint a campus price.
    const s = fileStatus === "present" ? byId.get(shopper.id) : undefined;
    const specific = fileStatus === "present" ? input.payerSpecific?.get(shopper.id) ?? null : null;
    const classMedian = s?.negotiatedMedianByClass[input.insClass] ?? null;
    const rateBasis: RateBasis = specific
      ? "payer-specific"
      : classMedian != null
        ? "class-median"
        : null;
    const insuranceRate = specific?.median ?? classMedian;
    const cashPrice = s?.cashMedian ?? null;
    const hasPrice = insuranceRate != null || cashPrice != null;

    const applyOop =
      input.hasInsurance && insuranceRate != null && input.coinsurance != null;
    const patientCost = applyOop ? Math.round(insuranceRate * input.coinsurance) : null;
    const insurerPays = applyOop ? Math.round(insuranceRate * (1 - input.coinsurance)) : null;

    const entry: ShopperCompareEntry = {
      hospital: { id: shopper.id, name: shopper.name, address: shopper.address },
      chargemasterPrice: s?.grossMedian ?? null,
      insuranceRate,
      patientCost,
      insurerPays,
      cashPrice,
      payerName: specific?.payerName ?? null,
      dataQuality: insuranceRate != null && cashPrice != null ? "real" : "partial",
      dataSource: hasPrice ? "chargemaster" : "none",
      isAiEstimate: false,
      dataLastUpdated: s?.latestAsOf ?? null,
      rank: 0,
      publishedMin: s?.minDollars ?? null,
      publishedMax: s?.maxDollars ?? null,
      warehouseObjectKey: s?.warehouseObjectKey,
      coverageReason: coverageReason(shopper, hasPrice),
      evidenceState: evidenceStateFor(shopper.id, hasPrice, rateBasis),
      rateBasis,
      sameSystemCash: Boolean(
        cashPrice != null && HHC_IDS.includes(shopper.id as (typeof HHC_IDS)[number]) && hhcSameCash,
      ),
      fileCoversMultipleSites: MULTI_SITE_FILES.has(shopper.id),
      patientCostIsEstimate: patientCost != null,
    };
    (hasPrice ? priced : empty).push(entry);
  }

  priced.sort((a, b) => {
    const av = input.hasInsurance
      ? (a.patientCost ?? a.insuranceRate ?? Infinity)
      : (a.cashPrice ?? Infinity);
    const bv = input.hasInsurance
      ? (b.patientCost ?? b.insuranceRate ?? Infinity)
      : (b.cashPrice ?? Infinity);
    if (av !== bv) return av - bv;
    return a.dataQuality === "real" ? -1 : 1;
  });
  priced.forEach((e, i) => {
    e.rank = i + 1;
  });
  return [...priced, ...empty];
}

const usd = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

/** Plain-text scheduler card. No invented dollars. */
export function buildCompareShareText(input: {
  procedureName: string;
  cptCode: string;
  entries: ShopperCompareEntry[];
  insuranceLabel?: string | null;
}): string {
  const lines = [
    `Shop for Care — ${input.procedureName} (CPT ${input.cptCode})`,
    input.insuranceLabel ? `Insurance overlay: ${input.insuranceLabel}` : "Cash / published prices (no plan selected)",
    "Verify every number with your insurer before you schedule.",
    "",
  ];
  for (const e of input.entries) {
    const bits = [e.hospital.name];
    if (e.cashPrice != null) bits.push(`cash ${usd.format(e.cashPrice)}`);
    if (e.insuranceRate != null) {
      const basis = e.rateBasis === "payer-specific" ? "payer row" : "commercial median";
      bits.push(`negotiated ${usd.format(e.insuranceRate)} (${basis})`);
    }
    if (e.coverageReason) bits.push(e.coverageReason);
    if (e.sameSystemCash) bits.push("same published cash as other NYC Health + Hospitals campuses");
    lines.push(`• ${bits.join(" — ")}`);
  }
  lines.push("", "https://shopforcare.xyz");
  return lines.join("\n");
}
