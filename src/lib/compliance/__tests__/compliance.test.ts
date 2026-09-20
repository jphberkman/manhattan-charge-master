import { describe, expect, test } from "vitest";
import { redactPhi, sanitizeSearchQuery } from "@/lib/compliance/phi";
import { SECURITY_HEADERS } from "@/lib/compliance/security-headers";
import { isValidSiteAccessCookie, siteAccessToken } from "@/lib/compliance/cookies";

describe("redactPhi", () => {
  test("redacts email, SSN, phone, MRN, and DOB", () => {
    const input =
      "Contact jane@hospital.org SSN 123-45-6789 phone 212-555-0199 MRN: A12B34 dob: 01/02/1980";
    const out = redactPhi(input);
    expect(out).not.toContain("jane@hospital.org");
    expect(out).not.toContain("123-45-6789");
    expect(out).not.toContain("212-555-0199");
    expect(out).toContain("[REDACTED-EMAIL]");
    expect(out).toContain("[REDACTED-SSN]");
    expect(out).toContain("[REDACTED-PHONE]");
    expect(out).toContain("[REDACTED-MRN]");
    expect(out).toContain("[REDACTED-DOB]");
  });

  test("keeps CPT and procedure search text", () => {
    expect(sanitizeSearchQuery("27447 total knee replacement")).toBe(
      "27447 total knee replacement",
    );
  });
});

describe("security headers", () => {
  test("includes HSTS and nosniff", () => {
    expect(SECURITY_HEADERS["Strict-Transport-Security"]).toContain("max-age=");
    expect(SECURITY_HEADERS["X-Content-Type-Options"]).toBe("nosniff");
    expect(SECURITY_HEADERS["Referrer-Policy"]).toBe("strict-origin-when-cross-origin");
  });
});

describe("site access cookie", () => {
  test("stores an HMAC instead of the password", () => {
    const token = siteAccessToken("super-secret");
    expect(token).not.toBe("super-secret");
    expect(token).toHaveLength(64);
    expect(isValidSiteAccessCookie(token, "super-secret")).toBe(true);
    expect(isValidSiteAccessCookie("super-secret", "super-secret")).toBe(false);
    expect(isValidSiteAccessCookie(token, "other")).toBe(false);
  });

  test("allows the open cookie only when no site password is set", () => {
    expect(isValidSiteAccessCookie("open", undefined)).toBe(true);
    expect(isValidSiteAccessCookie("open", "secret")).toBe(false);
  });
});
