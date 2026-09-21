/**
 * NLM Clinical Tables Search Service (no API key).
 * https://clinicaltables.nlm.nih.gov/
 *
 * ICD-10-CM and HCPCS Level II are public. This client does not call CPT.
 */

import { redis } from "@/lib/redis";
import { fetchAuthoritativeJson } from "./http";

const NLM_BASE = "https://clinicaltables.nlm.nih.gov/api";
const CACHE_SECS = 86_400;

export interface NlmCodeHit {
  code: string;
  description: string;
  source: "nlm-icd10cm" | "nlm-hcpcs" | "nlm-rxterms";
}

/** CTSS JSON: [total, codes[], extra, displayRows[][]] */
type NlmSearchPayload = [number, string[], unknown, string[][]];

function parseNlmPayload(data: unknown): { total: number; rows: string[][] } {
  if (!Array.isArray(data) || data.length < 4) {
    return { total: 0, rows: [] };
  }
  const total = typeof data[0] === "number" ? data[0] : 0;
  const rows = Array.isArray(data[3]) ? (data[3] as string[][]) : [];
  return { total, rows };
}

async function nlmSearch(
  path: string,
  terms: string,
  extraParams: Record<string, string>,
): Promise<{ total: number; rows: string[][] }> {
  const q = terms.trim();
  if (!q) return { total: 0, rows: [] };

  const params = new URLSearchParams({
    terms: q,
    maxList: extraParams.maxList ?? "8",
    ...extraParams,
  });
  const url = `${NLM_BASE}/${path}?${params.toString()}`;
  const data = await fetchAuthoritativeJson<NlmSearchPayload>(url, { timeoutMs: 8_000 });
  return parseNlmPayload(data);
}

export async function searchIcd10Cm(terms: string, limit = 8): Promise<NlmCodeHit[]> {
  const key = `nlm:icd10cm:${terms.trim().toLowerCase()}:${limit}`;
  try {
    const cached = await redis.get<NlmCodeHit[]>(key);
    if (cached) return cached;
  } catch { /* ignore */ }

  const { rows } = await nlmSearch("icd10cm/v3/search", terms, {
    sf: "code,name",
    maxList: String(limit),
  });
  const hits: NlmCodeHit[] = rows
    .map((row) => ({
      code: String(row[0] ?? "").trim(),
      description: String(row[1] ?? row[0] ?? "").trim(),
      source: "nlm-icd10cm" as const,
    }))
    .filter((h) => h.code);

  try { await redis.set(key, hits, { ex: CACHE_SECS }); } catch { /* ignore */ }
  return hits;
}

export async function searchHcpcs(terms: string, limit = 8): Promise<NlmCodeHit[]> {
  const key = `nlm:hcpcs:${terms.trim().toLowerCase()}:${limit}`;
  try {
    const cached = await redis.get<NlmCodeHit[]>(key);
    if (cached) return cached;
  } catch { /* ignore */ }

  const { rows } = await nlmSearch("hcpcs/v3/search", terms, {
    sf: "code,name",
    maxList: String(limit),
  });
  const hits: NlmCodeHit[] = rows
    .map((row) => ({
      code: String(row[0] ?? "").trim(),
      description: String(row[1] ?? row[0] ?? "").trim(),
      source: "nlm-hcpcs" as const,
    }))
    .filter((h) => h.code);

  try { await redis.set(key, hits, { ex: CACHE_SECS }); } catch { /* ignore */ }
  return hits;
}

export interface RxTermHit {
  displayName: string;
  source: "nlm-rxterms";
}

export async function searchRxTerms(terms: string, limit = 8): Promise<RxTermHit[]> {
  const key = `nlm:rxterms:${terms.trim().toLowerCase()}:${limit}`;
  try {
    const cached = await redis.get<RxTermHit[]>(key);
    if (cached) return cached;
  } catch { /* ignore */ }

  const { rows } = await nlmSearch("rxterms/v3/search", terms, {
    maxList: String(limit),
  });
  const hits: RxTermHit[] = rows
    .map((row) => ({
      displayName: String(row[0] ?? "").trim(),
      source: "nlm-rxterms" as const,
    }))
    .filter((h) => h.displayName);

  try { await redis.set(key, hits, { ex: CACHE_SECS }); } catch { /* ignore */ }
  return hits;
}

export async function validateIcd10Cm(code: string): Promise<NlmCodeHit | null> {
  const hits = await searchIcd10Cm(code, 5);
  const needle = code.trim().toUpperCase().replace(/\s+/g, "");
  const compact = needle.replace(/\./g, "");
  return (
    hits.find((h) => h.code.toUpperCase() === needle) ??
    hits.find((h) => h.code.toUpperCase().replace(/\./g, "") === compact) ??
    null
  );
}

export async function validateHcpcs(code: string): Promise<NlmCodeHit | null> {
  const hits = await searchHcpcs(code, 5);
  const needle = code.trim().toUpperCase();
  return hits.find((h) => h.code.toUpperCase() === needle) ?? null;
}

/** Exported for unit tests — does not call the network. */
export function parseNlmSearchPayloadForTest(data: unknown): { total: number; rows: string[][] } {
  return parseNlmPayload(data);
}
