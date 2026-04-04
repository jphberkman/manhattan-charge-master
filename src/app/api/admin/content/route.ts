import { prisma } from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";

/** GET — return all site content as Record<key, value> */
export async function GET() {
  const rows = await prisma.siteContent.findMany();
  const map: Record<string, string> = {};
  for (const row of rows) {
    map[row.key] = row.value;
  }
  return NextResponse.json(map);
}

/** PUT — upsert a single content entry */
export async function PUT(req: NextRequest) {
  const { key, value } = (await req.json()) as {
    key: string;
    value: string;
  };

  if (!key || typeof value !== "string") {
    return NextResponse.json(
      { error: "key and value are required" },
      { status: 400 },
    );
  }

  await prisma.siteContent.upsert({
    where: { key },
    update: { value },
    create: { key, value },
  });

  return NextResponse.json({ ok: true });
}
