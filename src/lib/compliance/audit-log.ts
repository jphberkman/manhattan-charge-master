import { createHash } from "crypto";
import { prisma } from "@/lib/prisma";
import { redactPhi } from "./phi";

export type AuditAction =
  | "admin.login.success"
  | "admin.login.failure"
  | "admin.logout"
  | "admin.content.update"
  | "admin.data.upload"
  | "auth.signin"
  | "auth.signup";

function hashIp(ip: string | null | undefined): string {
  if (!ip) return "";
  const salt = process.env.JWT_SECRET || "audit-ip";
  return createHash("sha256").update(`${salt}:${ip}`).digest("hex").slice(0, 32);
}

export function clientIp(request: Request): string | undefined {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0]?.trim();
  return request.headers.get("x-real-ip") ?? undefined;
}

/** Append-only audit event. Never persist raw PHI or raw IPs. */
export function recordAuditEvent(input: {
  action: AuditAction;
  actor?: string;
  resource?: string;
  metadata?: Record<string, unknown>;
  request?: Request;
}): void {
  const metadata = JSON.stringify(
    Object.fromEntries(
      Object.entries(input.metadata ?? {}).map(([key, value]) => [
        key,
        typeof value === "string" ? redactPhi(value) : value,
      ]),
    ),
  );

  prisma.auditEvent
    .create({
      data: {
        action: input.action,
        actor: redactPhi(input.actor ?? "anonymous"),
        resource: redactPhi(input.resource ?? ""),
        metadata,
        ipHash: hashIp(input.request ? clientIp(input.request) : undefined),
      },
    })
    .catch(() => {
      // Audit must never break the request path.
    });
}
