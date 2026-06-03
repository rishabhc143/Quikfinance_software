import { DirtyFormProvider, DirtyLink } from "@/components/shared/dirty-form-nav";
import { ArrowLeft } from "lucide-react";
import { db } from "@/lib/db";
import { requireOrganization } from "@/lib/auth-helpers";
import { Button } from "@/components/ui/button";
import { NewPaymentForm } from "./form";
import { recordStandalonePaymentAction } from "../actions";
import type { RecordPaymentInput } from "@/lib/validations/invoice";

export const metadata = { title: "New Payment Received" };

export default async function NewPaymentPage() {
  const { organization } = await requireOrganization();

  const [contacts, bankAccounts] = await Promise.all([
    db.contact.findMany({
      where: {
        organizationId: organization.id,
        deletedAt: null,
        type: { in: ["CUSTOMER", "BOTH"] as ("CUSTOMER" | "BOTH")[] },
      },
      orderBy: { displayName: "asc" },
      select: { id: true, displayName: true, email: true },
    }),
    db.bankAccount.findMany({
      where: { organizationId: organization.id, isActive: true },
      orderBy: { name: "asc" },
    }),
  ]);

  async function loadOpenInvoices(contactId: string) {
    "use server";
    const invoices = await db.invoice.findMany({
      where: {
        organizationId: organization.id,
        contactId,
        deletedAt: null,
        status: { in: ["SENT", "PARTIALLY_PAID", "OVERDUE", "DRAFT"] },
      },
      orderBy: { dueDate: "asc" },
      select: { id: true, number: true, total: true, amountPaid: true },
    });
    return invoices.map((i) => ({
      id: i.id,
      number: i.number,
      total: Number(i.total),
      amountPaid: Number(i.amountPaid),
    }));
  }

  async function submit(values: RecordPaymentInput) {
    "use server";
    await recordStandalonePaymentAction(values);
  }

  return (
    <DirtyFormProvider>
    <div className="p-6 max-w-3xl mx-auto space-y-4">
      <div className="flex items-center gap-2">
        <Button asChild variant="ghost" size="icon" aria-label="Back">
          <DirtyLink href="/sales/payments-received">
            <ArrowLeft className="h-4 w-4" />
          </DirtyLink>
        </Button>
        <h1 className="text-xl font-semibold">Record Payment</h1>
      </div>
      <NewPaymentForm
        contactOptions={contacts.map((c) => ({
          value: c.id,
          label: c.displayName,
          hint: c.email ?? undefined,
        }))}
        bankAccountOptions={bankAccounts.map((b) => ({ value: b.id, label: b.name }))}
        loadOpenInvoices={loadOpenInvoices}
        onSubmitAction={submit}
      />
    </div>
    </DirtyFormProvider>
  );
}
