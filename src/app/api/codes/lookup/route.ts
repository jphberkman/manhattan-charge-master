import { NextRequest, NextResponse } from "next/server";
import { classifyMedicalCode, type MedicalCodeKind } from "@/lib/authoritative/code-kind";
import { lookupAuthoritativeCodes } from "@/lib/authoritative/lookup";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get("q")?.trim() ?? "";
  const kindParam = req.nextUrl.searchParams.get("kind")?.trim() ?? "auto";
  const includeRx = req.nextUrl.searchParams.get("rx") === "1";
  if (!q) {
    return NextResponse.json({ error: "Missing q" }, { status: 400 });
  }

  const allowed: Array<MedicalCodeKind | "auto"> = [
    "auto",
    "icd10-cm",
    "hcpcs-level-2",
    "cpt-shaped",
    "unknown",
  ];
  const kind = (allowed.includes(kindParam as MedicalCodeKind | "auto")
    ? kindParam
    : "auto") as MedicalCodeKind | "auto";

  try {
    const result = await lookupAuthoritativeCodes(q, kind === "unknown" ? classifyMedicalCode(q) : kind, {
      includeRxTerms: includeRx,
    });
    return NextResponse.json(result, {
      headers: { "Cache-Control": "s-maxage=3600, stale-while-revalidate=86400" },
    });
  } catch (err) {
    return NextResponse.json(
      {
        error: err instanceof Error ? err.message : "Lookup failed",
        query: q,
      },
      { status: 502 },
    );
  }
}
