import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { verifySession } from "@/lib/auth";

// Paths that require the site-wide password
const SITE_GATED_PATHS = [
  "/hospital-prices",
  "/api/prices",
  "/api/hospitals",
  "/api/physicians",
  "/api/procedure-breakdown",
  "/api/upload",
];

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // ── Site-wide password gate ──────────────────────────────────────────────
  const sitePassword = process.env.SITE_PASSWORD;
  if (sitePassword) {
    const isSiteGated = SITE_GATED_PATHS.some((p) => pathname.startsWith(p));
    if (isSiteGated) {
      const cookie = request.cookies.get("site-access");
      const isAuthed = cookie?.value === sitePassword;
      if (!isAuthed) {
        // API routes return 401; page routes redirect to /login
        if (pathname.startsWith("/api/")) {
          return NextResponse.json({ error: "Access denied" }, { status: 401 });
        }
        const loginUrl = new URL("/login", request.url);
        loginUrl.searchParams.set("next", pathname);
        return NextResponse.redirect(loginUrl);
      }
    }
  }

  // ── Auth-protected API routes ────────────────────────────────────────────
  const session = await verifySession(request);
  const protectedPaths = ["/api/projects", "/api/filesystem"];
  const isProtectedPath = protectedPaths.some((path) => pathname.startsWith(path));
  if (isProtectedPath && !session) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - public folder
     */
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};