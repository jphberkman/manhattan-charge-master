import { describe, expect, it } from "vitest";
import { classifyMedicalCode } from "../code-kind";
import { parseNlmSearchPayloadForTest } from "../nlm-clinical-tables";
import { parseCdcListingHtmlForTest, parseIcd10CmOrderLine } from "../cdc-icd10cm";
import { isPplConfigured, pplUnavailableResult } from "../cms-ppl";

describe("classifyMedicalCode", () => {
  it("treats ICD-10-CM as diagnosis, not a price key", () => {
    expect(classifyMedicalCode("M17.11")).toBe("icd10-cm");
    expect(classifyMedicalCode("A00")).toBe("icd10-cm");
    expect(classifyMedicalCode("S72.001A")).toBe("icd10-cm");
  });

  it("treats letter+4 digits as HCPCS Level II", () => {
    expect(classifyMedicalCode("E0193")).toBe("hcpcs-level-2");
    expect(classifyMedicalCode("J3490")).toBe("hcpcs-level-2");
  });

  it("does not call 5-digit tokens a public CPT API", () => {
    expect(classifyMedicalCode("27447")).toBe("cpt-shaped");
  });
});

describe("NLM Clinical Tables payload", () => {
  it("parses the documented CTSS tuple", () => {
    const { total, rows } = parseNlmSearchPayloadForTest([
      1,
      ["M17.11"],
      null,
      [["M17.11", "Unilateral primary osteoarthritis, right knee"]],
    ]);
    expect(total).toBe(1);
    expect(rows[0][0]).toBe("M17.11");
  });

  it("does not invent hits from malformed payloads", () => {
    expect(parseNlmSearchPayloadForTest({})).toEqual({ total: 0, rows: [] });
  });
});

describe("CDC ICD-10-CM listing/order parser", () => {
  it("extracts only hrefs CDC listed", () => {
    const html = `<a href="/pub/Health_Statistics/NCHS/Publications/ICD10CM/2026/icd10cm-Code%20Descriptions-2026.zip">icd10cm-Code Descriptions-2026.zip</a>`;
    const files = parseCdcListingHtmlForTest(html, "2026");
    expect(files).toHaveLength(1);
    expect(files[0].href).toContain("icd10cm-Code%20Descriptions-2026.zip");
  });

  it("parses an order-file line", () => {
    const row = parseIcd10CmOrderLine("00002 A000    1 Cholera due to Vibrio cholerae 01, biovar cholerae", "2026");
    expect(row).toEqual({
      code: "A00.0",
      billable: true,
      description: "Cholera due to Vibrio cholerae 01, biovar cholerae",
      fy: "2026",
    });
  });
});

describe("CMS PPL", () => {
  it("is unavailable without AMA license + apiKey", () => {
    expect(isPplConfigured()).toBe(false);
    const result = pplUnavailableResult();
    expect(result.status).toBe("unavailable");
    expect(result.data).toBeNull();
  });
});
