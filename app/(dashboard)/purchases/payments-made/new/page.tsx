import Link from "next/link";
import { ArrowLeft, Wallet } from "lucide-react";
import { db } from "@/lib/db";
import { requireOrganization } from "@/lib/auth-helpers";
import { Button } from "@/components/ui/button";
import { PaymentMadeForm } from "./form";
import {
  createBillPaymentAction,
  createVendorAdvanceAction,
  getOpenBillsForVendorAction,
  getVendorAdvanceBalanceAction,
} from "../actions";

export const metadata = { title: "Record Payment" };

export default async function NewPaymentMadePage({
  searchParams,
}: {
  searchParams: Record<string, string>;
}) {
  const { organization } = await requireOrganization();

  const [vendors, accounts, tdsTaxes] = await Promise.all([
    db.contact.findMany({
      where: {
        organizationId: organization.id,
        deletedAt: null,
        type: { in: ["VENDOR", "BOTH"] },
        isInactive: false,
      },
      select: { id: true, displayName: true },
      orderBy: { displayName: "asc" },
    }),
    db.chartOfAccount.findMany({
      where: {
        organizationId: organization.id,
        isActive: true,
        // Paid-through + Deposit-to are typically asset accounts
        // (bank / cash / petty cash / prepaid expenses).
        type: { in: ["ASSET", "LIABILITY"] },
      },
      select: { id: true, name: true, code: true },
      orderBy: { name: "asc" },
    }),
    db.tax.findMany({
      where: {
        organizationId: organization.id,
        isActive: true,
        OR: [{ type: "TDS" }, { type: "tds" }],
      },
      select: { id: true, name: true, rate: true },
      orderBy: { name: "asc" },
    }),
  ]);

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-4">
      <div className="flex items-center gap-2">
        <Button asChild variant="ghost" size="icon" aria-label="Back">
          <Link href="/purchases/payments-made">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <Wallet className="h-5 w-5 text-muted-foreground" />
        <h1 className="text-2xl font-semibold tracking-tight">
          Record Payment
        </h1>
      </div>
      <PaymentMadeForm
        vendorOptions={vendors.map((v) => ({
          value: v.id,
          label: v.displayName,
        }))}
        accountOptions={accounts.map((a) => ({
          value: a.id,
          label: a.code ? `${a.code} — ${a.name}` : a.name,
        }))}
        tdsOptions={tdsTaxes.map((t) => ({
          value: t.id,
          label: `${t.name} (${Number(t.rate)}%)`,
        }))}
        currency={organization.currency}
        defaultVendorId={searchParams.vendor ?? null}
        defaultBillId={searchParams.bill ?? null}
        loadOpenBillsAction={getOpenBillsForVendorAction}
        loadAdvanceBalanceAction={getVendorAdvanceBalanceAction}
        createBillPaymentAction={createBillPaymentAction}
        createVendorAdvanceAction={createVendorAdvanceAction}
      />
    </div>
  );
}
