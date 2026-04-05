import { PrismaClient } from "@/generated/prisma";

/**
 * Prisma client with Neon serverless adapter (WebSocket) when available,
 * falling back to standard TCP connection.
 */
function createPrismaClient() {
  const connectionString = process.env.DATABASE_URL!;

  // Try Neon serverless adapter for faster cold starts
  try {
    // Only use the adapter in production/serverless (not during builds or local dev)
    if (process.env.NODE_ENV === "production" || process.env.VERCEL) {
      const { neonConfig } = require("@neondatabase/serverless");
      const { PrismaNeon } = require("@prisma/adapter-neon");
      const ws = require("ws");

      neonConfig.webSocketConstructor = ws;

      // Strip PgBouncer params that the serverless driver doesn't understand
      const cleanUrl = connectionString
        .replace(/[?&]pgbouncer=true/g, "")
        .replace(/[?&]connect_timeout=\d+/g, "")
        .replace(/\?&/, "?")      // fix ?& if pgbouncer was first param
        .replace(/\?$/, "");       // remove trailing ?

      const adapter = new PrismaNeon({ connectionString: cleanUrl });
      return new PrismaClient({ adapter });
    }
  } catch (e) {
    console.warn("[Prisma] Neon serverless adapter failed, using standard connection:", e instanceof Error ? e.message : e);
  }

  // Fallback: standard Prisma TCP connection
  return new PrismaClient();
}

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
