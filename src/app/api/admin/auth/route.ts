import { COOKIE_NAME, COOKIE_VALUE } from "@/lib/admin-auth";
import { NextRequest, NextResponse } from "next/server";
import { recordAuditEvent } from "@/lib/compliance/audit-log";
import { sessionCookieOptions } from "@/lib/compliance/cookies";
import { DEFAULT_ADMIN_PASSWORD } from "@/lib/compliance/secrets";

/** POST — authenticate admin */
export async function POST(req: NextRequest) {
  const { password } = (await req.json()) as { password: string };
  const expected = process.env.ADMIN_PASSWORD ?? DEFAULT_ADMIN_PASSWORD;

  if (process.env.NODE_ENV === "production" && expected === DEFAULT_ADMIN_PASSWORD) {
    return NextResponse.json(
      { error: "Admin login is disabled until ADMIN_PASSWORD is configured" },
      { status: 503 },
    );
  }

  if (password !== expected) {
    recordAuditEvent({ action: "admin.login.failure", request: req });
    return NextResponse.json({ error: "Wrong password" }, { status: 401 });
  }

  recordAuditEvent({ action: "admin.login.success", actor: "admin", request: req });

  const res = NextResponse.json({ ok: true });
  const cookieOpts = sessionCookieOptions(60 * 60 * 24);
  // Auth cookie (httpOnly — server-side API protection)
  res.cookies.set(COOKIE_NAME, COOKIE_VALUE, cookieOpts);
  // Client-readable flag (not httpOnly — so JS can detect admin mode)
  res.cookies.set("admin-mode", "true", {
    ...cookieOpts,
    httpOnly: false,
  });
  return res;
}

/** DELETE — logout admin */
export async function DELETE(req: NextRequest) {
  recordAuditEvent({ action: "admin.logout", actor: "admin", request: req });
  const res = NextResponse.json({ ok: true });
  const expired = sessionCookieOptions(0);
  res.cookies.set(COOKIE_NAME, "", expired);
  res.cookies.set("admin-mode", "", { ...expired, httpOnly: false });
  return res;
}
