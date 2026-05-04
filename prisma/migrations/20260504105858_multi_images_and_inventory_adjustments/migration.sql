-- AlterTable
ALTER TABLE "Item" ADD COLUMN     "images" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- CreateTable
CREATE TABLE "InventoryAdjustment" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "quantity" DECIMAL(18,4) NOT NULL,
    "reason" TEXT NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InventoryAdjustment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "InventoryAdjustment_organizationId_date_idx" ON "InventoryAdjustment"("organizationId", "date");

-- CreateIndex
CREATE INDEX "InventoryAdjustment_itemId_idx" ON "InventoryAdjustment"("itemId");

-- AddForeignKey
ALTER TABLE "InventoryAdjustment" ADD CONSTRAINT "InventoryAdjustment_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryAdjustment" ADD CONSTRAINT "InventoryAdjustment_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "Item"("id") ON DELETE CASCADE ON UPDATE CASCADE;
