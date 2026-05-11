-- Purchases module foundation. Additive across existing tables;
-- new tables for Contact bank accounts, PO line items + attachments,
-- Bill attachments, Vendor Credit applications + refunds + line items,
-- billable-expense usage, partner-bank integration scaffolding.
--
-- Backward-compatible with the thin existing Bill/PO/PaymentMade/
-- VendorCredit/Expense/Recurring rows used by the dashboard
-- aggregates and the existing /purchases/bills + /purchases/expenses
-- shells. Existing column names preserved.

-- ===================== ENUMS =====================
DO $$ BEGIN
  ALTER TYPE "BillStatus" ADD VALUE IF NOT EXISTS 'WRITTEN_OFF';
EXCEPTION WHEN duplicate_object THEN null; END $$;

CREATE TYPE "PaymentMadeType" AS ENUM ('BILL_PAYMENT', 'VENDOR_ADVANCE');

-- ===================== CONTACT EXTENSIONS =====================
ALTER TABLE "Contact"
  ADD COLUMN IF NOT EXISTS "msmeRegistered"     BOOLEAN,
  ADD COLUMN IF NOT EXISTS "msmeNumber"         TEXT,
  ADD COLUMN IF NOT EXISTS "msmeCategory"       TEXT,
  ADD COLUMN IF NOT EXISTS "msmeRegisteredDate" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "defaultTdsId"       TEXT,
  ADD COLUMN IF NOT EXISTS "enableVendorPortal" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "vendorPortalToken"  TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS "Contact_vendorPortalToken_key" ON "Contact"("vendorPortalToken");

-- ===================== CONTACT BANK ACCOUNTS =====================
CREATE TABLE "ContactBankAccount" (
  "id"                 TEXT         NOT NULL PRIMARY KEY,
  "contactId"          TEXT         NOT NULL,
  "accountHolderName"  TEXT,
  "bankName"           TEXT,
  "accountNumber"      TEXT         NOT NULL,
  "ifscCode"           TEXT         NOT NULL,
  "isDefault"          BOOLEAN      NOT NULL DEFAULT false,
  "position"           INTEGER      NOT NULL DEFAULT 0,
  "createdAt"          TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"          TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ContactBankAccount_contactId_fkey"
    FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE CASCADE
);
CREATE INDEX "ContactBankAccount_contactId_idx" ON "ContactBankAccount"("contactId");

-- ===================== BILL EXTENSIONS =====================
ALTER TABLE "Bill"
  ADD COLUMN IF NOT EXISTS "referenceNumber"    TEXT,
  ADD COLUMN IF NOT EXISTS "paymentTermsId"     TEXT,
  ADD COLUMN IF NOT EXISTS "subject"            TEXT,
  ADD COLUMN IF NOT EXISTS "discountValue"      DECIMAL(18,4) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "discountType"       TEXT          NOT NULL DEFAULT 'percentage',
  ADD COLUMN IF NOT EXISTS "taxId"              TEXT,
  ADD COLUMN IF NOT EXISTS "adjustmentLabel"    TEXT          DEFAULT 'Adjustment',
  ADD COLUMN IF NOT EXISTS "adjustmentValue"    DECIMAL(18,4) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "termsAndConditions" TEXT,
  ADD COLUMN IF NOT EXISTS "placeOfSupply"      TEXT,
  ADD COLUMN IF NOT EXISTS "accountsPayableId"  TEXT,
  ADD COLUMN IF NOT EXISTS "purchaseOrderId"    TEXT,
  ADD COLUMN IF NOT EXISTS "recurringBillId"    TEXT,
  ADD COLUMN IF NOT EXISTS "pdfTemplateId"      TEXT,
  ADD COLUMN IF NOT EXISTS "portalAccessToken"  TEXT,
  ADD COLUMN IF NOT EXISTS "voidedAt"           TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "writtenOffAt"       TIMESTAMP(3);

