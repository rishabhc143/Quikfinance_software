import Link from "next/link";
import {
  Mail,
  AlertTriangle,
  Wallet,
  Package,
  FileCheck,
  Hash,
  FileText,
  BookOpen,
  Video,
  Phone,
  Sparkles,
  Info,
  ChevronRight,
} from "lucide-react";
import { requireOrganization } from "@/lib/auth-helpers";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export const metadata = { title: "Fiscal Year-End Tasks" };

/**
 * Fiscal Year-End Tasks — Zoho-faithful.
 *
 * Matches the user-shared screenshots:
 *   1. Welcome header — Hello, <name> + org + helpline
 *   2. Hero video card — "Year End Accounting - Tips and Tricks"
 *      (placeholder for the actual video; we link to email support
 *      instead of YouTube)
 *   3. Auto-close note banner (amber) — explanatory note about the
 *      automatic carry-forward
 *   4. "Things to do before the fiscal year-end" — 7 task cards
 *      with icon + title + description + Learn More / CTA
 *   5. "Effortless Year-End Accounting" — 2 light-blue help cards
 *   6. "Frequently asked questions" — 4 questions + View More link
 *
 * Each task's CTA links to a real route in the app.
 */
export default async function FiscalYearEndPage() {
  const { organization, user } = await requireOrganization();

  // First-name guess for the header.
  const displayFirstName =
    user.name?.trim().split(/\s+/)[0] ??
    user.email?.split("@")[0] ??
    "there";

  const fyLabel = currentFiscalYearLabel(organization.fiscalYearStart);
  const nextFyLabel = nextFiscalYearLabel(organization.fiscalYearStart);

  return (
    <div className="min-h-screen">
      {/* ── Top welcome banner ────────────────────────────────── */}
      <div className="border-b bg-gradient-to-b from-muted/30 to-background">
        <div className="max-w-5xl mx-auto px-6 py-6 flex items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-md bg-blue-50 dark:bg-blue-950/40 flex items-center justify-center">
              <Sparkles className="h-5 w-5 text-blue-600" />
            </div>
            <div>
              <h1 className="text-2xl font-semibold">
                Hello, {displayFirstName}
              </h1>
              <p className="text-sm text-muted-foreground">
                {organization.name}
              </p>
            </div>
          </div>
          <div className="text-right space-y-0.5">
            <div className="text-sm">
              <span className="text-muted-foreground">
                Quikfinance India Helpline:
              </span>{" "}
              <span className="font-medium">18003093036</span>
            </div>
            <div className="text-xs text-muted-foreground">
              Mon - Fri · 9:00 AM - 7:00 PM · Toll Free
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-6 py-6 space-y-6">
        {/* ── Hero video card ──────────────────────────────────── */}
        <div className="rounded-lg border bg-blue-50/40 dark:bg-blue-950/10 p-5">
          <div className="flex items-start gap-4">
            <div className="h-24 w-40 rounded-md bg-blue-100 dark:bg-blue-900/40 flex flex-col items-center justify-center shrink-0 relative">
              <Video className="h-10 w-10 text-blue-600/70" />
              <span className="absolute bottom-1.5 text-[10px] font-medium text-blue-700/70 bg-white/70 dark:bg-background/70 px-1.5 py-0.5 rounded">
                Tutorial coming soon
              </span>
            </div>
            <div className="flex-1 space-y-2">
              <h2 className="text-base font-semibold">
                Year End Accounting - Tips and Tricks
              </h2>
              <p className="text-sm text-muted-foreground">
                Learn the essential guidelines for closing your books at
                the end of the fiscal year, and see how Quikfinance can
                help you take care of it.
              </p>
              <div className="flex items-center gap-2 text-xs text-muted-foreground pt-1">
                <Phone className="h-3.5 w-3.5" />
                Need help?{" "}
                <Link
                  href="mailto:support@quikfinance.in"
                  className="text-primary hover:underline ml-1"
                >
                  Email support
                </Link>
              </div>
            </div>
          </div>
        </div>

        {/* ── Auto-close note banner (amber) ───────────────────── */}
        <div className="rounded-lg border border-amber-200 bg-amber-50/60 dark:border-amber-900/40 dark:bg-amber-950/20 px-5 py-3.5">
          <div className="flex items-start gap-3 text-sm">
            <Info className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
            <p className="text-amber-900 dark:text-amber-200/90">
              <span className="font-semibold">Note:</span> Quikfinance
              closes the accounts, carries-forward the balances and
              reopens them automatically for the new financial year. So,
              you don&apos;t have to worry about closing and opening
              your books of accounts.{" "}
              <Link
                href="/help/fiscal-year-end-tasks#close-books-for-year"
                className="text-blue-600 hover:underline whitespace-nowrap"
              >
                Know More
              </Link>
            </p>
          </div>
        </div>

        {/* ── Tasks card ───────────────────────────────────────── */}
        <Card className="p-0">
          <div className="px-5 py-4 border-b bg-muted/30">
            <h2 className="text-base font-semibold">
              Things to do before the fiscal year-end
            </h2>
          </div>
          <div className="divide-y">
            <TaskRow
              icon={Mail}
              iconBg="bg-orange-50 dark:bg-orange-950/40"
              iconColor="text-orange-600"
              title="Send customer statements to your customers and get paid faster"
              description="If you have customers whose invoices are overdue, go to the respective contact > select Statement > select a period > Send Email."
              ctaHref="/sales/customers"
              ctaLabel="Open Customers"
            />
            <TaskRow
              icon={AlertTriangle}
              iconBg="bg-rose-50 dark:bg-rose-950/40"
              iconColor="text-rose-600"
              title="Write off bad debts"
              description="If you have customers who haven't paid you in a long time, you can write off those bad debts. Select the particular invoice > More > Write Off."
              ctaHref="/sales/invoices?status=overdue"
              ctaLabel="Open Overdue Invoices"
            />
            <TaskRow
              icon={Wallet}
              iconBg="bg-emerald-50 dark:bg-emerald-950/40"
              iconColor="text-emerald-600"
              title="Handle prepaid expenses"
              description="Categorise the prepaid payments you've made to insurance or other services as expenses."
              ctaHref="/accountant/manual-journals/new"
              ctaLabel="New Manual Journal"
            />
            <TaskRow
              icon={Package}
              iconBg="bg-orange-50 dark:bg-orange-950/40"
              iconColor="text-orange-600"
              title="Take stock of your inventory"
              description="Evaluate your inventory and check if there are goods that are not in a sellable condition or not selling, and adjust your stock accordingly."
              ctaHref="/inventory"
              ctaLabel="Open Inventory"
            />
            <TaskRow
              icon={FileCheck}
              iconBg="bg-emerald-50 dark:bg-emerald-950/40"
              iconColor="text-emerald-600"
              title={`Generate and file GSTR-9`}
              description={`Finalise your transactions for the financial year ${fyLabel} and generate your GSTR-9 from Quikfinance. File the return before 31 December ${nextFyEndYear(organization.fiscalYearStart)}.`}
              ctaHref="/reports/gstr1"
              ctaLabel="Open GSTR reports"
            />
            <TaskRow
              icon={Hash}
              iconBg="bg-blue-50 dark:bg-blue-950/40"
              iconColor="text-blue-600"
              title="Update the auto-generated number sequence for transactions"
              description="Update the prefix and the starting number for each module in all the transaction number series created for your organisation."
              ctaHref="/settings/number-series"
              ctaLabel="Update Series"
            />
            <TaskRow
              icon={FileText}
              iconBg="bg-blue-50 dark:bg-blue-950/40"
              iconColor="text-blue-600"
              title={`Update the year to ${nextFyLabel} in your Terms and Conditions`}
              description="To update the year, go to Settings > Preferences > Invoices > Terms & Conditions, update the year, and save the preferences."
              ctaHref="/settings/preferences/invoices"
              ctaLabel="Open T&C"
            />
          </div>
        </Card>

        {/* ── Effortless Year-End Accounting (2 help cards) ──── */}
        <div className="space-y-3">
          <h2 className="text-base font-semibold">
            Effortless Year-End Accounting
          </h2>
          <div className="grid md:grid-cols-2 gap-4">
            <HelpCard
              icon={BookOpen}
              body="Wrap up your finances seamlessly with our ultimate guide to closing your books."
              href="/help/year-end-closing-guide"
            />
            <HelpCard
              icon={Video}
              body="Ace your year-end accounting with our simple yet effective tips and procedures."
              href="/help/year-end-tips-and-procedures"
            />
          </div>
        </div>

        {/* ── FAQs ──────────────────────────────────────────────── */}
        <div className="space-y-3">
          <h2 className="text-base font-semibold">
            Frequently asked questions
          </h2>
          <ul className="space-y-2 text-sm">
            <FaqRow
              href="/help/fiscal-year-end-tasks#modify-invoice-number"
              question="How do I modify the auto-generated invoice number for the new financial year?"
            />
            <FaqRow
              href="/help/fiscal-year-end-tasks#outstanding-customer-amounts"
              question="How do I find the outstanding amount that customers owe me?"
            />
            <FaqRow
              href="/help/fiscal-year-end-tasks#inventory-valuation"
              question="How do I get the exact value of the goods in my inventory?"
            />
            <FaqRow
              href="/help/fiscal-year-end-tasks#documents-for-tax-filing"
              question="What are the documents that I should send to my accountant to file my taxes?"
            />
          </ul>
          <Link
            href="/help/fiscal-year-end-tasks"
            className="inline-flex items-center gap-1 text-sm text-primary hover:underline"
          >
            View More Questions
            <ChevronRight className="h-3.5 w-3.5" />
          </Link>
        </div>
      </div>
    </div>
  );
}

