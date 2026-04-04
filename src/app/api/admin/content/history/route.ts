import { isAdminRequest } from "@/lib/admin-auth";
import { prisma } from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";

/** GET — return recent content change history */
export async function GET(req: NextRequest) {
  if (!isAdminRequest(req)) {
    return NextResponse.json({ error: "Admin access required" }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const filterKey = searchParams.get("key");
  const limit = Math.min(Number(searchParams.get("limit") ?? 50), 200);

  const where = filterKey ? { key: filterKey } : {};

  const entries = await prisma.contentHistory.findMany({
    where,
    orderBy: { changedAt: "desc" },
    take: limit,
  });

  return NextResponse.json({ history: entries });
}