-- Existing rows need a token; cuid() isn't available at SQL level, so
-- we use the row id as a unique seed and prefix it. Acceptable for the
-- handful of stub rows that exist; new rows get a default via Prisma.
UPDATE "Bill" SET "portalAccessToken" = 'tok_' || "id" WHERE "portalAccessToken" IS NULL;
ALTER TABLE "Bill" ALTER COLUMN "portalAccessToken" SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS "Bill_portalAccessToken_key" ON "Bill"("portalAccessToken");

-- Drop old (org,number) unique; replace with (org,vendor,number).
-- The new constraint allows the same number across different vendors,
-- which matches the spec (each vendor has their own numbering scheme).
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Bill_organizationId_number_key') THEN
    ALTER TABLE "Bill" DROP CONSTRAINT "Bill_organizationId_number_key";
  END IF;
END $$;
CREATE UNIQUE INDEX IF NOT EXISTS "Bill_organizationId_contactId_number_key"
  ON "Bill"("organizationId", "contactId", "number");

-- FK on the new optional columns
ALTER TABLE "Bill"
  ADD CONSTRAINT "Bill_purchaseOrderId_fkey"
    FOREIGN KEY ("purchaseOrderId") REFERENCES "PurchaseOrder"("id") ON DELETE SET NULL;
ALTER TABLE "Bill"
  ADD CONSTRAINT "Bill_recurringBillId_fkey"
    FOREIGN KEY ("recurringBillId") REFERENCES "RecurringBill"("id") ON DELETE SET NULL;

-- ===================== BILL LINE ITEM EXTENSIONS =====================
ALTER TABLE "BillLineItem"
  ADD COLUMN IF NOT EXISTS "position"             INTEGER       NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "name"                 TEXT          NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS "hsnSacCode"           TEXT,
  ADD COLUMN IF NOT EXISTS "accountId"            TEXT,
  ADD COLUMN IF NOT EXISTS "billableToCustomerId" TEXT,
  ADD COLUMN IF NOT EXISTS "billableUsedAt"       TIMESTAMP(3);

CREATE INDEX IF NOT EXISTS "BillLineItem_billable_idx"
  ON "BillLineItem"("billableToCustomerId", "billableUsedAt");

-- ===================== BILL ATTACHMENTS =====================
CREATE TABLE "BillAttachment" (
  "id"        TEXT         NOT NULL PRIMARY KEY,
  "billId"    TEXT         NOT NULL,
  "fileName"  TEXT         NOT NULL,
  "fileUrl"   TEXT         NOT NULL,
  "fileSize"  INTEGER      NOT NULL,
  "mimeType"  TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "BillAttachment_billId_fkey"
    FOREIGN KEY ("billId") REFERENCES "Bill"("id") ON DELETE CASCADE
);

