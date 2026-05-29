import { Pool, neonConfig } from "@neondatabase/serverless";
import { PrismaNeon } from "@prisma/adapter-neon";
import { PrismaClient } from "@prisma/client";
import ws from "ws";

/**
 * Prisma client wired through Neon's HTTP serverless driver.
 *
 * Why: on Vercel's serverless runtime each cold function instance otherwise
 * opens a fresh TCP socket to Neon (TLS handshake + auth ping = ~500ms-2s
 * per cold start). The Neon HTTP driver uses `fetch()` instead, so every
 * query is a stateless HTTP call with effectively zero connection cost.
 * This was the dominant source of the 5-6s "every nav is slow" complaint.
 *
 * `neonConfig.webSocketConstructor = ws` is required on Node runtimes
 * (Vercel's default server runtime + local dev). On Edge runtimes the
 * global `WebSocket` is already available and this is a no-op.
 */
if (typeof WebSocket === "undefined") {
  neonConfig.webSocketConstructor = ws;
}

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient | undefined };

function makeClient() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const adapter = new PrismaNeon(pool);
  return new PrismaClient({
    adapter,
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
  });
}

export const db = globalForPrisma.prisma ?? makeClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = db;
