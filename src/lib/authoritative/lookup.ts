import { classifyMedicalCode, type MedicalCodeKind } from "./code-kind";
import { lookupLocalIcd10Cm } from "./cdc-icd10cm";
import { pplUnavailableResult, type PplLookupResult } from "./cms-ppl";
import {
  searchHcpcs,
  searchIcd10Cm,
  searchRxTerms,
  validateHcpcs,
  validateIcd10Cm,
  type NlmCodeHit,
  type RxTermHit,
} from "./nlm-clinical-tables";

export interface CodeLookupResponse {
  query: string;
  kind: MedicalCodeKind | "auto";
  resolvedKind: MedicalCodeKind;
  icd10cm: NlmCodeHit[];
  hcpcs: NlmCodeHit[];
  cdcLocal: { code: string; description: string; billable: boolean; fy: string } | null;
  rxterms: RxTermHit[];
  ppl: PplLookupResult;
  notes: string[];
}

export async function lookupAuthoritativeCodes(
  query: string,
  kind: MedicalCodeKind | "auto" = "auto",
  options: { includeRxTerms?: boolean } = {},
): Promise<CodeLookupResponse> {
  const q = query.trim();
  const resolvedKind = kind === "auto" ? classifyMedicalCode(q) : kind;
  const notes: string[] = [];
  const empty: CodeLookupResponse = {
    query: q,
    kind,
    resolvedKind,
    icd10cm: [],
    hcpcs: [],
    cdcLocal: null,
    rxterms: [],
    ppl: pplUnavailableResult(),
    notes,
  };
  if (!q) {
    notes.push("Empty query");
    return empty;
  }

  if (resolvedKind === "icd10-cm") {
    notes.push("ICD-10-CM is a diagnosis code. It is not a hospital price or CPT key.");
    const [icd10cm, cdcLocal] = await Promise.all([
      searchIcd10Cm(q, 8),
      lookupLocalIcd10Cm(q),
    ]);
    return { ...empty, icd10cm, cdcLocal, notes };
  }

  if (resolvedKind === "hcpcs-level-2") {
    const hcpcs = await searchHcpcs(q, 8);
    notes.push("HCPCS Level II descriptions come from NLM Clinical Tables (public).");
    notes.push("CMS PPL is not queried without an AMA license.");
    return { ...empty, hcpcs, notes };
  }

  if (resolvedKind === "cpt-shaped") {
    notes.push(
      "This token looks like CPT (HCPCS Level I). ShopForCare has no AMA license, so it is not validated against a public CPT API or CMS PPL.",
    );
    return empty;
  }

  const [icd10cm, hcpcs, rxterms] = await Promise.all([
    searchIcd10Cm(q, 8),
    searchHcpcs(q, 8),
    options.includeRxTerms ? searchRxTerms(q, 8) : Promise.resolve([]),
  ]);
  if (icd10cm.length) notes.push("Keyword matched NLM ICD-10-CM (diagnosis only).");
  if (hcpcs.length) notes.push("Keyword matched NLM HCPCS Level II.");
  if (!icd10cm.length && !hcpcs.length) {
    notes.push("No NLM ICD-10-CM or HCPCS hits. Empty is a real miss, not a fallback.");
  }
  return { ...empty, icd10cm, hcpcs, rxterms, notes };
}

export async function validateAuthoritativeCode(code: string): Promise<{
  code: string;
  kind: MedicalCodeKind;
  valid: boolean;
  hit: NlmCodeHit | { code: string; description: string; source: "cdc-icd10cm" } | null;
  notes: string[];
}> {
  const kind = classifyMedicalCode(code);
  const notes: string[] = [];
  if (kind === "icd10-cm") {
    const [nlm, cdc] = await Promise.all([validateIcd10Cm(code), lookupLocalIcd10Cm(code)]);
    if (nlm) return { code, kind, valid: true, hit: nlm, notes };
    if (cdc) {
      return {
        code,
        kind,
        valid: true,
        hit: { code: cdc.code, description: cdc.description, source: "cdc-icd10cm" },
        notes: ["Validated against local CDC ICD-10-CM codebook"],
      };
    }
    notes.push("Not found in NLM ICD-10-CM Clinical Tables.");
    return { code, kind, valid: false, hit: null, notes };
  }
  if (kind === "hcpcs-level-2") {
    const hit = await validateHcpcs(code);
    if (!hit) notes.push("Not found in NLM HCPCS Clinical Tables.");
    return { code, kind, valid: Boolean(hit), hit, notes };
  }
  if (kind === "cpt-shaped") {
    notes.push("CPT is AMA-licensed. This service does not mark CPT codes valid or invalid.");
    return { code, kind, valid: false, hit: null, notes };
  }
  notes.push("Token is not a recognized ICD-10-CM or HCPCS Level II pattern.");
  return { code, kind, valid: false, hit: null, notes };
}
