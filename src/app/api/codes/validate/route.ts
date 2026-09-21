import { NextRequest, NextResponse } from "next/server";
import { validateAuthoritativeCode } from "@/lib/authoritative/lookup";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get("code")?.trim() ?? "";
  if (!code) {
    return NextResponse.json({ error: "Missing code" }, { status: 400 });
  }
  try {
    const result = await validateAuthoritativeCode(code);
    return NextResponse.json(result, {
      headers: { "Cache-Control": "s-maxage=3600, stale-while-revalidate=86400" },
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Validate failed", code },
      { status: 502 },
    );
  }
}
