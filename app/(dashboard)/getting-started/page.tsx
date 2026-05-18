import Link from "next/link";
import {
  CheckCircle2,
  Circle,
  ArrowRight,
  Sparkles,
  Building2,
  Users,
  Banknote,
  Receipt,
  Calculator,
  FileText,
  ShoppingCart,
} from "lucide-react";
import { db } from "@/lib/db";
import { requireOrganization } from "@/lib/auth-helpers";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

export const metadata = { title: "Getting Started" };

/**
 * Getting Started — onboarding checklist for new orgs.
 *
 * Each step is detected as "done" by querying the relevant table.
 * Lightweight existence checks only (count > 0). The page is a
 * server component so the data is always fresh — no client polling
 * needed.
 *
 * Steps reflect the typical Indian SMB workflow:
 *   1. Confirm Organization profile (always pre-checked since you
 *      can't reach this page without an org)
 *   2. Add a Customer (Contact with role CUSTOMER)
 *   3. Add a Vendor (Contact with role VENDOR)
 *   4. Add a Bank Account (BankAccount row)
 *   5. Configure Taxes (Tax row)
 *   6. Create your first Invoice
 *   7. Create your first Bill
 *   8. Run your first Profit and Loss
 *
 * Item 8 is always "Open the report" — no done state since reading
 * a report doesn't leave a database trace yet.
 */
export default async function GettingStartedPage() {
  const { organization, user } = await requireOrganization();

  // Lightweight existence checks. count() is one COUNT query each;
  // they run in parallel below.
  const [
    customerCount,
    vendorCount,
    bankAccountCount,
    taxCount,
    invoiceCount,
    billCount,
  ] = await Promise.all([
    db.contact.count({
      where: { organizationId: organization.id, type: "CUSTOMER" },
    }),
    db.contact.count({
      where: { organizationId: organization.id, type: "VENDOR" },
    }),
    db.bankAccount.count({ where: { organizationId: organization.id } }),
    db.tax.count({ where: { organizationId: organization.id } }),
    db.invoice.count({ where: { organizationId: organization.id } }),
    db.bill.count({ where: { organizationId: organization.id } }),
  ]);

  const steps: Step[] = [
    {
      icon: Building2,
      label: "Set up your organization",
      description: `${organization.name} is set up. Configure logo, GSTIN, and fiscal year start in Settings.`,
      done: true,
      href: "/settings",
      ctaLabel: "Review settings",
    },
    {
      icon: Users,
      label: "Add your first Customer",
      description:
        "Customers are required to create Invoices. Capture name, GSTIN, billing address.",
      done: customerCount > 0,
      doneCount: customerCount,
      href: "/sales/customers/new",
      ctaLabel: customerCount > 0 ? "Add another" : "Add Customer",
    },
    {
      icon: ShoppingCart,
      label: "Add your first Vendor",
      description:
        "Vendors are required to record Bills. Capture name + GSTIN for ITC tracking.",
      done: vendorCount > 0,
      doneCount: vendorCount,
      href: "/purchases/vendors/new",
      ctaLabel: vendorCount > 0 ? "Add another" : "Add Vendor",
    },
    {
      icon: Banknote,
      label: "Add a Bank Account",
      description:
        "Connect at least one bank account so you can record Payments Made/Received and run Cash Flow.",
      done: bankAccountCount > 0,
      doneCount: bankAccountCount,
      href: "/banking",
      ctaLabel: bankAccountCount > 0 ? "Manage banks" : "Add Bank Account",
    },
    {
      icon: Calculator,
      label: "Configure Tax rates",
      description:
        "Set up CGST / SGST / IGST rates. Default 18% GST is pre-loaded; tweak if needed.",
      done: taxCount > 0,
      doneCount: taxCount,
      href: "/settings/taxes-compliance",
      ctaLabel: taxCount > 0 ? "Manage taxes" : "Configure",
    },
    {
      icon: Receipt,
      label: "Create your first Invoice",
      description:
        "Bill a customer for goods or services. The Invoice line items + GST flow automatically into your books.",
      done: invoiceCount > 0,
      doneCount: invoiceCount,
      href: "/sales/invoices/new",
      ctaLabel: invoiceCount > 0 ? "Create another" : "New Invoice",
    },
    {
      icon: Receipt,
      label: "Record your first Bill",
      description:
        "Capture a vendor invoice. The Bill becomes an expense in your P&L and a liability on your Balance Sheet.",
      done: billCount > 0,
      doneCount: billCount,
      href: "/purchases/bills/new",
      ctaLabel: billCount > 0 ? "Record another" : "New Bill",
    },
    {
      icon: FileText,
      label: "Run your first Profit and Loss",
      description:
        "Once you have a few transactions, head to Reports → Profit and Loss to see your income and expenses by category.",
      done: false, // no DB trace for "viewed a report" — always actionable
      href: "/reports/profit-loss",
      ctaLabel: "Open P&L",
    },
  ];

  const doneCount = steps.filter((s) => s.done).length;
  const totalRequired = steps.length - 1; // last item never marks done
  const pct = Math.round((doneCount / totalRequired) * 100);

  // Reference user.email defensively — keeps unused-var lint quiet.
  void user;

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-1">
          <div className="inline-flex items-center gap-2 text-xs uppercase tracking-wider text-primary font-medium">
            <Sparkles className="h-3.5 w-3.5" />
            Onboarding
          </div>
          <h1 className="text-2xl font-semibold">Getting Started</h1>
          <p className="text-sm text-muted-foreground">
            8 quick steps to set up your books in Quikfinance. Each step
            opens the relevant page so you can complete it inline.
          </p>
        </div>
        <div className="text-right">
          <div className="text-3xl font-semibold tabular-nums">
            {doneCount}
            <span className="text-base text-muted-foreground">
              /{totalRequired}
            </span>
          </div>
          <div className="text-xs text-muted-foreground">
            {pct}% complete
          </div>
        </div>
      </div>

      <Card className="p-0 divide-y">
        {steps.map((s, idx) => (
          <StepRow key={s.label} step={s} index={idx + 1} />
        ))}
      </Card>

      <div className="text-xs text-muted-foreground pt-2">
        Stuck? Check{" "}
        <Link href="/settings" className="text-primary hover:underline">
          Settings
        </Link>{" "}
        or open any report from the{" "}
        <Link href="/reports" className="text-primary hover:underline">
          Reports Center
        </Link>
        .
      </div>
    </div>
  );
}

