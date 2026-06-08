/**
 * Guardrail 8 — tiny in-process TTL cache for read-only Copilot
 * tool results.
 *
 * Sized + scoped for v1:
 *   - In-memory only (per Lambda instance). Vercel cold-starts
 *     drop the cache; that's fine — first request pays full cost,
 *     subsequent requests on the same warm instance hit cache.
 *   - 5-minute TTL. Forecast data changes when invoices/bills
 *     change; a 5-min staleness window is acceptable for a
 *     conversational AI summary use case.
 *   - 200-entry LRU cap. Each entry is ~5KB of JSON; cap is
 *     ~1MB of process memory at worst.
 *   - Keyed by (orgId, toolName, sha-1 of input). Org isolation
 *     enforced by key construction — no risk of cross-tenant
 *     leakage.
 *
 * Phase 2 will swap this for Vercel KV / Upstash Redis when we
 * outgrow per-instance caching. The shape `{get, set}` matches
 * Redis so the swap is a single-file change.
 */

import { createHash } from "node:crypto";

const MAX_ENTRIES = 200;
const DEFAULT_TTL_MS = 5 * 60 * 1000; // 5 minutes

type Entry = { value: unknown; expiresAt: number };
const store = new Map<string, Entry>();

function key(organizationId: string, toolName: string, input: unknown): string {
  const stable = JSON.stringify(input, Object.keys(input ?? {}).sort());
  const hash = createHash("sha1").update(stable).digest("hex").slice(0, 16);
  return `${organizationId}:${toolName}:${hash}`;
}

/** LRU eviction — when over cap, drop the oldest insertion. */
function evictIfFull() {
  while (store.size > MAX_ENTRIES) {
    const oldest = store.keys().next().value;
    if (oldest === undefined) break;
    store.delete(oldest);
  }
}

export function getCachedToolResult<T = unknown>(
  organizationId: string,
  toolName: string,
  input: unknown
): T | undefined {
  const k = key(organizationId, toolName, input);
  const entry = store.get(k);
  if (!entry) return undefined;
  if (entry.expiresAt < Date.now()) {
    store.delete(k);
    return undefined;
  }
  // Move to "most recent" by re-inserting (Map preserves insertion order).
  store.delete(k);
  store.set(k, entry);
  return entry.value as T;
}

export function setCachedToolResult(
  organizationId: string,
  toolName: string,
  input: unknown,
  value: unknown,
  ttlMs: number = DEFAULT_TTL_MS
): void {
  const k = key(organizationId, toolName, input);
  store.set(k, { value, expiresAt: Date.now() + ttlMs });
  evictIfFull();
}

/** Test/diagnostic helper — clear the entire cache. */
export function _clearCacheForTests(): void {
  store.clear();
}

/** Test/diagnostic helper — current entry count. */
export function _cacheSizeForTests(): number {
  return store.size;
}
