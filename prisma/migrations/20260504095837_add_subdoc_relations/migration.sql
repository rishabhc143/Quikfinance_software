-- AlterTable
ALTER TABLE "CreditNote" ADD COLUMN     "reason" TEXT;

-- AlterTable
ALTER TABLE "RecurringBill" ADD COLUMN     "amount" DECIMAL(18,4) NOT NULL DEFAULT 0,
ADD COLUMN     "contactId" TEXT;

-- AlterTable
ALTER TABLE "RecurringExpense" ADD COLUMN     "amount" DECIMAL(18,4) NOT NULL DEFAULT 0,
ADD COLUMN     "category" TEXT,
ADD COLUMN     "contactId" TEXT;

-- AlterTable
ALTER TABLE "RecurringInvoice" ADD COLUMN     "amount" DECIMAL(18,4) NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "VendorCredit" ADD COLUMN     "reason" TEXT;

-- AddForeignKey
ALTER TABLE "DeliveryChallan" ADD CONSTRAINT "DeliveryChallan_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecurringInvoice" ADD CONSTRAINT "RecurringInvoice_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CreditNote" ADD CONSTRAINT "CreditNote_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseOrder" ADD CONSTRAINT "PurchaseOrder_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecurringBill" ADD CONSTRAINT "RecurringBill_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VendorCredit" ADD CONSTRAINT "VendorCredit_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecurringExpense" ADD CONSTRAINT "RecurringExpense_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE SET NULL ON UPDATE CASCADE;
