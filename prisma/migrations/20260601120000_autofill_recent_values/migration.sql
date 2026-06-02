-- Autofill recent-values store backing the <HistoryInput> dropdown.
-- Idempotent: safe to re-run on already-migrated databases.

CREATE TABLE IF NOT EXISTS "RecentValue" (
    "id"             TEXT PRIMARY KEY,
    "organizationId" TEXT NOT NULL,
    "fieldKey"       TEXT NOT NULL,
    "value"          TEXT NOT NULL,
    "useCount"       INTEGER NOT NULL DEFAULT 1,
    "lastUsedAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "RecentValue_organizationId_fkey"
        FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "RecentValue_organizationId_fieldKey_value_key"
    ON "RecentValue"("organizationId", "fieldKey", "value");

CREATE INDEX IF NOT EXISTS "RecentValue_organizationId_fieldKey_lastUsedAt_idx"
    ON "RecentValue"("organizationId", "fieldKey", "lastUsedAt" DESC);
