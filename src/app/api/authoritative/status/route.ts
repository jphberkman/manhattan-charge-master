import { NextResponse } from "next/server";
import { listCdcIcd10CmFiles } from "@/lib/authoritative/cdc-icd10cm";
import { isPplConfigured } from "@/lib/authoritative/cms-ppl";
import { searchHcpcs, searchIcd10Cm, searchRxTerms } from "@/lib/authoritative/nlm-clinical-tables";
import { getCareCompareByCcn } from "@/lib/authoritative/cms-care-compare";
import { listHptEnforcement, listCmsCatalog } from "@/lib/authoritative/cms-data-api";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

async function probe<T>(label: string, fn: () => Promise<T>): Promise<{
  source: string;
  ok: boolean;
  detail: string;
}> {
  try {
    const value = await fn();
    const n = Array.isArray(value) ? value.length : value ? 1 : 0;
    return { source: label, ok: n > 0, detail: n > 0 ? `ok (${n})` : "empty (authoritative miss)" };
  } catch (err) {
    return { source: label, ok: false, detail: err instanceof Error ? err.message : "failed" };
  }
}

export async function GET() {
  const [icd, hcpcs, rx, cc, hpt, catalog, cdc] = await Promise.all([
    probe("nlm-icd10cm", () => searchIcd10Cm("M17.11", 1)),
    probe("nlm-hcpcs", () => searchHcpcs("E0193", 1)),
    probe("nlm-rxterms", () => searchRxTerms("ibuprofen", 1)),
    probe("cms-care-compare", () => getCareCompareByCcn("330204")),
    probe("cms-hpt-enforcement", () => listHptEnforcement("NY", 3)),
    probe("cms-data-catalog", () => listCmsCatalog(3)),
    probe("cdc-icd10cm-listing", () => listCdcIcd10CmFiles("2026")),
  ]);

  return NextResponse.json({
    ppl: {
      source: "cms-ppl",
      ok: false,
      configured: isPplConfigured(),
      detail: isPplConfigured()
        ? "Keys present; still fail-closed on non-2xx"
        : "Not configured (no AMA license / CMS apiKey)",
    },
    sources: [icd, hcpcs, rx, cc, hpt, catalog, cdc],
  });
}
