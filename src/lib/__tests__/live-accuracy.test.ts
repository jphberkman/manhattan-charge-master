import { describe, expect, test } from "vitest";
import { searchCptCodes } from "@/lib/cpt-lookup";
import { getPriceSummariesForCode } from "@/lib/price-transparency/price-read-model";

const live = Boolean(process.env.DATABASE_URL);

describe.skipIf(!live)("live neon accuracy", () => {
  test("non-union query does not rank acute 27766 first", async () => {
    const matches = await searchCptCodes(
      "I have a non-union ankle fracture and need surgery",
      10,
    );
    expect(matches.length).toBeGreaterThan(0);
    expect(matches[0].code).not.toBe("27766");
    expect(["27726", "27720"]).toContain(matches[0].code);
  });

  test("27766 commercial rates differ across unconnected hospitals", async () => {
    const rows = await getPriceSummariesForCode("27766");
    const commercial = rows
      .map((r) => r.negotiatedMedianByClass.commercial)
      .filter((n): n is number => n != null);
    expect(new Set(commercial).size).toBeGreaterThan(1);
    const nyu = rows.find((r) => r.hospitalId === "nyu-langone");
    const bellevue = rows.find((r) => r.hospitalId === "hhc-bellevue");
    expect(nyu?.negotiatedMedianByClass.commercial).not.toBe(bellevue?.cashMedian);
  });
});