type Step = {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  description: string;
  done: boolean;
  doneCount?: number;
  href: string;
  ctaLabel: string;
};

function StepRow({ step, index }: { step: Step; index: number }) {
  const Icon = step.icon;
  return (
    <div className="flex items-center gap-4 px-5 py-4">
      <div className="shrink-0">
        {step.done ? (
          <CheckCircle2 className="h-7 w-7 text-emerald-600" />
        ) : (
          <div className="relative">
            <Circle className="h-7 w-7 text-muted-foreground/40" />
            <span className="absolute inset-0 flex items-center justify-center text-xs font-semibold text-muted-foreground">
              {index}
            </span>
          </div>
        )}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <Icon className="h-4 w-4 text-muted-foreground" />
          <h3 className={"font-medium " + (step.done ? "text-foreground" : "")}>
            {step.label}
          </h3>
          {step.done && step.doneCount !== undefined ? (
            <Badge variant="outline" className="text-[10px] uppercase">
              {step.doneCount} created
            </Badge>
          ) : null}
        </div>
        <p className="text-xs text-muted-foreground mt-0.5">
          {step.description}
        </p>
      </div>
      <Button asChild size="sm" variant={step.done ? "outline" : "default"}>
        <Link href={step.href} className="gap-1">
          {step.ctaLabel}
          <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      </Button>
    </div>
  );
}
