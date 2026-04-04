import { isAdminRequest } from "@/lib/admin-auth";
import { prisma } from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";

/** POST — revert a content key to a previous value from history */
export async function POST(req: NextRequest) {
  if (!isAdminRequest(req)) {
    return NextResponse.json({ error: "Admin access required" }, { status: 403 });
  }

  const { key, historyId } = (await req.json()) as {
    key: string;
    historyId: string;
  };

  if (!key || !historyId) {
    return NextResponse.json(
      { error: "key and historyId are required" },
      { status: 400 },
    );
  }

  // Find the history entry
  const historyEntry = await prisma.contentHistory.findUnique({
    where: { id: historyId },
  });

  if (!historyEntry || historyEntry.key !== key) {
    return NextResponse.json(
      { error: "History entry not found or key mismatch" },
      { status: 404 },
    );
  }

  // Get current value before reverting
  const current = await prisma.siteContent.findUnique({ where: { key } });
  const currentValue = current?.value ?? "";

  // Revert to the old value from the history entry
  const revertTo = historyEntry.oldValue;

  await prisma.siteContent.upsert({
    where: { key },
    update: { value: revertTo, updatedBy: "admin" },
    create: { key, value: revertTo, updatedBy: "admin" },
  });

  // Log the revert as a new history entry
  const revertHistory = await prisma.contentHistory.create({
    data: {
      key,
      oldValue: currentValue,
      newValue: revertTo,
      changedBy: "admin (revert)",
    },
  });

  return NextResponse.json({ ok: true, history: revertHistory });
}
