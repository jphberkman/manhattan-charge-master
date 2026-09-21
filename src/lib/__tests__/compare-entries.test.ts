import { describe, expect, test } from "vitest";
import {
  buildCompareShareText,
  buildShopperCompareEntries,
} from "@/lib/price-transparency/compare-entries";
import { SHOPPER_HOSPITALS } from "@/lib/price-transparency/shopper-hospitals";
import type { HospitalPriceSummary } from "@/lib/price-transparency/price-read-model";

function summary(
  hospitalId: string,
  commercial: number | null,
  cash: number | null,
): HospitalPriceSummary {
  return {
    hospitalId,
    grossMedian: null,
    cashMedian: cash,
    negotiatedMedianByClass: commercial != null ? { commercial } : {},
    minDollars: commercial,
    maxDollars: commercial,
    latestAsOf: "2025-09-01T00:00:00.000Z",
  };
}

describe("buildShopperCompareEntries", () => {
  test("always returns the 13 shopper hospitals and never NYU Orthopedic", () => {
    const entries = buildShopperCompareEntries({
      summaries: [
        summary("nyu-langone", 10024, null),
        summary("hhc-bellevue", 5289, 8454),
      ],
      insClass: "commercial",
      coinsurance: 0.2,
      hasInsurance: true,
    });
    expect(entries).toHaveLength(13);
    expect(entries.map((e) => e.hospital.id).sort()).toEqual(
      SHOPPER_HOSPITALS.map((h) => h.id).sort(),
    );
    expect(entries.some((e) => /orthopedic/i.test(e.hospital.name))).toBe(false);
    expect(entries.some((e) => e.hospital.id === "nyu-orthopedic")).toBe(false);
  });

  test("does not copy NYU commercial onto Bellevue or other H+H campuses", () => {
    const entries = buildShopperCompareEntries({
      summaries: [
        summary("nyu-langone", 10024, null),
        summary("hhc-bellevue", 5289, 8454),
        summary("hhc-harlem", 5283, 8454),
        summary("hhc-metropolitan", 5273, 8454),
      ],
      insClass: "commercial",
      coinsurance: 0.2,
      hasInsurance: true,
    });
    const byId = Object.fromEntries(entries.map((e) => [e.hospital.id, e]));
    expect(byId["nyu-langone"].insuranceRate).toBe(10024);
    expect(byId["hhc-bellevue"].insuranceRate).toBe(5289);
    expect(byId["hhc-harlem"].insuranceRate).toBe(5283);
    expect(byId["hhc-metropolitan"].insuranceRate).toBe(5273);
    expect(byId["hhc-bellevue"].insuranceRate).not.toBe(byId["nyu-langone"].insuranceRate);
  });

  test("does not attribute a combined NYP file to Columbia", () => {
    const entries = buildShopperCompareEntries({
      summaries: [
        summary("nyu-langone", 10024, null),
        summary("nyp-columbia", 23397, null),
      ],
      insClass: "commercial",
      coinsurance: 0.2,
      hasInsurance: true,
    });
    const columbia = entries.find((e) => e.hospital.id === "nyp-columbia")!;
    expect(columbia.insuranceRate).toBeNull();
    expect(columbia.cashPrice).toBeNull();
    expect(columbia.dataSource).toBe("none");
    expect(columbia.coverageReason).toMatch(/not attributed/i);
  });

  test("ignores NYU Orthopedic and other non-shopper ids even if a summary exists", () => {
    const entries = buildShopperCompareEntries({
      summaries: [
        summary("nyu-langone", 10024, null),
        summary("nyu-orthopedic", 10024, null),
        summary("bellevue", 10024, 8273),
      ],
      insClass: "commercial",
      coinsurance: 0.2,
      hasInsurance: true,
    });
    expect(entries.some((e) => e.hospital.id === "nyu-orthopedic")).toBe(false);
    expect(entries.some((e) => e.hospital.id === "bellevue")).toBe(false);
    const bellevue = entries.find((e) => e.hospital.id === "hhc-bellevue")!;
    expect(bellevue.insuranceRate).toBeNull();
    expect(bellevue.cashPrice).toBeNull();
  });

  test("keeps campuses with a file but no code, and missing-file campuses, as honest empties", () => {
    const entries = buildShopperCompareEntries({
      summaries: [summary("nyu-langone", 10024, null), summary("hhc-bellevue", 5289, 8454)],
      insClass: "commercial",
      coinsurance: 0.2,
      hasInsurance: true,
    });
    const msk = entries.find((e) => e.hospital.id === "msk")!;
    expect(msk.dataSource).toBe("none");
    expect(msk.coverageReason).toMatch(/does not list this billing code/i);

    const west = entries.find((e) => e.hospital.id === "mount-sinai-west")!;
    expect(west.dataSource).toBe("none");
    expect(west.coverageReason).toMatch(/no campus-specific transparency file/i);

    const pricedIds = entries.filter((e) => e.rank > 0).map((e) => e.hospital.id);
    const emptyIds = entries.filter((e) => e.rank === 0).map((e) => e.hospital.id);
    expect(pricedIds).toEqual(["hhc-bellevue", "nyu-langone"]);
    expect(emptyIds).toHaveLength(11);
    expect(entries.slice(0, 2).every((e) => e.rank > 0)).toBe(true);
    expect(entries.slice(2).every((e) => e.rank === 0)).toBe(true);
  });

  test("does not compute you-pay dollars unless insurance is selected", () => {
    const entries = buildShopperCompareEntries({
      summaries: [summary("nyu-langone", 10024, null)],
      insClass: "commercial",
      coinsurance: 0.2,
      hasInsurance: false,
    });
    const nyu = entries.find((e) => e.hospital.id === "nyu-langone")!;
    expect(nyu.insuranceRate).toBe(10024);
    expect(nyu.patientCost).toBeNull();
    expect(nyu.patientCostIsEstimate).toBe(false);
  });

  test("labels payer-specific rates separately from the commercial median", () => {
    const payerSpecific = new Map([
      ["hhc-bellevue", { median: 664, payerName: "Aetna" }],
    ]);
    const entries = buildShopperCompareEntries({
      summaries: [
        summary("nyu-langone", 10024, null),
        summary("hhc-bellevue", 5289, 8454),
      ],
      payerSpecific,
      insClass: "commercial",
      coinsurance: 0.2,
      hasInsurance: true,
    });
    const byId = Object.fromEntries(entries.map((e) => [e.hospital.id, e]));
    expect(byId["hhc-bellevue"].insuranceRate).toBe(664);
    expect(byId["hhc-bellevue"].rateBasis).toBe("payer-specific");
    expect(byId["hhc-bellevue"].evidenceState).toBe("payer-specific");
    expect(byId["nyu-langone"].insuranceRate).toBe(10024);
    expect(byId["nyu-langone"].rateBasis).toBe("class-median");
    expect(byId["nyu-langone"].evidenceState).toBe("published");
  });

  test("flags identical H+H cash as same-system published cash, not a copy", () => {
    const entries = buildShopperCompareEntries({
      summaries: [
        summary("hhc-bellevue", 5289, 8454),
        summary("hhc-harlem", 5283, 8454),
        summary("hhc-metropolitan", 5273, 8454),
        summary("hss", 1543, 8550),
      ],
      insClass: "commercial",
      coinsurance: 0.2,
      hasInsurance: true,
    });
    const byId = Object.fromEntries(entries.map((e) => [e.hospital.id, e]));
    expect(byId["hhc-bellevue"].sameSystemCash).toBe(true);
    expect(byId["hhc-harlem"].sameSystemCash).toBe(true);
    expect(byId["hss"].sameSystemCash).toBe(false);
    expect(byId["hss"].fileCoversMultipleSites).toBe(true);
    expect(byId["nyp-columbia"].evidenceState).toBe("combined-unattributed");
    expect(byId["mount-sinai-west"].evidenceState).toBe("no-file");
  });

  test("share text lists all 13 hospitals and does not invent dollars", () => {
    const entries = buildShopperCompareEntries({
      summaries: [summary("nyu-langone", 10024, null), summary("hhc-bellevue", 5289, 8454)],
      insClass: "commercial",
      coinsurance: 0.2,
      hasInsurance: true,
    });
    const text = buildCompareShareText({
      procedureName: "Ankle fracture",
      cptCode: "27766",
      entries,
    });
    expect(text).toContain("CPT 27766");
    expect(text).toContain("NYU Langone");
    expect(text).toContain("$10,024");
    expect(text).toContain("not attributed");
    expect(text).not.toMatch(/orthopedic/i);
    expect(SHOPPER_HOSPITALS.every((h) => text.includes(h.name.split("(")[0].trim().slice(0, 12)))).toBe(
      true,
    );
  });
});
