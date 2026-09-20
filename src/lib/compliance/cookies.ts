import { createHmac, timingSafeEqual } from "crypto";

export function sessionCookieOptions(maxAgeSeconds?: number) {
  const options: {
    httpOnly: boolean;
    secure: boolean;
    sameSite: "lax";
    path: string;
    maxAge?: number;
  } = {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
  };
  if (typeof maxAgeSeconds === "number") {
    options.maxAge = maxAgeSeconds;
  }
  return options;
}

export function siteAccessToken(sitePassword: string): string {
  const key = process.env.JWT_SECRET || sitePassword;
  return createHmac("sha256", key).update(`site-access:${sitePassword}`).digest("hex");
}

export function isValidSiteAccessCookie(
  cookieValue: string | undefined,
  sitePassword: string | undefined,
): boolean {
  if (!sitePassword) {
    return cookieValue === "open";
  }
  if (!cookieValue) return false;
  const expected = siteAccessToken(sitePassword);
  const a = Buffer.from(cookieValue);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}
