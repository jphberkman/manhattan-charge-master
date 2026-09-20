/**
 * CMS Data API — dataset catalog (data.json) and Hospital Price Transparency
 * enforcement actions dataset 6a3aa708-3c9d-411a-a1a4-e046d3ade7ef.
 *
 * Enforcement rows are official CMS actions with dates — not a live compliance grade.
 */

import { redis } from "@/lib/redis";
import { fetchAuthoritativeJson } from "./http";

const DATA_JSON = "https://data.cms.gov/data.json";
const HPT_ENFORCEMENT =
  "https://data.cms.gov/data-api/v1/dataset/6a3aa708-3c9d-411a-a1a4-e046d3ade7ef/data";

const CACHE_SECS = 86_400;

export interface CmsCatalogDataset {
  identifier: string;
  title: string;
  landingPage?: string;
}

export interface HptEnforcementAction {
  caseId: string;
  hospitalName: string;
  address: string;
  city: string;
  state: string;
  action: string;
  dateOfAction: string;
}

interface DataJson {
  dataset?: Array<{
    identifier?: string;
    title?: string;
    landingPage?: string;
  }>;
}

export async function listCmsCatalog(limit = 20, query?: string): Promise<CmsCatalogDataset[]> {
  const cacheKey = `cms:catalog:${query ?? ""}:${limit}`;
  try {
    const cached = await redis.get<CmsCatalogDataset[]>(cacheKey);
    if (cached) return cached;
  } catch { /* ignore */ }

  const data = await fetchAuthoritativeJson<DataJson>(DATA_JSON, { timeoutMs: 20_000 });
  const q = query?.trim().toLowerCase();
  let rows = (data.dataset ?? [])
    .map((d) => ({
      identifier: String(d.identifier ?? ""),
      title: String(d.title ?? ""),
      landingPage: d.landingPage,
    }))
    .filter((d) => d.identifier && d.title);

  if (q) {
    rows = rows.filter((d) => d.title.toLowerCase().includes(q) || d.identifier.toLowerCase().includes(q));
  }

  const sliced = rows.slice(0, limit);
  try { await redis.set(cacheKey, sliced, { ex: CACHE_SECS }); } catch { /* ignore */ }
  return sliced;
}

function mapEnforcement(row: Record<string, string>): HptEnforcementAction {
  return {
    caseId: row.Case_ID ?? "",
    hospitalName: row.Hosp_Name ?? "",
    address: row.Hosp_Address ?? "",
    city: row.City ?? "",
    state: row.State ?? "",
    action: row.Action ?? "",
    dateOfAction: row.Date_of_Action ?? "",
  };
}

export async function listHptEnforcement(state = "NY", size = 50): Promise<HptEnforcementAction[]> {
  const cacheKey = `cms:hpt:${state}:${size}`;
  try {
    const cached = await redis.get<HptEnforcementAction[]>(cacheKey);
    if (cached) return cached;
  } catch { /* ignore */ }

  const url = `${HPT_ENFORCEMENT}?${new URLSearchParams({
    "filter[State]": state,
    size: String(size),
  })}`;
  const data = await fetchAuthoritativeJson<Record<string, string>[]>(url, { timeoutMs: 12_000 });
  const rows = (Array.isArray(data) ? data : []).map(mapEnforcement);
  try { await redis.set(cacheKey, rows, { ex: CACHE_SECS }); } catch { /* ignore */ }
  return rows;
}

export async function matchHptEnforcement(
  hospitalName: string,
  state = "NY",
): Promise<HptEnforcementAction[]> {
  const rows = await listHptEnforcement(state, 100);
  const needle = hospitalName.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  if (!needle) return [];
  const tokens = needle.split(/\s+/).filter((t) => t.length > 3);
  return rows.filter((row) => {
    const hay = row.hospitalName.toLowerCase().replace(/[^a-z0-9]+/g, " ");
    if (hay.includes(needle) || needle.includes(hay)) return true;
    const hits = tokens.filter((t) => hay.includes(t)).length;
    return hits >= Math.min(2, tokens.length);
  });
}
