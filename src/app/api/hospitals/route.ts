import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET() {
  const hospitals = await prisma.hospital.findMany({
    orderBy: { name: "asc" },
    select: {
      id: true,
      name: true,
      address: true,
      borough: true,
      lastSeeded: true,
    },
  });
  return NextResponse.json(hospitals);
}
