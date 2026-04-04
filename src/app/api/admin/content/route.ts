import { isAdminRequest } from "@/lib/admin-auth";
import { CONTENT_REGISTRY, type ContentField } from "@/lib/content-registry";
import { prisma } from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";

// ── GET — return all content + grouped by page ──────────────────────────────

export async function GET() {
  const rows = await prisma.siteContent.findMany();
  const content: Record<string, string> = {};
  const updatedAtMap: Record<string, string> = {};
  for (const row of rows) {
    content[row.key] = row.value;
    updatedAtMap[row.key] = row.updatedAt.toISOString();
  }

  // Group by page → section
  const grouped: Record<string, Array<ContentField & { value: string; updatedAt: string | null }>> = {};
  for (const field of CONTENT_REGISTRY) {
    if (!grouped[field.page]) grouped[field.page] = [];
    grouped[field.page].push({
      ...field,
      value: content[field.key] ?? "",
      updatedAt: updatedAtMap[field.key] ?? null,
    });
  }

  return NextResponse.json({ content, grouped });
}

// ── PUT — upsert a single content entry with history logging (admin only) ───

export async function PUT(req: NextRequest) {
  if (!isAdminRequest(req)) {
    return NextResponse.json({ error: "Admin access required" }, { status: 403 });
  }

  const { key, value } = (await req.json()) as { key: string; value: string };

  if (!key || typeof value !== "string") {
    return NextResponse.json({ error: "key and value are required" }, { status: 400 });
  }

  // Fetch old value for history
  const existing = await prisma.siteContent.findUnique({ where: { key } });
  const oldValue = existing?.value ?? "";

  // Upsert the content
  await prisma.siteContent.upsert({
    where: { key },
    update: { value, updatedBy: "admin" },
    create: { key, value, updatedBy: "admin" },
  });

  // Log history (only if value actually changed)
  let historyEntry = null;
  if (oldValue !== value) {
    historyEntry = await prisma.contentHistory.create({
      data: { key, oldValue, newValue: value, changedBy: "admin" },
    });
  }

  return NextResponse.json({ ok: true, history: historyEntry });
}
