-- Add the supplier GSTIN at the Organization level and the HSN/SAC
-- code at the invoice-line level. Both are optional — existing data
-- keeps working until the user opts in via the settings UI.
--
-- Why: GSTR-1 export needs the supplier GSTIN (first 2 chars =
-- supplier state code) and per-line HSN/SAC codes. QuoteLineItem
-- already had hsnSacCode; this brings InvoiceLineItem to parity.

ALTER TABLE "Organization" ADD COLUMN "gstin" TEXT;
ALTER TABLE "InvoiceLineItem" ADD COLUMN "hsnSacCode" TEXT;
