import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const revalidate = 3600; // cache 1 hour — procedures change only when seeder runs

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
    take: q ? 50 : 200,
    select: {
      id: true,
      cptCode: true,
      name: true,
      category: true,
      description: true,
    },
  });

  return NextResponse.json(procedures, {
    headers: { "Cache-Control": "s-maxage=3600, stale-while-revalidate=86400" },
  });
}
