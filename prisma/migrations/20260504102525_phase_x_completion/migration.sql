-- AlterTable
ALTER TABLE "Bill" ADD COLUMN     "currency" TEXT,
ADD COLUMN     "exchangeRate" DECIMAL(18,6);

-- AlterTable
ALTER TABLE "Invoice" ADD COLUMN     "currency" TEXT,
ADD COLUMN     "exchangeRate" DECIMAL(18,6),
ADD COLUMN     "isRetail" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "OrganizationPreference" ADD COLUMN     "aiRateLimitPerDay" INTEGER NOT NULL DEFAULT 50,
ADD COLUMN     "aiSystemPromptOverride" TEXT,
ADD COLUMN     "customDomain" TEXT,
ADD COLUMN     "customerPortalEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "densityDefault" TEXT NOT NULL DEFAULT 'comfortable',
ADD COLUMN     "digitalSignatureEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "msmeNumber" TEXT,
ADD COLUMN     "msmeRegistered" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "panNumber" TEXT,
ADD COLUMN     "pdfTemplate" TEXT NOT NULL DEFAULT 'default',
ADD COLUMN     "smsEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "tanNumber" TEXT,
ADD COLUMN     "tdsEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "themeDefault" TEXT NOT NULL DEFAULT 'system',
ADD COLUMN     "vendorPortalEnabled" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "Reminder" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "appliesTo" TEXT NOT NULL,
    "daysBefore" INTEGER NOT NULL DEFAULT 0,
    "daysAfter" INTEGER NOT NULL DEFAULT 0,
    "template" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Reminder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkflowAction" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "config" JSONB,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WorkflowAction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkflowLog" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "ruleId" TEXT,
    "ruleName" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "message" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WorkflowLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Schedule" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "cron" TEXT NOT NULL,
    "taskKind" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "lastRunAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Schedule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReportingTag" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "color" TEXT NOT NULL DEFAULT '#1d4ed8',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReportingTag_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WebTab" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WebTab_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CustomRole" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "permissions" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CustomRole_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Integration" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "isConnected" BOOLEAN NOT NULL DEFAULT false,
    "config" JSONB,
    "connectedAt" TIMESTAMP(3),

    CONSTRAINT "Integration_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WebForm" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "formConfig" JSONB,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "submissionsCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WebForm_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ApiUsageLog" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "endpoint" TEXT NOT NULL,
    "method" TEXT NOT NULL,
    "statusCode" INTEGER NOT NULL,
    "durationMs" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ApiUsageLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Reminder_organizationId_isActive_idx" ON "Reminder"("organizationId", "isActive");

-- CreateIndex
CREATE INDEX "WorkflowLog_organizationId_createdAt_idx" ON "WorkflowLog"("organizationId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "ReportingTag_organizationId_name_key" ON "ReportingTag"("organizationId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "CustomRole_organizationId_name_key" ON "CustomRole"("organizationId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "Integration_organizationId_kind_key" ON "Integration"("organizationId", "kind");

-- CreateIndex
CREATE UNIQUE INDEX "WebForm_slug_key" ON "WebForm"("slug");

-- CreateIndex
CREATE INDEX "ApiUsageLog_organizationId_createdAt_idx" ON "ApiUsageLog"("organizationId", "createdAt");

-- CreateIndex
CREATE INDEX "Invoice_organizationId_isRetail_idx" ON "Invoice"("organizationId", "isRetail");

-- AddForeignKey
ALTER TABLE "Reminder" ADD CONSTRAINT "Reminder_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkflowAction" ADD CONSTRAINT "WorkflowAction_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkflowLog" ADD CONSTRAINT "WorkflowLog_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Schedule" ADD CONSTRAINT "Schedule_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReportingTag" ADD CONSTRAINT "ReportingTag_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WebTab" ADD CONSTRAINT "WebTab_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomRole" ADD CONSTRAINT "CustomRole_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Integration" ADD CONSTRAINT "Integration_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WebForm" ADD CONSTRAINT "WebForm_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApiUsageLog" ADD CONSTRAINT "ApiUsageLog_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
