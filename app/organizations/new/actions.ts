"use server";

import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireUser, ACTIVE_ORG_COOKIE } from "@/lib/auth-helpers";
import { slugify } from "@/lib/utils";
import { writeAuditLog } from "@/lib/audit";

const schema = z.object({
  name: z.string().min(2),
  country: z.string().default("IN"),
  currency: z.string().default("INR"),
  fiscalYearStart: z.coerce.number().int().min(1).max(12).default(4),
});

const SEED_ACCOUNTS: { code: string; name: string; type: "ASSET" | "LIABILITY" | "EQUITY" | "INCOME" | "EXPENSE" | "COST_OF_GOODS_SOLD" | "OTHER_INCOME" }[] = [
  { code: "1000", name: "Cash", type: "ASSET" },
  { code: "1100", name: "Accounts Receivable", type: "ASSET" },
  { code: "2000", name: "Accounts Payable", type: "LIABILITY" },
  { code: "3000", name: "Owner Equity", type: "EQUITY" },
  { code: "4000", name: "Sales", type: "INCOME" },
  { code: "4100", name: "Other Income", type: "OTHER_INCOME" },
  { code: "5000", name: "Cost of Goods Sold", type: "COST_OF_GOODS_SOLD" },
  { code: "6000", name: "Office Expenses", type: "EXPENSE" },
];

export async function createOrganizationAction(formData: FormData) {
  const user = await requireUser();
  const parsed = schema.safeParse({
    name: formData.get("name"),
    country: formData.get("country"),
    currency: formData.get("currency"),
    fiscalYearStart: formData.get("fiscalYearStart"),
  });
  if (!parsed.success) throw new Error("Invalid input");

  const baseSlug = slugify(parsed.data.name);
  let slug = baseSlug || `org-${Date.now().toString(36)}`;
  let i = 0;
  while (await db.organization.findUnique({ where: { slug } })) {
    i++;
    slug = `${baseSlug}-${i}`;
  }

  const org = await db.organization.create({
    data: {
      ...parsed.data,
      slug,
      planTier: "trial",
      trialEndsAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
      preferences: { create: {} },
      members: {
        create: { userId: user.id, role: "ADMIN", isDefault: true },
      },
      chartOfAccounts: { create: SEED_ACCOUNTS },
      numberSeries: {
        create: [
          { module: "invoice", prefix: "INV-", nextValue: 1, padding: 5 },
          { module: "bill", prefix: "BILL-", nextValue: 1, padding: 5 },
          { module: "quote", prefix: "QT-", nextValue: 1, padding: 5 },
        ],
      },
      paymentTerms: {
        create: [
          { name: "Due on Receipt", numberOfDays: 0, isDefault: true },
          { name: "Net 15", numberOfDays: 15 },
          { name: "Net 30", numberOfDays: 30 },
          { name: "Net 45", numberOfDays: 45 },
          { name: "Net 60", numberOfDays: 60 },
          { name: "Due end of the month", numberOfDays: 30 },
          { name: "Due end of next month", numberOfDays: 60 },
        ],
      },
    },
  });

  await writeAuditLog({
    organizationId: org.id,
    userId: user.id,
    action: "CREATE",
    entityType: "Organization",
    entityId: org.id,
    after: { name: org.name, slug: org.slug },
  });

  const store = await cookies();
  store.set(ACTIVE_ORG_COOKIE, org.id, { httpOnly: true, sameSite: "lax", path: "/", maxAge: 60 * 60 * 24 * 365 });
  redirect("/");
}