function TaskRow({
  icon: Icon,
  iconBg,
  iconColor,
  title,
  description,
  ctaHref,
  ctaLabel,
}: {
  icon: React.ComponentType<{ className?: string }>;
  iconBg: string;
  iconColor: string;
  title: string;
  description: string;
  ctaHref: string;
  ctaLabel: string;
}) {
  return (
    <div className="flex items-start gap-4 px-5 py-4">
      <div className="shrink-0">
        <div
          className={`h-10 w-10 rounded-full flex items-center justify-center ${iconBg}`}
        >
          <Icon className={`h-5 w-5 ${iconColor}`} />
        </div>
      </div>
      <div className="flex-1 min-w-0 space-y-1">
        <h3 className="font-semibold text-sm leading-snug">{title}</h3>
        <p className="text-xs text-muted-foreground leading-relaxed">
          {description}
        </p>
      </div>
      <div className="shrink-0">
        <Button asChild variant="ghost" size="sm" className="gap-1">
          <Link href={ctaHref} className="text-primary">
            {ctaLabel}
            <ChevronRight className="h-3.5 w-3.5" />
          </Link>
        </Button>
      </div>
    </div>
  );
}

function HelpCard({
  icon: Icon,
  body,
  href,
}: {
  icon: React.ComponentType<{ className?: string }>;
  body: string;
  href: string;
}) {
  return (
    <div className="rounded-lg border bg-blue-50/40 dark:bg-blue-950/10 p-4 flex items-start gap-3">
      <div className="h-9 w-9 rounded-md bg-white dark:bg-blue-900/40 flex items-center justify-center shrink-0">
        <Icon className="h-4 w-4 text-blue-600" />
      </div>
      <div className="flex-1 space-y-2">
        <p className="text-sm text-foreground/90">{body}</p>
        <Link
          href={href}
          className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
        >
          Learn More
          <ChevronRight className="h-3 w-3" />
        </Link>
      </div>
    </div>
  );
}

