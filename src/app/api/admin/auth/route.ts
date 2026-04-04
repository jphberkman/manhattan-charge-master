import { COOKIE_NAME, COOKIE_VALUE } from "@/lib/admin-auth";
import { NextRequest, NextResponse } from "next/server";

const DEFAULT_PASSWORD = "shopforcare-admin-2026";

/** POST — authenticate admin */
export async function POST(req: NextRequest) {
  const { password } = (await req.json()) as { password: string };
  const expected = process.env.ADMIN_PASSWORD ?? DEFAULT_PASSWORD;

  if (password !== expected) {
    return NextResponse.json({ error: "Wrong password" }, { status: 401 });
  }

  const res = NextResponse.json({ ok: true });
  res.cookies.set(COOKIE_NAME, COOKIE_VALUE, {
    httpOnly: true,
    path: "/",
    maxAge: 60 * 60 * 24, // 24 hours
    sameSite: "lax",
  });
  return res;
}

/** DELETE — logout admin */
export async function DELETE() {
  const res = NextResponse.json({ ok: true });
  res.cookies.set(COOKIE_NAME, "", {
    httpOnly: true,
    path: "/",
    maxAge: 0,
  });
  return res;
}
