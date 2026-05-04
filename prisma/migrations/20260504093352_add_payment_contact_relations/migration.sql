-- AddForeignKey
ALTER TABLE "PaymentReceived" ADD CONSTRAINT "PaymentReceived_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentMade" ADD CONSTRAINT "PaymentMade_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
