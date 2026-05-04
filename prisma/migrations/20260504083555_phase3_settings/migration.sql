-- AlterTable
ALTER TABLE "OrganizationPreference" ADD COLUMN     "brandColor" TEXT NOT NULL DEFAULT '#1d4ed8',
ADD COLUMN     "emailDigestWeekly" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "emailOnBillDue" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "emailOnEstimateAccepted" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "emailOnInvoicePaid" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "emailOnInvoiceSent" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "emailOnPaymentReceived" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "language" TEXT NOT NULL DEFAULT 'en',
ADD COLUMN     "timeZone" TEXT NOT NULL DEFAULT 'Asia/Kolkata';
