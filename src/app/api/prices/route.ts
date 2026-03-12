import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const procedureId = searchParams.get("procedureId");
  const payerType = searchParams.get("payerType");
  const payerName = searchParams.get("payerName"); // insurer name for fuzzy match
  const priceType = searchParams.get("priceType");

  if (!procedureId) {
    return NextResponse.json(
      { error: "procedureId is required" },
      { status: 400 }
    );
  }

  const where: Record<string, unknown> = { procedureId };
  if (payerType && payerType !== "all") where.payerType = payerType;
  if (priceType && priceType !== "all") where.priceType = priceType;
  // Fuzzy match on payer name — extract the base insurer name (first word or known brand)
  if (payerName) {
    where.payerName = { contains: payerName.split(" ")[0] };
  }

  const entries = await prisma.priceEntry.findMany({
    where,
    include: {
      hospital: {
        select: { id: true, name: true, address: true },
      },
    },
    orderBy: { priceInCents: "asc" },
    take: 1000,
  });

  const data = entries.map((e) => ({
    id: e.id,
    hospital: e.hospital,
    payerName: e.payerName,
    payerType: e.payerType,
    priceUsd: e.priceInCents / 100,
    priceType: e.priceType,
  }));

  return NextResponse.json(data, {
    headers: { "Cache-Control": "s-maxage=3600, stale-while-revalidate=86400" },
  });
}
