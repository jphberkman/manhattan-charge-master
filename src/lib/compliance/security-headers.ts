import type { NextResponse } from "next/server";

/** Headers that support SOC 2 / HIPAA technical safeguards without breaking Next.js. */
export const SECURITY_HEADERS: Record<string, string> = {
  "Strict-Transport-Security": "max-age=63072000; includeSubDomains; preload",
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "SAMEORIGIN",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Permissions-Policy":
    "camera=(), geolocation=(), payment=(), usb=(), interest-cohort=()",
  "X-DNS-Prefetch-Control": "off",
  "Cross-Origin-Opener-Policy": "same-origin",
};

export function applySecurityHeaders(response: NextResponse): NextResponse {
  for (const [key, value] of Object.entries(SECURITY_HEADERS)) {
    response.headers.set(key, value);
  }
  return response;
}

export function nextConfigSecurityHeaders() {
  return Object.entries(SECURITY_HEADERS).map(([key, value]) => ({
    key,
    value,
  }));
}
