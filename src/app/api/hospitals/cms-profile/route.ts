import { NextRequest, NextResponse } from "next/server";
import { getCareCompareByCcn } from "@/lib/authoritative/cms-care-compare";
import { listCmsCatalog, matchHptEnforcement } from "@/lib/authoritative/cms-data-api";
import { getShopperHospital } from "@/lib/price-transparency/shopper-hospitals";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("id")?.trim();
  const ccnParam = req.nextUrl.searchParams.get("ccn")?.trim();

  const hospital = id ? getShopperHospital(id) : undefined;
  if (id && !hospital) {
    return NextResponse.json({ error: "Unknown shopper hospital id" }, { status: 404 });
  }
  if (!id && !ccnParam) {
    return NextResponse.json({ error: "Missing id or ccn" }, { status: 400 });
  }

  const ccn = ccnParam || hospital?.cmsCcn || null;
  const nameForHpt = hospital?.name ?? hospital?.cmsFacilityName ?? "";

  try {
    const [careCompare, hpt, catalog] = await Promise.all([
      ccn ? getCareCompareByCcn(ccn) : Promise.resolve(null),
      nameForHpt ? matchHptEnforcement(hospital?.cmsFacilityName || hospital?.name || "") : Promise.resolve([]),
      listCmsCatalog(8, "hospital"),
    ]);

    return NextResponse.json({
      shopperHospital: hospital ?? null,
      cmsCcn: ccn,
      careCompare,
      hptEnforcement: hpt,
      cmsCatalogSample: catalog,
      notes: [
        careCompare
          ? "Care Compare row is official CMS Hospital General Information."
          : ccn
            ? "No Care Compare Hospital General Information row for this CCN."
            : "No CMS CCN on file for this campus; CMS does not publish a distinct facility_id we could prove.",
        "HPT enforcement rows are historical CMS actions, not a live compliance score.",
        "Catalog sample is from data.cms.gov/data.json (CMS Data API inventory).",
      ],
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "CMS profile failed" },
      { status: 502 },
    );
  }
}
