-- M17a: Invoices Refinement Patch — additive only.
-- Adds per-line accountId override on 5 line-item models, plus 7 new tables
-- supporting Razorpay, saved views, custom fields, user prefs, debit notes.

-- 1. Per-line accountId override on existing line-item tables
ALTER TABLE "InvoiceLineItem"        ADD COLUMN "accountId" TEXT;
ALTER TABLE "QuoteLineItem"          ADD COLUMN "accountId" TEXT;
ALTER TABLE "SalesOrderLineItem"     ADD COLUMN "accountId" TEXT;
ALTER TABLE "DeliveryChallanLineItem" ADD COLUMN "accountId" TEXT;
ALTER TABLE "CreditNoteLineItem"     ADD COLUMN "accountId" TEXT;

-- 2. PaymentGatewayConfig — Razorpay config per organization
CREATE TABLE "PaymentGatewayConfig" (
  "id"                             TEXT        NOT NULL PRIMARY KEY,
  "organizationId"                 TEXT        NOT NULL,
  "razorpayEnabled"                BOOLEAN     NOT NULL DEFAULT false,
  "razorpayKeyId"                  TEXT,
  "razorpayKeySecretEncrypted"     TEXT,
  "razorpayWebhookSecretEncrypted" TEXT,
  "razorpayMode"                   TEXT        NOT NULL DEFAULT 'test',
  "razorpayActivatedAt"            TIMESTAMP(3),
  "cardVerificationEnabled"        BOOLEAN     NOT NULL DEFAULT false,
  "createdAt"                      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"                      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX "PaymentGatewayConfig_organizationId_key" ON "PaymentGatewayConfig"("organizationId");

-- 3. RazorpayPaymentAttempt — order/payment lifecycle log
CREATE TABLE "RazorpayPaymentAttempt" (
  "id"                TEXT          NOT NULL PRIMARY KEY,
  "organizationId"    TEXT          NOT NULL,
  "invoiceId"         TEXT          NOT NULL,
  "razorpayOrderId"   TEXT          NOT NULL,
  "razorpayPaymentId" TEXT,
  "amount"            DECIMAL(18,4) NOT NULL,
  "currency"          TEXT          NOT NULL,
  "status"            TEXT          NOT NULL DEFAULT 'CREATED',
  "failureReason"     TEXT,
  "webhookPayload"    JSONB,
  "signatureVerified" BOOLEAN       NOT NULL DEFAULT false,
  "paymentReceivedId" TEXT,
  "createdAt"         TIMESTAMP(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"         TIMESTAMP(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX "RazorpayPaymentAttempt_razorpayOrderId_key"   ON "RazorpayPaymentAttempt"("razorpayOrderId");
CREATE UNIQUE INDEX "RazorpayPaymentAttempt_razorpayPaymentId_key" ON "RazorpayPaymentAttempt"("razorpayPaymentId");
CREATE INDEX        "RazorpayPaymentAttempt_org_invoice_idx"       ON "RazorpayPaymentAttempt"("organizationId", "invoiceId");

-- 4. SavedView — saved list-view filters per (org × user × module)
CREATE TABLE "SavedView" (
  "id"             TEXT         NOT NULL PRIMARY KEY,
  "organizationId" TEXT         NOT NULL,
  "userId"         TEXT,
  "module"         TEXT         NOT NULL,
  "name"           TEXT         NOT NULL,
  "filterJson"     JSONB        NOT NULL,
  "isSystem"       BOOLEAN      NOT NULL DEFAULT false,
  "isDefault"      BOOLEAN      NOT NULL DEFAULT false,
  "position"       INTEGER      NOT NULL DEFAULT 0,
  "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "SavedView_org_module_user_idx" ON "SavedView"("organizationId", "module", "userId");

-- 5. CustomFieldDefinition — per-org custom fields per entityType
CREATE TABLE "CustomFieldDefinition" (
  "id"             TEXT         NOT NULL PRIMARY KEY,
  "organizationId" TEXT         NOT NULL,
  "entityType"     TEXT         NOT NULL,
  "fieldKey"       TEXT         NOT NULL,
  "label"          TEXT         NOT NULL,
  "dataType"       TEXT         NOT NULL,
  "options"        JSONB,
  "isRequired"     BOOLEAN      NOT NULL DEFAULT false,
  "showOnPdf"      BOOLEAN      NOT NULL DEFAULT false,
  "showOnPortal"   BOOLEAN      NOT NULL DEFAULT false,
  "position"       INTEGER      NOT NULL DEFAULT 0,
  "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "deletedAt"      TIMESTAMP(3)
);
CREATE UNIQUE INDEX "CustomFieldDefinition_org_entity_key_uniq" ON "CustomFieldDefinition"("organizationId", "entityType", "fieldKey");

-- 6. CustomFieldValue — values keyed by (entityType, entityId, fieldDefinitionId)
CREATE TABLE "CustomFieldValue" (
  "id"                TEXT NOT NULL PRIMARY KEY,
  "organizationId"    TEXT NOT NULL,
  "entityType"        TEXT NOT NULL,
  "entityId"          TEXT NOT NULL,
  "fieldDefinitionId" TEXT NOT NULL,
  "value"             JSONB NOT NULL,
  CONSTRAINT "CustomFieldValue_def_fk" FOREIGN KEY ("fieldDefinitionId")
    REFERENCES "CustomFieldDefinition"("id") ON DELETE CASCADE
);
CREATE UNIQUE INDEX "CustomFieldValue_entity_field_uniq" ON "CustomFieldValue"("entityType", "entityId", "fieldDefinitionId");
CREATE INDEX        "CustomFieldValue_org_entity_idx"   ON "CustomFieldValue"("organizationId", "entityType", "entityId");

-- 7. UserPreference — per-user-per-org flags (banner dismissals, etc.)
CREATE TABLE "UserPreference" (
  "id"             TEXT NOT NULL PRIMARY KEY,
  "userId"         TEXT NOT NULL,
  "organizationId" TEXT,
  "key"            TEXT NOT NULL,
  "value"          TEXT NOT NULL
);
CREATE UNIQUE INDEX "UserPreference_user_org_key_uniq" ON "UserPreference"("userId", "organizationId", "key");

-- 8. DebitNote — seller-issued debit note (increases customer receivable)
CREATE TABLE "DebitNote" (
  "id"                 TEXT          NOT NULL PRIMARY KEY,
  "organizationId"     TEXT          NOT NULL,
  "contactId"          TEXT          NOT NULL,
  "debitNoteNumber"    TEXT          NOT NULL,
  "referenceNumber"    TEXT,
  "debitNoteDate"      TIMESTAMP(3)  NOT NULL,
  "reason"             TEXT,
  "status"             TEXT          NOT NULL DEFAULT 'OPEN',
  "currency"           TEXT          NOT NULL DEFAULT 'INR',
  "subTotal"           DECIMAL(18,4) NOT NULL DEFAULT 0,
  "taxAmount"          DECIMAL(18,4) NOT NULL DEFAULT 0,
  "total"              DECIMAL(18,4) NOT NULL DEFAULT 0,
  "amountApplied"      DECIMAL(18,4) NOT NULL DEFAULT 0,
  "customerNotes"      TEXT,
  "termsAndConditions" TEXT,
  "pdfTemplateId"      TEXT,
  "createdAt"          TIMESTAMP(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"          TIMESTAMP(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "deletedAt"          TIMESTAMP(3),
  CONSTRAINT "DebitNote_contact_fk" FOREIGN KEY ("contactId")
    REFERENCES "Contact"("id") ON DELETE NO ACTION
);
CREATE UNIQUE INDEX "DebitNote_org_number_uniq"     ON "DebitNote"("organizationId", "debitNoteNumber");
CREATE INDEX        "DebitNote_org_status_del_idx"  ON "DebitNote"("organizationId", "status", "deletedAt");

-- 9. DebitNoteLineItem
CREATE TABLE "DebitNoteLineItem" (
  "id"           TEXT          NOT NULL PRIMARY KEY,
  "debitNoteId"  TEXT          NOT NULL,
  "itemId"       TEXT,
  "accountId"    TEXT,
  "position"     INTEGER       NOT NULL DEFAULT 0,
  "name"         TEXT          NOT NULL,
  "description"  TEXT,
  "hsnSacCode"   TEXT,
  "quantity"     DECIMAL(18,4) NOT NULL,
  "unit"         TEXT,
  "rate"         DECIMAL(18,4) NOT NULL,
  "discount"     DECIMAL(18,4) NOT NULL DEFAULT 0,
  "discountType" TEXT          NOT NULL DEFAULT 'percentage',
  "taxId"        TEXT,
  "taxAmount"    DECIMAL(18,4) NOT NULL DEFAULT 0,
  "amount"       DECIMAL(18,4) NOT NULL,
  CONSTRAINT "DebitNoteLineItem_dn_fk" FOREIGN KEY ("debitNoteId")
    REFERENCES "DebitNote"("id") ON DELETE CASCADE
);
CREATE INDEX "DebitNoteLineItem_dn_idx" ON "DebitNoteLineItem"("debitNoteId");
