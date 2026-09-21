/**
 * CMS Procedure Price Lookup — fail closed without CMS apiKey + AMA license.
 * Official API: https://developer.cms.gov/ppl-api/
 * Base: https://www.medicare.gov/api/procedure-price-lookup/api/v1/core
 *
 * ShopForCare does not have an AMA CPT license. Do not call unofficial URLs.
 */

import { AuthoritativeHttpError, fetchAuthoritativeText } from "./http";

const PPL_CORE = "https://www.medicare.gov/api/procedure-price-lookup/api/v1/core";

export type PplLookupStatus = "unavailable" | "unauthorized" | "error" | "ok";

export interface PplLookupResult {
  status: PplLookupStatus;
  configured: boolean;
  reason: string;
  httpStatus: number | null;
  data: unknown | null;
}

export function isPplConfigured(): boolean {
  return Boolean(process.env.CMS_PPL_API_KEY?.trim() && process.env.AMA_CPT_LICENSE?.trim());
}

const UNAVAILABLE_REASON =
  "CMS Procedure Price Lookup requires a CMS-issued apiKey and an AMA CPT license header. ShopForCare has no AMA license, so PPL is not called.";

export async function lookupProcedurePrice(
  hcpcsCode: string,
): Promise<PplLookupResult> {
  const code = hcpcsCode.trim();
  if (!code) {
    return {
      status: "error",
      configured: isPplConfigured(),
      reason: "Missing HCPCS/CPT code",
      httpStatus: null,
      data: null,
    };
  }

  if (!isPplConfigured()) {
    return {
      status: "unavailable",
      configured: false,
      reason: UNAVAILABLE_REASON,
      httpStatus: null,
      data: null,
    };
  }

  const url = `${PPL_CORE}/prices?hcpcs_code=${encodeURIComponent(code)}`;
  try {
    const { status, ok, text } = await fetchAuthoritativeText(url, {
      timeoutMs: 10_000,
      headers: {
        apiKey: process.env.CMS_PPL_API_KEY!.trim(),
        amaLicense: process.env.AMA_CPT_LICENSE!.trim(),
        accept: "application/json",
      },
    });

    if (status === 401 || status === 403) {
      return {
        status: "unauthorized",
        configured: true,
        reason: "PPL rejected the request (401/403). No Medicare PPL amounts will be shown.",
        httpStatus: status,
        data: null,
      };
    }

    if (!ok) {
      return {
        status: "error",
        configured: true,
        reason: `PPL HTTP ${status}`,
        httpStatus: status,
        data: null,
      };
    }

    let data: unknown = null;
    try {
      data = JSON.parse(text);
    } catch {
      return {
        status: "error",
        configured: true,
        reason: "PPL returned non-JSON",
        httpStatus: status,
        data: null,
      };
    }

    return {
      status: "ok",
      configured: true,
      reason: "PPL response from medicare.gov (Medicare outpatient/ASC averages, not hospital chargemaster).",
      httpStatus: status,
      data,
    };
  } catch (err) {
    const httpStatus = err instanceof AuthoritativeHttpError ? err.status : null;
    return {
      status: "error",
      configured: true,
      reason: err instanceof Error ? err.message : "PPL request failed",
      httpStatus,
      data: null,
    };
  }
}

export function pplUnavailableResult(): PplLookupResult {
  return {
    status: "unavailable",
    configured: false,
    reason: UNAVAILABLE_REASON,
    httpStatus: null,
    data: null,
  };
}
