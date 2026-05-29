import { Pool, neonConfig } from "@neondatabase/serverless";
import { PrismaNeon } from "@prisma/adapter-neon";
import { PrismaClient } from "@prisma/client";
import ws from "ws";

/**
 * Prisma client wiring.
 *
 * On Neon (prod) we use `@prisma/adapter-neon` so queries go over
 * fetch()-based HTTP instead of a long-lived TCP socket. That kills the
 * ~500ms-2s TLS-handshake-per-cold-function-instance penalty on Vercel
 * — the dominant remaining contributor to the "every nav is slow"
 * complaint after the cache() fix in #299.
 *
 * Everywhere else (CI's Playwright runner, local Docker Postgres,
 * self-hosted PG) we fall back to Prisma's default TCP driver. The HTTP
 * driver only speaks Neon's wire protocol, so pointing it at vanilla
 * Postgres makes every query throw — which is exactly what broke the
 * Playwright smoke job on the first attempt at this fix (PR #300).
 *
 * Detection is by hostname: any `DATABASE_URL` containing `.neon.tech`
 * uses the adapter, otherwise default Prisma client.
 */
const isNeonUrl =
  !!process.env.DATABASE_URL && /\.neon\.tech/i.test(process.env.DATABASE_URL);

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient | undefined };

function makeClient(): PrismaClient {
  const logLevels =
    process.env.NODE_ENV === "development"
      ? (["error", "warn"] as const)
      : (["error"] as const);

  if (isNeonUrl) {
    if (typeof WebSocket === "undefined") {
      neonConfig.webSocketConstructor = ws;
    }
    const pool = new Pool({ connectionString: process.env.DATABASE_URL });
    const adapter = new PrismaNeon(pool);
    return new PrismaClient({ adapter, log: [...logLevels] });
  }

  return new PrismaClient({ log: [...logLevels] });
}

export const db = globalForPrisma.prisma ?? makeClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = db;
