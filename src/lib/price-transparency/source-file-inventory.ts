import { createHash } from "crypto";
import { prisma } from "@/lib/prisma";

export function sha256Buffer(buf: Buffer): string {
  return createHash("sha256").update(buf).digest("hex");
}

export async function startSourceFile(input: {
  filename: string;
  bytes?: number;
  sha256?: string;
  format?: string;
  parser?: string;
}): Promise<string | null> {
  try {
    const row = await prisma.sourceFile.create({
      data: {
        filename: input.filename,
        bytes: input.bytes ?? null,
        sha256: input.sha256 ?? null,
        format: input.format ?? null,
        parser: input.parser ?? null,
        status: "processing",
      },
    });
    return row.id;
  } catch (err) {
    console.error("[source-file] start failed", err);
    return null;
  }
}

export async function finishSourceFile(
  id: string | null | undefined,
  input: {
    status: "processed" | "processed_with_warnings" | "failed";
    rowsInserted?: number;
    rowsRejected?: number;
    warningCount?: number;
    errorMessage?: string;
    parser?: string;
  },
): Promise<void> {
  if (!id) return;
  try {
    await prisma.sourceFile.update({
      where: { id },
      data: {
        status: input.status,
        rowsInserted: input.rowsInserted ?? 0,
        rowsRejected: input.rowsRejected ?? 0,
        warningCount: input.warningCount ?? 0,
        errorMessage: input.errorMessage ?? null,
        parser: input.parser,
        ingestedAt: new Date(),
      },
    });
  } catch (err) {
    console.error("[source-file] finish failed", err);
  }
}
