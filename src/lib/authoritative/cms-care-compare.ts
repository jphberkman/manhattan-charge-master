/**
 * CMS Provider Data Catalog — Hospital General Information (Care Compare).
 * Dataset: xubh-q36u
 * API: POST https://data.cms.gov/provider-data/api/1/datastore/query/xubh-q36u/0
 *
 * Only returns rows CMS actually publishes. Campuses without a distinct CCN stay unmatched.
 */

import { redis } from "@/lib/redis";
import { fetchAuthoritativeJson } from "./http";

const DATASTORE = "https://data.cms.gov/provider-data/api/1/datastore/query/xubh-q36u/0";
const CACHE_SECS = 86_400;

export interface CareCompareHospital {
  facilityId: string;
  facilityName: string;
  address: string;
  city: string;
  state: string;
  zip: string;
  phone: string;
  hospitalType: string;
  ownership: string;
  emergencyServices: string;
  overallRating: string;
  overallRatingFootnote: string;
}

interface DatastoreResponse {
  results?: Record<string, string>[];
  count?: number;
}

function mapRow(row: Record<string, string>): CareCompareHospital {
  return {
    facilityId: row.facility_id ?? "",
    facilityName: row.facility_name ?? "",
    address: row.address ?? "",
    city: row.citytown ?? "",
    state: row.state ?? "",
    zip: row.zip_code ?? "",
    phone: row.telephone_number ?? "",
    hospitalType: row.hospital_type ?? "",
    ownership: row.hospital_ownership ?? "",
    emergencyServices: row.emergency_services ?? "",
    overallRating: row.hospital_overall_rating ?? "",
    overallRatingFootnote: row.hospital_overall_rating_footnote ?? "",
  };
}

export async function getCareCompareByCcn(ccn: string): Promise<CareCompareHospital | null> {
  const id = ccn.trim();
  if (!id) return null;

  const cacheKey = `cms:cc:${id}`;
  try {
    const cached = await redis.get<CareCompareHospital | "miss">(cacheKey);
    if (cached === "miss") return null;
    if (cached) return cached;
  } catch { /* ignore */ }

  const body = {
    conditions: [{ property: "facility_id", operator: "=", value: id }],
    limit: 1,
  };
  const data = await fetchAuthoritativeJson<DatastoreResponse>(DATASTORE, {
    method: "POST",
    timeoutMs: 10_000,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const row = data.results?.[0];
  const mapped = row ? mapRow(row) : null;
  try {
    await redis.set(cacheKey, mapped ?? "miss", { ex: mapped ? CACHE_SECS : 3600 });
  } catch { /* ignore */ }
  return mapped;
}
