-- Invoice email template (Phase B): per-org default subject + body for
-- the "Send via Email" flow on invoices. Null values fall back to the
-- hard-coded default in `send-invoice-dialog.tsx`.

ALTER TABLE "OrganizationPreference"
  ADD COLUMN IF NOT EXISTS "invoiceEmailSubject" TEXT,
  ADD COLUMN IF NOT EXISTS "invoiceEmailBody"    TEXT;
