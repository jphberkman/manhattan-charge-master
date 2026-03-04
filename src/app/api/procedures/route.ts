import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const q = searchParams.get("q")?.trim() ?? "";

  const procedures = await prisma.procedure.findMany({
    where: q
      ? {
          OR: [
            { name: { contains: q } },
            { cptCode: { contains: q } },
            { category: { contains: q } },
          ],
        }
      : undefined,
    orderBy: [{ category: "asc" }, { name: "asc" }],
    select: {
      id: true,
      cptCode: true,
      name: true,
      category: true,
      description: true,
    },
  });

  return NextResponse.json(procedures);
}
