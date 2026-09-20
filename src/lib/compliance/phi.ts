/**
 * HIPAA minimum-necessary helpers: strip identifiers from strings
 * before they are written to logs, analytics, or audit metadata.
 */

const EMAIL_RE = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi;
const SSN_RE = /\b\d{3}-\d{2}-\d{4}\b/g;
const PHONE_RE =
  /\b(?:\+?1[-.\s]?)?(?:\(?\d{3}\)?[-.\s]?)\d{3}[-.\s]?\d{4}\b/g;
const MRN_RE = /\b(?:mrn|medical[\s-]?record(?:\s+number)?|patient[\s-]?id)[:#\s-]*[A-Z0-9-]{4,}\b/gi;
const DOB_RE =
  /\b(?:dob|date\s+of\s+birth|born\s+on)[:\s-]*\d{1,2}[/-]\d{1,2}[/-]\d{2,4}\b/gi;
const IP_RE = /\b(?:\d{1,3}\.){3}\d{1,3}\b/g;

export function redactPhi(input: string | null | undefined): string {
  if (!input) return "";
  return input
    .replace(EMAIL_RE, "[REDACTED-EMAIL]")
    .replace(SSN_RE, "[REDACTED-SSN]")
    .replace(PHONE_RE, "[REDACTED-PHONE]")
    .replace(MRN_RE, "[REDACTED-MRN]")
    .replace(DOB_RE, "[REDACTED-DOB]")
    .replace(IP_RE, "[REDACTED-IP]");
}

/** Safe field for search analytics: redacts identifiers, keeps CPT / procedure text. */
export function sanitizeSearchQuery(query: string): string {
  return redactPhi(query).slice(0, 500);
}
