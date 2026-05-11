-- Foundation for stock reservation: Sales Orders CONFIRMED reserve
-- stock; Delivery Challans DELIVERED consume the reservation
-- (turning it into a real on-hand decrement).
--
-- Single table with two timestamp columns instead of a boolean
-- status — releasedAt (manual cancellation) vs consumedAt (shipped
-- via DC). A row is "active" while both are NULL; matches the way
-- we already track soft-deletes (deletedAt) and credit-note
-- reversals (reason="Reverse ...").

CREATE TABLE "InventoryReservation" (
  "id"             TEXT         NOT NULL PRIMARY KEY,
  "organizationId" TEXT         NOT NULL,
  "itemId"         TEXT         NOT NULL,
  "quantity"       DECIMAL(18,4) NOT NULL,
  "sourceType"     TEXT         NOT NULL,
  "sourceId"       TEXT         NOT NULL,
  "sourceNumber"   TEXT         NOT NULL,
  "reservedAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "releasedAt"     TIMESTAMP(3),
  "consumedAt"     TIMESTAMP(3),
  CONSTRAINT "InventoryReservation_org_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "Organization"("id")
    ON DELETE CASCADE,
  CONSTRAINT "InventoryReservation_item_fkey"
    FOREIGN KEY ("itemId") REFERENCES "Item"("id")
    ON DELETE CASCADE
);

CREATE INDEX "InventoryReservation_org_item_status_idx"
  ON "InventoryReservation"("organizationId", "itemId", "releasedAt", "consumedAt");
CREATE INDEX "InventoryReservation_source_idx"
  ON "InventoryReservation"("sourceType", "sourceId");
