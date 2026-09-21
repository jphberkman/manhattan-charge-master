import { describe, expect, test } from "vitest";
import { medianCents, SkinnyAggregator } from "@/lib/price-transparency/skinny-aggregate";

describe("medianCents", () => {
  test("returns null for empty", () => {
    expect(medianCents([])).toBeNull();
  });
  test("odd and even lengths", () => {
    expect(medianCents([100])).toBe(100);
    expect(medianCents([100, 300, 200])).toBe(200);
    expect(medianCents([100, 200])).toBe(150);
  });
});

describe("SkinnyAggregator", () => {
  test("rolls charge rows into one row per code", () => {
    const a = new SkinnyAggregator();
    a.add({ code: "27447", codeKind: "cpt-shaped", description: "Knee", priceType: "gross", priceCents: 5000000 });
    a.add({ code: "27447", codeKind: "cpt-shaped", description: "Knee", priceType: "cash", priceCents: 2000000 });
    a.add({ code: "27447", codeKind: "cpt-shaped", description: "Knee", priceType: "negotiated", priceCents: 1000000 });
    a.add({ code: "27447", codeKind: "cpt-shaped", description: "Knee", priceType: "negotiated", priceCents: 3000000 });
    a.add({ code: "99213", codeKind: "cpt-shaped", description: "Office", priceType: "cash", priceCents: 15000 });
    const rows = a.toRows().sort((x, y) => x.code.localeCompare(y.code));
    expect(rows).toHaveLength(2);
    const knee = rows.find((r) => r.code === "27447")!;
    expect(knee.listCents).toBe(5000000);
    expect(knee.cashCents).toBe(2000000);
    expect(knee.negotiatedCents).toBe(2000000);
    expect(knee.commercialCents).toBe(2000000);
    expect(knee.negotiatedMinCents).toBe(1000000);
    expect(knee.negotiatedMaxCents).toBe(3000000);
  });

  test("does not blend Medicare into commercial negotiated", () => {
    const a = new SkinnyAggregator();
    a.add({
      code: "27766",
      codeKind: "cpt-shaped",
      description: "Medial malleolus",
      priceType: "negotiated",
      payerClass: "medicare",
      priceCents: 845318,
    });
    a.add({
      code: "27766",
      codeKind: "cpt-shaped",
      description: "Medial malleolus",
      priceType: "negotiated",
      payerClass: "commercial",
      priceCents: 1002400,
    });
    a.add({
      code: "27766",
      codeKind: "cpt-shaped",
      description: "Medial malleolus",
      priceType: "cash",
      priceCents: 845360,
    });
    const row = a.toRows()[0];
    expect(row.negotiatedCents).toBe(1002400);
    expect(row.commercialCents).toBe(1002400);
    expect(row.medicareCents).toBe(845318);
    expect(row.cashCents).toBe(845360);
    expect(row.negotiatedMinCents).toBe(1002400);
    expect(row.negotiatedMaxCents).toBe(1002400);
  });

  test("skips CDM codes that collide with CPT strings", () => {
    const a = new SkinnyAggregator();
    a.add({
      code: "27766",
      codeKind: "cdm",
      description: "Internal item",
      priceType: "cash",
      priceCents: 100,
    });
    expect(a.toRows()).toHaveLength(0);
  });
});
