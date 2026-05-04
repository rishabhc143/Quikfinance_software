import { PrismaClient, AccountType, Role, ItemType, ContactType } from "@prisma/client";
import bcrypt from "bcryptjs";

const db = new PrismaClient();

async function main() {
  const adminEmail = "admin@quikfinance.dev";
  const passwordHash = await bcrypt.hash("Quikfinance!123", 10);

  const user = await db.user.upsert({
    where: { email: adminEmail },
    update: {},
    create: {
      email: adminEmail,
      name: "Demo Admin",
      passwordHash,
      emailVerified: new Date(),
      referralCode: "DEMO" + Math.random().toString(36).slice(2, 8).toUpperCase(),
    },
  });

  const org = await db.organization.upsert({
    where: { slug: "demo-co" },
    update: {},
    create: {
      name: "Demo Co",
      slug: "demo-co",
      currency: "INR",
      country: "IN",
      fiscalYearStart: 4,
      planTier: "trial",
      trialEndsAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
      preferences: { create: { inventoryEnabled: false } },
    },
  });

  await db.organizationMembership.upsert({
    where: { userId_organizationId: { userId: user.id, organizationId: org.id } },
    update: {},
    create: {
      userId: user.id,
      organizationId: org.id,
      role: Role.ADMIN,
      isDefault: true,
    },
  });

  const accountSeeds: { code: string; name: string; type: AccountType }[] = [
    { code: "1000", name: "Cash", type: "ASSET" },
    { code: "1100", name: "Accounts Receivable", type: "ASSET" },
    { code: "1200", name: "Inventory Asset", type: "ASSET" },
    { code: "2000", name: "Accounts Payable", type: "LIABILITY" },
    { code: "3000", name: "Owner Equity", type: "EQUITY" },
    { code: "4000", name: "Sales", type: "INCOME" },
    { code: "4100", name: "Other Income", type: "OTHER_INCOME" },
    { code: "5000", name: "Cost of Goods Sold", type: "COST_OF_GOODS_SOLD" },
    { code: "6000", name: "Office Expenses", type: "EXPENSE" },
    { code: "6100", name: "Travel", type: "EXPENSE" },
    { code: "6200", name: "Software & Subscriptions", type: "EXPENSE" },
  ];

  for (const a of accountSeeds) {
    await db.chartOfAccount.upsert({
      where: { organizationId_code: { organizationId: org.id, code: a.code } },
      update: {},
      create: { ...a, organizationId: org.id },
    });
  }

  await db.numberSeries.upsert({
    where: { organizationId_module: { organizationId: org.id, module: "invoice" } },
    update: {},
    create: { organizationId: org.id, module: "invoice", prefix: "INV-", nextValue: 1, padding: 5 },
  });
  await db.numberSeries.upsert({
    where: { organizationId_module: { organizationId: org.id, module: "bill" } },
    update: {},
    create: { organizationId: org.id, module: "bill", prefix: "BILL-", nextValue: 1, padding: 5 },
  });

  const sales = await db.chartOfAccount.findFirst({ where: { organizationId: org.id, name: "Sales" } });
  const cogs = await db.chartOfAccount.findFirst({ where: { organizationId: org.id, name: "Cost of Goods Sold" } });

  const sampleVendor = await db.contact.upsert({
    where: { id: `${org.id}-acme-supply` },
    update: {},
    create: {
      id: `${org.id}-acme-supply`,
      organizationId: org.id,
      type: ContactType.VENDOR,
      displayName: "Acme Supply Co",
      email: "ap@acme.example",
      currency: "INR",
    },
  });

  await db.item.upsert({
    where: { id: `${org.id}-sample-consulting` },
    update: {},
    create: {
      id: `${org.id}-sample-consulting`,
      organizationId: org.id,
      name: "Consulting (hourly)",
      type: ItemType.SERVICE,
      unit: "hr",
      sellingPrice: 2500,
      salesAccountId: sales?.id,
      salesDescription: "Professional consulting services",
      costPrice: 1500,
      purchaseAccountId: cogs?.id,
      purchaseDescription: "Subcontractor cost",
      preferredVendorId: sampleVendor.id,
    },
  });

  await db.item.upsert({
    where: { id: `${org.id}-sample-widget` },
    update: {},
    create: {
      id: `${org.id}-sample-widget`,
      organizationId: org.id,
      name: "Widget Pro",
      type: ItemType.GOODS,
      unit: "pcs",
      sellingPrice: 999,
      salesAccountId: sales?.id,
      costPrice: 450,
      purchaseAccountId: cogs?.id,
    },
  });

  await db.promoBanner.create({
    data: {
      organizationId: org.id,
      message: "Welcome to Quikfinance! Explore the dashboard to get started.",
      ctaLabel: "Take a tour",
      ctaUrl: "/help",
    },
  });

  console.log("Seeded.");
  console.log("  Login: admin@quikfinance.dev / Quikfinance!123");
  console.log("  Org:   demo-co");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
