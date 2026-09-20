import { NextResponse } from "next/server";
import { SHOPPER_HOSPITALS } from "@/lib/price-transparency/shopper-hospitals";

/** Consumer hospital list: founder-approved shopper facilities only. */
export async function GET() {
  return NextResponse.json(
    SHOPPER_HOSPITALS.map((h) => ({
      id: h.id,
      name: h.name,
      address: h.address,
      system: h.system,
      cmsCcn: h.cmsCcn,
      cmsFacilityName: h.cmsFacilityName,
    })),
    {
      headers: { "Cache-Control": "s-maxage=3600, stale-while-revalidate=86400" },
    },
  );
}
