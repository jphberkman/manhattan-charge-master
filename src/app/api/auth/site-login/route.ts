import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  const { password } = await req.json();
  const sitePassword = process.env.SITE_PASSWORD;

  if (!sitePassword) {
    // No password set — allow access (local dev)
    const res = NextResponse.json({ ok: true });
    res.cookies.set("site-access", "open", { httpOnly: true, path: "/", maxAge: 60 * 60 * 24 * 30 });
    return res;
  }

  if (password !== sitePassword) {
    return NextResponse.json({ error: "Wrong password" }, { status: 401 });
  }

  const res = NextResponse.json({ ok: true });
  res.cookies.set("site-access", sitePassword, {
    httpOnly: true,
    path: "/",
    maxAge: 60 * 60 * 24 * 30, // 30 days
    sameSite: "lax",
  });
  return res;
}
