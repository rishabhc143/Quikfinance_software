import { PrismaClient } from "@prisma/client";

/**
 * M19: shared E2E test helpers.
 *
 * The receivables-lifecycle test pre-seeds a customer + a sellable item
 * directly via Prisma so the spec can stay focused on the state-transition
 * UI (Mark as Sent → Convert → Record Payment → PAID) without depending
 * on the brittle inline-create combobox path.
 *
 * The cleanup step hard-deletes the seeded fixtures to keep the demo
 * org tidy across runs.
 */

const ADMIN_EMAIL = "admin@quikfinance.dev";

let _prisma: PrismaClient | null = null;
function getDb(): PrismaClient {
  if (!_prisma) {
    _prisma = new PrismaClient();
  }
  return _prisma;
}

export type LifecycleFixtures = {
  orgId: string;
  customerId: string;
  customerName: string;
  itemId: string;
  itemName: string;
};

export async function seedLifecycleFixtures(stamp: number): Promise<LifecycleFixtures> {
  const db = getDb();
  const user = await db.user.findUnique({ where: { email: ADMIN_EMAIL } });
  if (!user) {
    throw new Error(
      `E2E seed admin not found (${ADMIN_EMAIL}). Run \`pnpm db:seed\`.`
    );
  }
  const membership = await db.organizationMembership.findFirst({
    where: { userId: user.id, isDefault: true },
    include: { organization: true },
  });
  if (!membership) {
    throw new Error(
      `Default org for ${ADMIN_EMAIL} not found. Run \`pnpm db:seed\`.`
    );
  }
  const orgId = membership.organizationId;

  const customerName = `E2E LC ${stamp}`;
  const itemName = `E2E Consulting ${stamp}`;

  const customer = await db.contact.create({
    data: {
      organizationId: orgId,
      type: "CUSTOMER",
      displayName: customerName,
      firstName: "E2E",
      lastName: `Customer ${stamp}`,
    },
  });
  const item = await db.item.create({
    data: {
      organizationId: orgId,
      name: itemName,
      sku: `E2E-${stamp}`,
      sellingPrice: 1000,
      isActive: true,
      type: "SERVICE",
    },
  });

  return {
    orgId,
    customerId: customer.id,
    customerName,
    itemId: item.id,
    itemName,
  };
}

export async function cleanupLifecycleFixtures(
  fixtures: LifecycleFixtures
): Promise<void> {
  const db = getDb();
  // Soft-touch: delete the customer + item we created. Any quotes/
  // invoices the test produced are kept (they reference the customer
  // by FK; let them keep the row reference so historical data is
  // visible for debugging). The customer is soft-deleted (deletedAt)
  // so the FK from those documents stays valid.
  await db.contact.update({
    where: { id: fixtures.customerId },
    data: { deletedAt: new Date() },
  });
  await db.item.update({
    where: { id: fixtures.itemId },
    data: { deletedAt: new Date(), isActive: false },
  });
}

export async function disconnectDb(): Promise<void> {
  if (_prisma) {
    await _prisma.$disconnect();
    _prisma = null;
  }
}
