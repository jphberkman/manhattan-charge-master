import { NextRequest, NextResponse } from "next/server";
import { sessionCookieOptions, siteAccessToken } from "@/lib/compliance/cookies";

export async function POST(req: NextRequest) {
  const { password } = await req.json();
  const sitePassword = process.env.SITE_PASSWORD;
  const cookieOpts = sessionCookieOptions(60 * 60 * 24 * 30);

  if (!sitePassword) {
    // No password set — allow access (local dev)
    const res = NextResponse.json({ ok: true });
    res.cookies.set("site-access", "open", cookieOpts);
    return res;
  }

  if (password !== sitePassword) {
    return NextResponse.json({ error: "Wrong password" }, { status: 401 });
  }

  const res = NextResponse.json({ ok: true });
  res.cookies.set("site-access", siteAccessToken(sitePassword), cookieOpts);
  return res;
}
