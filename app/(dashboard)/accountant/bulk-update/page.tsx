import { BackLink } from "@/components/shared/dirty-form-nav";
import { ArrowLeft, Layers } from "lucide-react";
import { db } from "@/lib/db";
import { requireOrganization } from "@/lib/auth-helpers";
import { Button } from "@/components/ui/button";
import { BulkUpdateWizard } from "./wizard";

export const metadata = { title: "Bulk Update" };

/**
 * ACCT-B — Bulk Update wizard host. Loads the per-org option lists
 * (Taxes, Payment Terms) up-front so the wizard can render select
 * inputs without a round-trip when the user changes their field.
 */
export default async function BulkUpdatePage() {
  const { organization } = await requireOrganization();

  const [taxes, paymentTerms] = await Promise.all([
    db.tax.findMany({
      where: { organizationId: organization.id, isActive: true },
      select: { id: true, name: true, rate: true },
      orderBy: { name: "asc" },
    }),
    db.paymentTerms.findMany({
      where: { organizationId: organization.id },
      select: { id: true, name: true, numberOfDays: true },
      orderBy: { numberOfDays: "asc" },
    }),
  ]);

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-4">
      <div className="flex items-center gap-2">
        <Button asChild variant="ghost" size="icon" aria-label="Back">
          <BackLink href="/accountant"><ArrowLeft className="h-4 w-4" /></BackLink>
        </Button>
        <Layers className="h-5 w-5 text-muted-foreground" />
        <h1 className="text-2xl font-semibold tracking-tight">Bulk Update</h1>
      </div>
      <p className="text-sm text-muted-foreground">
        Update one field across many rows at once — e.g. apply a 10% price
        increase to all items, or move every Net-30 customer to Net-45.
        Pick a category to begin.
      </p>

      <BulkUpdateWizard
        options={{
          TAXES: taxes.map((t) => ({
            value: t.id,
            label: `${t.name} (${Number(t.rate)}%)`,
          })),
          PAYMENT_TERMS: paymentTerms.map((p) => ({
            value: p.id,
            label: `${p.name} (${p.numberOfDays}d)`,
          })),
        }}
      />
    </div>
  );
}
