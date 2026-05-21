/**
 * DOC-D3.1: Per-org inbox email token.
 *
 * The token is the URL-safe random local-part of the per-org Smart
 * Capture inbox address — e.g.
 *   <token>.secure@<INBOX_DOMAIN>
 *
 * Strategy:
 *   - Generate via Node crypto.randomBytes (24 bytes → 32-char base64url)
 *   - Stored on `Organization.inboxEmailToken` with a unique index
 *   - Generated lazily on first request — never auto-issued on org
 *     creation so unused orgs don't pollute the index
 *   - Rotatable: `rotateInboxToken` regenerates if the user thinks
 *     it's leaked (old address stops working immediately)
 */

import { randomBytes } from "node:crypto";
import { db } from "@/lib/db";

/**
 * Generate a fresh URL-safe random token. 24 bytes of entropy → 32
 * characters of base64url. More than enough to be unguessable, short
 * enough to type/share in support tickets.
 */
export function generateInboxToken(): string {
  return randomBytes(24)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

/**
 * Fetch the org's inbox token, generating + persisting one if it
 * doesn't exist yet. Concurrent calls are safe — the unique index
 * means a duplicate insert raises a known error which we recover
 * from by re-reading.
 */
export async function getOrCreateInboxToken(
  organizationId: string
): Promise<string> {
  const org = await db.organization.findUnique({
    where: { id: organizationId },
    select: { inboxEmailToken: true },
  });
  if (org?.inboxEmailToken) return org.inboxEmailToken;

  const token = generateInboxToken();
  try {
    await db.organization.update({
      where: { id: organizationId },
      data: { inboxEmailToken: token },
    });
    return token;
  } catch (err) {
    // Race: another request beat us to it. Re-read.
    console.warn("[inbox-token] race on token create", err);
    const fresh = await db.organization.findUnique({
      where: { id: organizationId },
      select: { inboxEmailToken: true },
    });
    if (fresh?.inboxEmailToken) return fresh.inboxEmailToken;
    throw err;
  }
}

/**
 * Rotate the token — replaces the existing one with a fresh value.
 * Old token stops resolving immediately so forwarded emails to the
 * old address bounce. Caller should warn the user.
 */
export async function rotateInboxToken(
  organizationId: string
): Promise<string> {
  const token = generateInboxToken();
  await db.organization.update({
    where: { id: organizationId },
    data: { inboxEmailToken: token },
  });
  return token;
}

/**
 * Build the full email address from a token + the configured inbox
 * domain (set via `INBOUND_EMAIL_DOMAIN` env var).
 *
 * Returns null when the domain isn't configured — Settings UI shows
 * the "Coming soon" hint in that case.
 */
export function buildInboxEmail(token: string): string | null {
  const domain = process.env.INBOUND_EMAIL_DOMAIN;
  if (!domain) return null;
  return `${token}.secure@${domain}`;
}

/**
 * Reverse: parse an inbound `to:` field and pull the token out.
 * Returns null when the address doesn't match our format. Tolerates
 * the `+suffix` plus-addressing convention many providers add.
 */
export function tokenFromInboxAddress(address: string): string | null {
  const domain = process.env.INBOUND_EMAIL_DOMAIN;
  if (!domain) return null;
  // Match `<token>(+suffix)?.secure@<domain>` case-insensitively.
  const re = new RegExp(
    `^([A-Za-z0-9_-]+)(?:\\+[^@]*)?\\.secure@${domain.replace(
      /\./g,
      "\\."
    )}$`,
    "i"
  );
  const m = address.trim().match(re);
  return m ? m[1] : null;
}
