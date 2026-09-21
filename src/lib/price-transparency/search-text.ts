/**
 * Shared query normalization for CPT lookup and hospital description search.
 * Hyphens in websearch_to_tsquery are NOT operators — never pass raw user text.
 */

const STOP_WORDS = new Set([
  "i", "a", "an", "the", "and", "or", "but", "in", "on", "at", "to", "for",
  "of", "is", "it", "my", "me", "we", "our", "am", "be", "do", "if", "so",
  "have", "has", "had", "was", "were", "been", "are", "will", "can", "may",
  "not", "no", "this", "that", "with", "from", "being", "what", "how",
  "does", "need", "want", "like", "just", "get", "got", "its",
  "doctor", "told", "says", "think", "know", "going", "would", "could",
  "should", "very", "much", "some", "also", "about",
]);

const MEDICAL_STOP_WORDS = new Set([
  "surgery", "surgical", "procedure", "operation", "treatment",
  "diagnosed", "diagnosis", "condition", "problem", "issue",
  "recommend", "recommends", "recommended",
]);

/** Clinical modifiers that change which CPT is correct when present in the query. */
export const CLINICAL_MODIFIERS = [
  "nonunion",
  "malunion",
  "orif",
  "arthroscopic",
  "laparoscopic",
  "screening",
  "revision",
] as const;

const COMPOUNDS: [RegExp, string][] = [
  [/non[\s-]*union/g, "nonunion"],
  [/non[\s-]*healed/g, "nonunion"],
  [/mal[\s-]*union/g, "malunion"],
  [/\bbroken\b/g, "fracture"],
];

export function normalizeSearchText(query: string): string {
  let s = query.toLowerCase();
  for (const [re, repl] of COMPOUNDS) s = s.replace(re, repl);
  return s.replace(/[^a-z0-9]+/g, " ").trim();
}

export function extractKeywords(query: string): string[] {
  return normalizeSearchText(query)
    .split(/\s+/)
    .filter((w) => w.length >= 2 && !STOP_WORDS.has(w) && !MEDICAL_STOP_WORDS.has(w))
    .slice(0, 8);
}

export interface DescriptionScore {
  confidence: number;
  matched: number;
  keywords: string[];
}

/**
 * Score a candidate description against a patient query.
 * Missing a query modifier (e.g. nonunion) is a hard penalty so "ankle fracture"
 * cannot outrank a true non-union repair.
 */
export function scoreDescriptionMatch(
  query: string,
  text: string,
  opts?: { weight?: number },
): DescriptionScore {
  const keywords = extractKeywords(query);
  let hay = normalizeSearchText(text);
  if (/\bfibula\b|\bmalleolus\b/.test(hay)) hay += " ankle";
  if (!keywords.length) return { confidence: 0, matched: 0, keywords };

  const matched = keywords.filter((k) => hay.includes(k)).length;
  let confidence = (matched / keywords.length) * 100;
  if (opts?.weight) confidence += Math.min(opts.weight * 5, 20);

  const qn = normalizeSearchText(query);
  for (const mod of CLINICAL_MODIFIERS) {
    const qHas = qn.includes(mod);
    const tHas = hay.includes(mod);
    if (qHas && tHas) confidence += 35;
    else if (qHas && !tHas) confidence -= 45;
  }

  return {
    confidence: Math.max(0, Math.min(100, Math.round(confidence))),
    matched,
    keywords,
  };
}
