/**
 * Build the consumer hospital grid: always the 13 shopper campuses.
 * Never copy another hospital’s dollars. Never include NYU Orthopedic or
 * a combined NYP file attributed to Columbia.
 */
import { SHOPPER_HOSPITALS, type ShopperHospital } from "./shopper-hospitals";
import type { HospitalPriceSummary } from "./price-read-model";

export type CampusFileStatus = "present" | "combined-unattributed" | "missing";

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

  for (const shopper of SHOPPER_HOSPITALS) {
    const fileStatus = campusFileStatus(shopper.id);
    // Combined NYP dumps and missing-campus files must not mint a campus price.
    const s = fileStatus === "present" ? byId.get(shopper.id) : undefined;
    const specific = fileStatus === "present" ? input.payerSpecific?.get(shopper.id) ?? null : null;
    const insuranceRate = specific?.median ?? s?.negotiatedMedianByClass[input.insClass] ?? null;
    const cashPrice = s?.cashMedian ?? null;
    const hasPrice = insuranceRate != null || cashPrice != null;

    const patientCost =
      insuranceRate != null && input.coinsurance != null
        ? Math.round(insuranceRate * input.coinsurance)
        : null;
    const insurerPays =
      insuranceRate != null && input.coinsurance != null
        ? Math.round(insuranceRate * (1 - input.coinsurance))
        : null;

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
