/**
 * Classify a token as diagnosis vs public HCPCS vs CPT-shaped.
 * CPT-shaped codes are not treated as publicly licensed descriptions.
 */

export type MedicalCodeKind =
  | "icd10-cm"
  | "hcpcs-level-2"
  | "cpt-shaped"
  | "unknown";

const HCPCS_L2 = /^[A-Z]\d{4}$/i;
/** ICD-10-CM: letter + 2 more, optional decimal remainder (max 7 chars total). */
const ICD10CM = /^[A-TV-Z][0-9][0-9A-Z](?:\.?[0-9A-Z]{1,4})?$/i;
const CPT_SHAPED = /^\d{5}(?:-[A-Z0-9]{2})?$/i;

export function normalizeCodeToken(raw: string): string {
  return raw.trim().toUpperCase().replace(/\s+/g, "");
}

export function classifyMedicalCode(raw: string): MedicalCodeKind {
  const code = normalizeCodeToken(raw);
  if (!code) return "unknown";
  if (HCPCS_L2.test(code)) return "hcpcs-level-2";
  if (ICD10CM.test(code)) return "icd10-cm";
  if (CPT_SHAPED.test(code)) return "cpt-shaped";
  return "unknown";
}

export function stripIcdDecimal(code: string): string {
  return normalizeCodeToken(code).replace(/\./g, "");
}
