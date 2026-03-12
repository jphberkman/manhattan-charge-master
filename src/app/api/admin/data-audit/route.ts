import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET() {
  const [hospitals, procedureCount, priceCount, pricesByType, pricesByHospital, samplePrices] =
    await Promise.all([
      // All hospitals with their price entry counts
      prisma.hospital.findMany({
        select: {
          name: true,
          sourceFile: true,
          lastSeeded: true,
          _count: { select: { prices: true } },
        },
        orderBy: { name: "asc" },
      }),

      // Total unique procedures
      prisma.procedure.count(),

      // Total price entries
      prisma.priceEntry.count(),

      // Breakdown by price type
      prisma.priceEntry.groupBy({
        by: ["priceType"],
        _count: { id: true },
        _avg: { priceInCents: true },
        _min: { priceInCents: true },
        _max: { priceInCents: true },
        orderBy: { _count: { id: "desc" } },
      }),

      // Price entries per hospital
      prisma.priceEntry.groupBy({
        by: ["hospitalId"],
        _count: { id: true },
        _avg: { priceInCents: true },
      }),

      // Sample of high-value procedures to sanity-check
      prisma.procedure.findMany({
        where: {
          OR: [
            { name: { contains: "knee", mode: "insensitive" } },
            { name: { contains: "hip", mode: "insensitive" } },
            { name: { contains: "colonoscopy", mode: "insensitive" } },
            { name: { contains: "cataract", mode: "insensitive" } },
            { name: { contains: "appendectomy", mode: "insensitive" } },
            { name: { contains: "cholecystectomy", mode: "insensitive" } },
          ],
        },
        select: {
          cptCode: true,
          name: true,
          prices: {
            select: {
              priceInCents: true,
              priceType: true,
              payerType: true,
              payerName: true,
              hospital: { select: { name: true } },
            },
            orderBy: { priceInCents: "asc" },
            take: 20,
          },
        },
        take: 20,
      }),
    ]);

  const fmt = (cents: number | null) =>
    cents != null ? `$${Math.round(cents / 100).toLocaleString()}` : "—";

  return NextResponse.json({
    summary: {
      hospitals: hospitals.length,
      procedures: procedureCount,
      priceEntries: priceCount,
    },
    hospitals: hospitals.map((h) => ({
      name: h.name,
      sourceFile: h.sourceFile,
      lastSeeded: h.lastSeeded,
      priceEntries: h._count.prices,
    })),
    byPriceType: pricesByType.map((r) => ({
      priceType: r.priceType,
      count: r._count.id,
      avgPrice: fmt(r._avg.priceInCents ?? null),
      minPrice: fmt(r._min.priceInCents ?? null),
      maxPrice: fmt(r._max.priceInCents ?? null),
    })),
    spotChecks: samplePrices.map((p) => ({
      cptCode: p.cptCode,
      name: p.name,
      priceCount: p.prices.length,
      prices: p.prices.slice(0, 5).map((e) => ({
        hospital: e.hospital.name,
        payer: e.payerName,
        payerType: e.payerType,
        priceType: e.priceType,
        price: fmt(e.priceInCents),
      })),
    })),
  });
}