function FaqRow({ href, question }: { href: string; question: string }) {
  return (
    <li className="flex items-start gap-2 leading-relaxed">
      <span className="text-muted-foreground mt-0.5">•</span>
      <Link
        href={href}
        className="text-primary hover:underline flex-1"
      >
        {question}
      </Link>
    </li>
  );
}

/** "Apr 2026 - Mar 2027" style label for the current FY. */
function currentFiscalYearLabel(startMonth: number): string {
  const now = new Date();
  const currentMonth = now.getUTCMonth() + 1;
  const currentYear = now.getUTCFullYear();
  const fyStartYear =
    currentMonth >= startMonth ? currentYear : currentYear - 1;
  return `${fyStartYear}-${fyStartYear + 1}`;
}

/** "2026-2027" — the NEXT FY (for T&C year update). */
function nextFiscalYearLabel(startMonth: number): string {
  const now = new Date();
  const currentMonth = now.getUTCMonth() + 1;
  const currentYear = now.getUTCFullYear();
  const fyStartYear =
    currentMonth >= startMonth ? currentYear : currentYear - 1;
  return `${fyStartYear + 1}-${fyStartYear + 2}`;
}

/** The end year for the GSTR-9 filing deadline note. */
function nextFyEndYear(startMonth: number): number {
  const now = new Date();
  const currentMonth = now.getUTCMonth() + 1;
  const currentYear = now.getUTCFullYear();
  const fyStartYear =
    currentMonth >= startMonth ? currentYear : currentYear - 1;
  return fyStartYear + 1;
}
