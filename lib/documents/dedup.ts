/**
 * DOC-D1.3: SHA-256 file-hash helpers for upload dedup.
 *
 * Pure functions — no DB / Prisma dependency in `sha256Buffer` so it
 * can be re-used wherever (server actions, future workers, etc.).
 *
 * Storage strategy: we persist the hex digest in `Document.fileHash`
 * and lookup duplicates via the org-scoped index
 * `(organizationId, fileHash)`. Re-uploading an identical file is
 * common (users re-export the same bank statement; same vendor
 * invoice PDF arrives twice) — we surface the existing row instead of
 * re-uploading to Vercel Blob.
 *
 * Why SHA-256: widely available in Node's `crypto` module, no native
 * deps, collision-resistant beyond practical concern for org-scoped
 * dedup. Matches the algorithm used by every popular dedup system
 * (Dropbox / git / etc) — "primitive and widely used".
 */

import { createHash } from "node:crypto";

/**
 * Compute the SHA-256 hex digest of a Node Buffer or Uint8Array.
 * Returns 64-character lowercase hex.
 */
export function sha256Buffer(buf: Buffer | Uint8Array): string {
  const hash = createHash("sha256");
  hash.update(buf);
  return hash.digest("hex");
}

/**
 * Type-narrow + validate a string is a SHA-256 hex digest. Used at
 * trust boundaries (e.g. an API endpoint receiving a hash from the
 * client) to reject garbage before DB lookups.
 */
export function isSha256Hex(s: unknown): s is string {
  return typeof s === "string" && /^[a-f0-9]{64}$/.test(s);
}

/**
 * Friendly "you already uploaded …" message builder. Keeps the
 * formatting consistent across UI surfaces (dialog warning, toast
 * etc.) and out of UI components.
 */
export function dupWarning(existingName: string, uploadedAt: Date): string {
  const date = uploadedAt.toLocaleDateString(undefined, {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
  return `You already uploaded "${existingName}" on ${date}.`;
}
