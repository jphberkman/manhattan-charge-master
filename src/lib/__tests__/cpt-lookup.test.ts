import { describe, expect, test } from "vitest";
import {
  extractKeywords,
  normalizeSearchText,
  scoreDescriptionMatch,
} from "@/lib/price-transparency/search-text";

describe("normalizeSearchText", () => {
  test("collapses non-union variants", () => {
    expect(normalizeSearchText("non-union ankle fracture")).toBe("nonunion ankle fracture");
    expect(normalizeSearchText("non union ankle")).toBe("nonunion ankle");
    expect(normalizeSearchText("NONUNION")).toBe("nonunion");
  });
});

describe("extractKeywords", () => {
  test("keeps nonunion as a keyword", () => {
    expect(extractKeywords("I have a non-union ankle fracture and need surgery")).toEqual([
      "nonunion",
      "ankle",
      "fracture",
    ]);
  });
});

describe("scoreDescriptionMatch", () => {
  test("ranks fibula nonunion above acute ankle ORIF", () => {
    const query = "I have a non-union ankle fracture and need surgery";
    const acute = scoreDescriptionMatch(query, "Ankle fracture repair (ORIF)", { weight: 100 });
    const nonunion = scoreDescriptionMatch(query, "Repair of fibula nonunion", { weight: 100 });
    expect(nonunion.confidence).toBeGreaterThan(acute.confidence);
    expect(acute.confidence).toBeLessThan(60);
  });

  test("ranks CMS-style nonhealed fibula description above acute ankle ORIF", () => {
    const query = "I have a non-union ankle fracture and need surgery";
    const acute = scoreDescriptionMatch(query, "Treatment of inside portion of broken shin bone at ankle");
    const nonunion = scoreDescriptionMatch(
      query,
      "Repair of nonhealed broken outer lower leg bone with placement of stabilizing device",
    );
    expect(nonunion.confidence).toBeGreaterThan(acute.confidence);
    expect(nonunion.confidence).toBeGreaterThanOrEqual(70);
  });

  test("does not let keyword-only ankle fracture beat a modifier match", () => {
    const ranked = [
      { code: "27766", text: "Ankle fracture repair (ORIF)" },
      { code: "27726", text: "Repair of fibula nonunion" },
      { code: "27720", text: "Repair of tibia nonunion" },
    ]
      .map((c) => ({
        ...c,
        confidence: scoreDescriptionMatch("non-union ankle fracture", c.text, { weight: 100 }).confidence,
      }))
      .sort((a, b) => b.confidence - a.confidence);
    expect(ranked[0].code).not.toBe("27766");
    expect(["27726", "27720"]).toContain(ranked[0].code);
  });
});