-- ===================== PURCHASE ORDER EXTENSIONS =====================
ALTER TABLE "PurchaseOrder"
  ADD COLUMN IF NOT EXISTS "referenceNumber"      TEXT,
  ADD COLUMN IF NOT EXISTS "deliveryDate"         TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "paymentTermsId"       TEXT,
  ADD COLUMN IF NOT EXISTS "shipmentPreferenceId" TEXT,
  ADD COLUMN IF NOT EXISTS "deliveryAddressMode"  TEXT          NOT NULL DEFAULT 'ORGANIZATION',
  ADD COLUMN IF NOT EXISTS "deliveryToCustomerId" TEXT,
  ADD COLUMN IF NOT EXISTS "deliveryAddressId"    TEXT,
  ADD COLUMN IF NOT EXISTS "currency"             TEXT,
  ADD COLUMN IF NOT EXISTS "subTotal"             DECIMAL(18,4) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "discountValue"        DECIMAL(18,4) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "discountType"         TEXT          NOT NULL DEFAULT 'percentage',
  ADD COLUMN IF NOT EXISTS "taxType"              TEXT,
  ADD COLUMN IF NOT EXISTS "taxId"                TEXT,
  ADD COLUMN IF NOT EXISTS "taxAmount"            DECIMAL(18,4) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "adjustmentLabel"      TEXT          DEFAULT 'Adjustment',
  ADD COLUMN IF NOT EXISTS "adjustmentValue"      DECIMAL(18,4) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "notes"                TEXT,
  ADD COLUMN IF NOT EXISTS "termsAndConditions"   TEXT,
  ADD COLUMN IF NOT EXISTS "pdfTemplateId"        TEXT,
  ADD COLUMN IF NOT EXISTS "placeOfSupply"        TEXT,
  ADD COLUMN IF NOT EXISTS "portalAccessToken"    TEXT,
  ADD COLUMN IF NOT EXISTS "sentAt"               TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "closedAt"             TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "cancelledAt"          TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "updatedAt"            TIMESTAMP(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN IF NOT EXISTS "deletedAt"            TIMESTAMP(3);

UPDATE "PurchaseOrder" SET "portalAccessToken" = 'tok_' || "id" WHERE "portalAccessToken" IS NULL;
ALTER TABLE "PurchaseOrder" ALTER COLUMN "portalAccessToken" SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS "PurchaseOrder_portalAccessToken_key" ON "PurchaseOrder"("portalAccessToken");

CREATE INDEX IF NOT EXISTS "PurchaseOrder_org_status_del_idx"
  ON "PurchaseOrder"("organizationId", "status", "deletedAt");

-- ===================== PURCHASE ORDER LINE ITEMS + ATTACHMENTS =====================
CREATE TABLE "PurchaseOrderLineItem" (
  "id"              TEXT          NOT NULL PRIMARY KEY,
  "purchaseOrderId" TEXT          NOT NULL,
  "itemId"          TEXT,
  "position"        INTEGER       NOT NULL DEFAULT 0,
  "name"            TEXT          NOT NULL DEFAULT '',
  "description"     TEXT,
  "hsnSacCode"      TEXT,
  "accountId"       TEXT,
  "quantity"        DECIMAL(18,4) NOT NULL,
  "unit"            TEXT,
  "rate"            DECIMAL(18,4) NOT NULL,
  "discount"        DECIMAL(18,4) NOT NULL DEFAULT 0,
  "discountType"    TEXT          NOT NULL DEFAULT 'percentage',
  "taxId"           TEXT,
  "taxAmount"       DECIMAL(18,4) NOT NULL DEFAULT 0,
  "amount"          DECIMAL(18,4) NOT NULL,
  CONSTRAINT "PurchaseOrderLineItem_purchaseOrderId_fkey"
    FOREIGN KEY ("purchaseOrderId") REFERENCES "PurchaseOrder"("id") ON DELETE CASCADE,
  CONSTRAINT "PurchaseOrderLineItem_itemId_fkey"
    FOREIGN KEY ("itemId") REFERENCES "Item"("id") ON DELETE SET NULL
);

CREATE TABLE "PurchaseOrderAttachment" (
  "id"              TEXT         NOT NULL PRIMARY KEY,
  "purchaseOrderId" TEXT         NOT NULL,
  "fileName"        TEXT         NOT NULL,
  "fileUrl"         TEXT         NOT NULL,
  "fileSize"        INTEGER      NOT NULL,
  "mimeType"        TEXT,
  "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PurchaseOrderAttachment_purchaseOrderId_fkey"
    FOREIGN KEY ("purchaseOrderId") REFERENCES "PurchaseOrder"("id") ON DELETE CASCADE
);

-- ===================== PAYMENT MADE EXTENSIONS =====================
ALTER TABLE "PaymentMade"
  ADD COLUMN IF NOT EXISTS "paymentType"          "PaymentMadeType" NOT NULL DEFAULT 'BILL_PAYMENT',
  ADD COLUMN IF NOT EXISTS "amountUsedForBills"   DECIMAL(18,4)     NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "amountInExcess"       DECIMAL(18,4)     NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "amountRefunded"       DECIMAL(18,4)     NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "tdsId"                TEXT,
  ADD COLUMN IF NOT EXISTS "tdsAmount"            DECIMAL(18,4),
  ADD COLUMN IF NOT EXISTS "paymentMode"          TEXT,
  ADD COLUMN IF NOT EXISTS "paidThroughAccountId" TEXT,
  ADD COLUMN IF NOT EXISTS "depositToAccountId"   TEXT,
  ADD COLUMN IF NOT EXISTS "status"               TEXT              NOT NULL DEFAULT 'DRAFT',
  ADD COLUMN IF NOT EXISTS "updatedAt"            TIMESTAMP(3)      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN IF NOT EXISTS "deletedAt"            TIMESTAMP(3);

CREATE INDEX IF NOT EXISTS "PaymentMade_org_type_status_idx"
  ON "PaymentMade"("organizationId", "paymentType", "status");

-- ===================== VENDOR CREDIT EXTENSIONS =====================
ALTER TABLE "VendorCredit"
  ADD COLUMN IF NOT EXISTS "referenceNumber" TEXT,
  ADD COLUMN IF NOT EXISTS "subject"         TEXT,
  ADD COLUMN IF NOT EXISTS "status"          TEXT          NOT NULL DEFAULT 'OPEN',
  ADD COLUMN IF NOT EXISTS "currency"        TEXT,
  ADD COLUMN IF NOT EXISTS "subTotal"        DECIMAL(18,4) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "taxAmount"       DECIMAL(18,4) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "amountApplied"   DECIMAL(18,4) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "amountRefunded"  DECIMAL(18,4) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "placeOfSupply"   TEXT,
  ADD COLUMN IF NOT EXISTS "notes"           TEXT,
  ADD COLUMN IF NOT EXISTS "pdfTemplateId"   TEXT,
  ADD COLUMN IF NOT EXISTS "updatedAt"       TIMESTAMP(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN IF NOT EXISTS "deletedAt"       TIMESTAMP(3);

CREATE TABLE "VendorCreditLineItem" (
  "id"             TEXT          NOT NULL PRIMARY KEY,
  "vendorCreditId" TEXT          NOT NULL,
  "itemId"         TEXT,
  "position"       INTEGER       NOT NULL DEFAULT 0,
  "name"           TEXT          NOT NULL DEFAULT '',
  "description"    TEXT,
  "hsnSacCode"     TEXT,
  "accountId"      TEXT,
  "quantity"       DECIMAL(18,4) NOT NULL,
  "rate"           DECIMAL(18,4) NOT NULL,
  "taxId"          TEXT,
  "amount"         DECIMAL(18,4) NOT NULL,
  CONSTRAINT "VendorCreditLineItem_vendorCreditId_fkey"
    FOREIGN KEY ("vendorCreditId") REFERENCES "VendorCredit"("id") ON DELETE CASCADE,
  CONSTRAINT "VendorCreditLineItem_itemId_fkey"
    FOREIGN KEY ("itemId") REFERENCES "Item"("id") ON DELETE SET NULL
);

CREATE TABLE "VendorCreditApplication" (
  "id"             TEXT          NOT NULL PRIMARY KEY,
  "vendorCreditId" TEXT          NOT NULL,
  "billId"         TEXT          NOT NULL,
  "amountApplied"  DECIMAL(18,4) NOT NULL,
  "appliedAt"      TIMESTAMP(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "VendorCreditApplication_vendorCreditId_fkey"
    FOREIGN KEY ("vendorCreditId") REFERENCES "VendorCredit"("id") ON DELETE CASCADE,
  CONSTRAINT "VendorCreditApplication_billId_fkey"
    FOREIGN KEY ("billId") REFERENCES "Bill"("id") ON DELETE RESTRICT
);
CREATE INDEX "VendorCreditApplication_billId_idx" ON "VendorCreditApplication"("billId");

CREATE TABLE "VendorCreditRefund" (
  "id"             TEXT          NOT NULL PRIMARY KEY,
  "vendorCreditId" TEXT          NOT NULL,
  "refundDate"     TIMESTAMP(3)  NOT NULL,
  "amount"         DECIMAL(18,4) NOT NULL,
  "paymentMode"    TEXT,
  "reference"      TEXT,
  "fromAccountId"  TEXT,
  "notes"          TEXT,
  "createdAt"      TIMESTAMP(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "VendorCreditRefund_vendorCreditId_fkey"
    FOREIGN KEY ("vendorCreditId") REFERENCES "VendorCredit"("id") ON DELETE CASCADE
);

-- ===================== RECURRING BILL EXTENSIONS =====================
ALTER TABLE "RecurringBill"
  ADD COLUMN IF NOT EXISTS "intervalN"          INTEGER       NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS "nextOccurrenceDate" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "startDate"          TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "endDate"            TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "neverExpires"       BOOLEAN       NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "status"             TEXT          NOT NULL DEFAULT 'ACTIVE',
  ADD COLUMN IF NOT EXISTS "templateJson"       JSONB,
  ADD COLUMN IF NOT EXISTS "updatedAt"          TIMESTAMP(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN IF NOT EXISTS "deletedAt"          TIMESTAMP(3);

-- ===================== EXPENSE EXTENSIONS =====================
ALTER TABLE "Expense"
  ADD COLUMN IF NOT EXISTS "number"               TEXT,
  ADD COLUMN IF NOT EXISTS "expenseAccountId"     TEXT,
  ADD COLUMN IF NOT EXISTS "paidThroughAccountId" TEXT,
  ADD COLUMN IF NOT EXISTS "customerId"           TEXT,
  ADD COLUMN IF NOT EXISTS "isBillable"           BOOLEAN      NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "isBilled"             BOOLEAN      NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "invoiceId"            TEXT,
  ADD COLUMN IF NOT EXISTS "recurringExpenseId"   TEXT,
  ADD COLUMN IF NOT EXISTS "status"               TEXT         NOT NULL DEFAULT 'RECORDED',
  ADD COLUMN IF NOT EXISTS "updatedAt"            TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN IF NOT EXISTS "deletedAt"            TIMESTAMP(3);

CREATE UNIQUE INDEX IF NOT EXISTS "Expense_organizationId_number_key"
  ON "Expense"("organizationId", "number")
  WHERE "number" IS NOT NULL;
CREATE INDEX IF NOT EXISTS "Expense_org_billable_billed_idx"
  ON "Expense"("organizationId", "isBillable", "isBilled");

-- ===================== RECURRING EXPENSE EXTENSIONS =====================
ALTER TABLE "RecurringExpense"
  ADD COLUMN IF NOT EXISTS "customerId"           TEXT,
  ADD COLUMN IF NOT EXISTS "isBillable"           BOOLEAN       NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "expenseAccountId"     TEXT,
  ADD COLUMN IF NOT EXISTS "paidThroughAccountId" TEXT,
  ADD COLUMN IF NOT EXISTS "intervalN"            INTEGER       NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS "startDate"            TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "endDate"              TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "neverExpires"         BOOLEAN       NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "status"               TEXT          NOT NULL DEFAULT 'ACTIVE',
  ADD COLUMN IF NOT EXISTS "nextOccurrenceDate"   TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "notes"                TEXT,
  ADD COLUMN IF NOT EXISTS "updatedAt"            TIMESTAMP(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN IF NOT EXISTS "deletedAt"            TIMESTAMP(3);

-- ===================== BILLABLE EXPENSE USAGE =====================
CREATE TABLE "BillableExpenseUsage" (
  "id"                TEXT          NOT NULL PRIMARY KEY,
  "organizationId"    TEXT          NOT NULL,
  "sourceType"        TEXT          NOT NULL, -- BILL_LINE_ITEM | EXPENSE
  "sourceId"          TEXT          NOT NULL,
  "customerId"        TEXT          NOT NULL,
  "invoiceLineItemId" TEXT,
  "amount"            DECIMAL(18,4) NOT NULL,
  "usedAt"            TIMESTAMP(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX "BillableExpenseUsage_sourceType_sourceId_key"
  ON "BillableExpenseUsage"("sourceType", "sourceId");
CREATE INDEX "BillableExpenseUsage_org_customer_idx"
  ON "BillableExpenseUsage"("organizationId", "customerId");

-- ===================== PARTNER-BANK INTEGRATION SCAFFOLD =====================
CREATE TABLE "BankIntegration" (
  "id"                TEXT         NOT NULL PRIMARY KEY,
  "organizationId"    TEXT         NOT NULL,
  "bankPartner"       TEXT,
  "isConfigured"      BOOLEAN      NOT NULL DEFAULT false,
  "configurationJson" JSONB,
  "createdAt"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX "BankIntegration_organizationId_key" ON "BankIntegration"("organizationId");
