"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireOrganization } from "@/lib/auth-helpers";
import { writeAuditLog } from "@/lib/audit";

const schema = z.object({
  bankAccountId: z.string().min(1),
  date: z.coerce.date(),
  amount: z.coerce.number().positive(),
  reference: z.string().max(120).optional().nullable(),
  description: z.string().max(500).optional().nullable(),
});

type Kind = { entity: string; descriptionPrefix: string; type: "credit" | "debit"; redirectTo: string };

async function record(formData: FormData, kind: Kind) {
  const { user, organization } = await requireOrganization();
  const data = schema.parse({
    bankAccountId: formData.get("bankAccountId"),
    date: formData.get("date"),
    amount: formData.get("amount"),
    reference: formData.get("reference") || null,
    description: formData.get("description") || null,
  });
  const fullDescription = `${kind.descriptionPrefix}${data.description ? `: ${data.description}` : ""}`;
  const created = await db.bankTransaction.create({
    data: {
      organizationId: organization.id,
      bankAccountId: data.bankAccountId, date: data.date,
      description: fullDescription, reference: data.reference,
      amount: data.amount, type: kind.type,
    },
  });
  await writeAuditLog({ organizationId: organization.id, userId: user.id, action: "CREATE", entityType: kind.entity, entityId: created.id, after: { amount: data.amount } });
  revalidatePath(kind.redirectTo);
  revalidatePath("/banking/transactions");
  redirect(kind.redirectTo);
}

export async function createCardPaymentAction(formData: FormData) {
  await record(formData, { entity: "CardPayment", descriptionPrefix: "Card payment", type: "debit", redirectTo: "/banking/card-payments" });
}
export async function createOwnerDrawingAction(formData: FormData) {
  await record(formData, { entity: "OwnerDrawing", descriptionPrefix: "Owner drawing", type: "debit", redirectTo: "/banking/owner-drawings" });
}
export async function createOtherIncomeAction(formData: FormData) {
  await record(formData, { entity: "OtherIncome", descriptionPrefix: "Other income", type: "credit", redirectTo: "/banking/other-income" });
}
