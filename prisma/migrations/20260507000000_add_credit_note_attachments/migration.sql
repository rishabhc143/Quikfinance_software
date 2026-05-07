-- CreateTable
CREATE TABLE "CreditNoteAttachment" (
    "id" TEXT NOT NULL,
    "creditNoteId" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "fileUrl" TEXT NOT NULL,
    "fileSize" INTEGER NOT NULL,
    "mimeType" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CreditNoteAttachment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CreditNoteAttachment_creditNoteId_idx" ON "CreditNoteAttachment"("creditNoteId");

-- AddForeignKey
ALTER TABLE "CreditNoteAttachment" ADD CONSTRAINT "CreditNoteAttachment_creditNoteId_fkey" FOREIGN KEY ("creditNoteId") REFERENCES "CreditNote"("id") ON DELETE CASCADE ON UPDATE CASCADE;

