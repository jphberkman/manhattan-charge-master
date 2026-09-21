import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getShopperHospital, SHOPPER_HOSPITALS } from "@/lib/price-transparency/shopper-hospitals";
import { getPriceSummariesForCode } from "@/lib/price-transparency/price-read-model";

export const dynamic = "force-dynamic";

function dollars(cents: number | null | undefined): number | null {
  return cents == null ? null : Math.round(cents / 100);
}

/**
 * Skinny CPT + hospital lookup against PriceIndex (warehouse-backed).
 *   GET /api/prices?cpt=27447
 *   GET /api/prices?cpt=27447&hospital=hhc-bellevue
 *
 * Legacy: GET /api/prices?procedureId=… still exists for older clients.
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const cpt = (searchParams.get("cpt") || searchParams.get("cptCode") || "").trim();
  const hospitalId = (searchParams.get("hospital") || searchParams.get("hospitalId") || "").trim();

  if (cpt) {
    const shopper = hospitalId ? getShopperHospital(hospitalId) : null;
    if (hospitalId && !shopper) {
      return NextResponse.json({ error: "Unknown hospital id" }, { status: 400 });
    }

    if (hospitalId) {
      const row = await prisma.priceIndex.findUnique({
        where: { hospitalId_code: { hospitalId, code: cpt } },
      });
      if (!row) {
        return NextResponse.json({
          cpt,
          hospital: { id: shopper!.id, name: shopper!.name, address: shopper!.address },
          list: null,
          cash: null,
          negotiated: null,
          asOf: null,
          warehouseObjectKey: null,
          source: "price-index",
        });
      }
      return NextResponse.json({
        cpt,
        hospital: { id: shopper!.id, name: shopper!.name, address: shopper!.address },
        list: dollars(row.listCents),
        cash: dollars(row.cashCents),
        negotiated: dollars((row as { commercialCents?: number | null }).commercialCents ?? null),
        commercial: dollars((row as { commercialCents?: number | null }).commercialCents ?? null),
        medicare: dollars((row as { medicareCents?: number | null }).medicareCents ?? null),
        medicaid: dollars((row as { medicaidCents?: number | null }).medicaidCents ?? null),
        negotiatedMin: dollars(row.negotiatedMinCents),
        negotiatedMax: dollars(row.negotiatedMaxCents),
        description: row.description,
        asOf: row.asOf?.toISOString() ?? null,
        warehouseObjectKey: row.objectKey,
        source: "price-index",
      });
    }

    const summaries = await getPriceSummariesForCode(cpt);
    const hospitals = summaries.map((s) => {
      const h = getShopperHospital(s.hospitalId);
      return {
        hospital: h
          ? { id: h.id, name: h.name, address: h.address }
          : { id: s.hospitalId, name: s.hospitalId, address: "" },
        list: s.grossMedian,
        cash: s.cashMedian,
        negotiated: s.negotiatedMedianByClass.commercial ?? null,
        commercial: s.negotiatedMedianByClass.commercial ?? null,
        medicare: s.negotiatedMedianByClass.medicare ?? null,
        medicaid: s.negotiatedMedianByClass.medicaid ?? null,
        publishedMin: s.minDollars,
        publishedMax: s.maxDollars,
        asOf: s.latestAsOf,
        warehouseObjectKey: s.warehouseObjectKey ?? null,
      };
    });
    return NextResponse.json({
      cpt,
      hospitals,
      shopperHospitalCount: SHOPPER_HOSPITALS.length,
      source: summaries.some((s) => s.warehouseObjectKey) ? "price-index" : "price-summary",
    });
  }

  const procedureId = searchParams.get("procedureId");
  const payerType = searchParams.get("payerType");
  const payerName = searchParams.get("payerName");
  const priceType = searchParams.get("priceType");

  if (!procedureId) {
    return NextResponse.json(
      { error: "cpt or procedureId is required" },
      { status: 400 },
    );
  }

  const where: Record<string, unknown> = { procedureId };
  if (payerType && payerType !== "all") where.payerType = payerType;
  if (priceType && priceType !== "all") where.priceType = priceType;
  if (payerName) {
    where.payerName = { contains: payerName.split(" ")[0] };
  }

  const entries = await prisma.priceEntry.findMany({
    where,
    include: {
      hospital: {
        select: { id: true, name: true, address: true, lastSeeded: true, sourceFile: true },
      },
    },
    orderBy: { priceInCents: "asc" },
    take: 1000,
  });

  const data = entries.map((e) => ({
    id: e.id,
    hospital: { id: e.hospital.id, name: e.hospital.name, address: e.hospital.address },
    payerName: e.payerName,
    payerType: e.payerType,
    priceUsd: e.priceInCents / 100,
    priceType: e.priceType,
    source: e.source,
    dataLastUpdated: e.hospital.lastSeeded?.toISOString() ?? null,
    hospitalSourceFile: e.hospital.sourceFile ?? null,
  }));

  return NextResponse.json(data, {
    headers: { "Cache-Control": "s-maxage=3600, stale-while-revalidate=86400" },
  });
}
