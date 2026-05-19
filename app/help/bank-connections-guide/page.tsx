import Link from "next/link";
import {
  Landmark,
  ChevronLeft,
  ChevronRight,
  Upload,
  Repeat,
  Zap,
  Shield,
  FileBadge,
} from "lucide-react";

export const metadata = {
  title: "How Bank Connections Work · Quikfinance",
};
export const dynamic = "force-static";

/**
 * Long-form guide that replaces the Zoho help link previously on
 * the Banking empty-state component. Public route.
 */
export default function BankConnectionsGuidePage() {
  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-background">
        <div className="max-w-4xl mx-auto px-6 py-3 flex items-center justify-between">
          <Link
            href="/"
            className="text-base font-semibold hover:text-primary"
          >
            Quikfinance
          </Link>
          <Link
            href="/banking"
            className="text-sm text-primary hover:underline"
          >
            ← Back to Banking
          </Link>
        </div>
      </header>

      <div className="border-b bg-gradient-to-b from-muted/30 to-background">
        <div className="max-w-3xl mx-auto px-6 py-10">
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-3">
            <Link
              href="/help"
              className="hover:text-primary inline-flex items-center gap-1"
            >
              <ChevronLeft className="h-3 w-3" />
              Help Center
            </Link>
            <ChevronRight className="h-3 w-3" />
            <span>How Bank Connections Work</span>
          </div>
          <div className="flex items-start gap-4">
            <div className="h-14 w-14 rounded-md bg-blue-50 dark:bg-blue-950/40 flex items-center justify-center shrink-0">
              <Landmark className="h-7 w-7 text-blue-600" />
            </div>
            <div>
              <h1 className="text-3xl font-semibold leading-tight">
                How Bank Connections Work
              </h1>
              <p className="text-sm text-muted-foreground mt-2">
                Three ways to get your bank into Quikfinance, how
                transactions sync, and how to reconcile cleanly.
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                7 min read
              </p>
            </div>
          </div>
        </div>
      </div>

      <article className="max-w-3xl mx-auto px-6 py-10 space-y-10">
        {/* Intro */}
        <section className="space-y-3">
          <p className="text-base leading-relaxed">
            A &ldquo;bank connection&rdquo; in Quikfinance just means
            we know about your bank account and can hold its
            transactions. There&apos;s a corresponding ledger account
            on your{" "}
            <Link
              href="/accountant/chart-of-accounts"
              className="text-primary hover:underline"
            >
              Chart of Accounts
            </Link>{" "}
            so every payment received and made automatically posts
            the right journal entry.
          </p>
          <p className="text-base leading-relaxed">
            You don&apos;t have to share online-banking credentials.
            Quikfinance doesn&apos;t log into your bank — you
            choose how to get transactions in.
          </p>
        </section>

        {/* Three ways */}
        <section className="space-y-3">
          <h2 className="text-xl font-semibold">
            Three ways to get transactions in
          </h2>
          <p className="text-base leading-relaxed">
            From the simplest to the most automated:
          </p>
          <div className="space-y-3 mt-3">
            <MethodCard
              n={1}
              icon={Landmark}
              title="Manual entry"
              detail="Record every Payment Received and Payment Made from inside Quikfinance. Best for low-volume businesses or cash transactions where there's no online statement."
            />
            <MethodCard
              n={2}
              icon={Upload}
              title="CSV statement import (recommended)"
              detail="Download a CSV statement from your bank's portal once a month (or weekly), drop it into Quikfinance, confirm the column mapping. Quikfinance fingerprints each transaction so re-importing the same statement doesn't create duplicates."
            />
            <MethodCard
              n={3}
              icon={Repeat}
              title="Auto-feed (coming soon)"
              detail="Live integration with your bank for daily transaction sync. We're working on partnerships with major Indian banks. Until this ships, CSV import is the standard."
            />
          </div>
        </section>

        {/* Setup */}
        <section className="space-y-3 border-t pt-8">
          <h2 className="text-xl font-semibold">
            Setting up your first bank account
          </h2>
          <ol className="list-decimal ml-5 space-y-2 text-base leading-relaxed">
            <li>
              Open{" "}
              <Link
                href="/banking/accounts"
                className="text-primary hover:underline"
              >
                Banking → Accounts
              </Link>{" "}
              and click{" "}
              <strong>Add Bank Account</strong>
            </li>
            <li>
              Pick the type:
              <ul className="list-disc ml-6 mt-1 space-y-0.5">
                <li>
                  <strong>Bank</strong> — current / savings / FD
                </li>
                <li>
                  <strong>Credit Card</strong> — appears as a
                  liability on your Balance Sheet
                </li>
                <li>
                  <strong>Cash</strong> — petty cash drawer
                </li>
              </ul>
            </li>
            <li>
              Fill in account number, IFSC, branch (for Bank). For
              Credit Card the last 4 digits + credit limit.
            </li>
            <li>
              Set the <strong>opening balance</strong> as of the date
              you started using Quikfinance. This is the balance per
              your bank statement at that point.
            </li>
            <li>
              Save.
            </li>
          </ol>
          <div className="text-xs text-muted-foreground bg-muted/40 border-l-2 border-primary/40 px-3 py-2 rounded-r">
            <span className="font-medium text-foreground">Tip:</span>{" "}
            The opening balance creates an offsetting entry to
            &ldquo;Opening Balance Equity&rdquo; — a temporary
            holding account your accountant clears at year-end.
            Don&apos;t worry about it now.
          </div>
        </section>

        {/* CSV import */}
        <section className="space-y-3 border-t pt-8">
          <h2 className="text-xl font-semibold">
            Importing a CSV statement
          </h2>
          <ol className="list-decimal ml-5 space-y-2 text-base leading-relaxed">
            <li>
              Log into your bank&apos;s online portal and download
              the period&apos;s statement as CSV (or Excel → Save
              As CSV).
            </li>
            <li>
              In Quikfinance, open the bank account and click{" "}
              <strong>Import Statement</strong>.
            </li>
            <li>
              Drag-drop the CSV. Quikfinance auto-detects columns
              (date, description, amount, balance). Re-map if it
              guesses wrong.
            </li>
            <li>
              Preview shows each row before commit. Duplicates are
              flagged automatically.
            </li>
            <li>
              Confirm — each row stages in the{" "}
              <strong>Categorise</strong> tab for review.
            </li>
          </ol>
          <p className="text-base leading-relaxed">
            From there, you either{" "}
            <strong>Match</strong> the bank transaction to an
            existing open invoice or bill (one-click marks it paid),
            or <strong>Categorise</strong> it directly to a GL
            account (e.g. bank fees → Bank Charges expense).
          </p>
        </section>

        {/* Bank rules */}
        <section className="space-y-3 border-t pt-8">
          <h2 className="text-xl font-semibold flex items-center gap-2">
            <Zap className="h-5 w-5 text-blue-600" />
            Auto-categorisation with Bank Rules
          </h2>
          <p className="text-base leading-relaxed">
            If you import statements regularly and see the same
            patterns (Uber rides, monthly rent, AWS bill), set up{" "}
            <strong>Bank Rules</strong> to auto-categorise. Future
            imports matching the rule auto-route to the right
            account — you only confirm.
          </p>
          <p className="text-base leading-relaxed">
            Examples:
          </p>
          <ul className="list-disc ml-6 space-y-1.5 text-base leading-relaxed">
            <li>
              <em>Description contains</em> &ldquo;UBER&rdquo; →
              Travel Expense
            </li>
            <li>
              <em>Description matches</em>{" "}
              <code>/AWS BILL.*/i</code> → Software Subscriptions
            </li>
            <li>
              <em>Amount equals</em> 45,000 + <em>monthly</em> →
              Office Rent
            </li>
          </ul>
          <p className="text-base leading-relaxed">
            Set up rules from the bank account&apos;s page → click{" "}
            <strong>Manage Rules</strong>.
          </p>
        </section>

        {/* Reconciliation */}
        <section className="space-y-3 border-t pt-8">
          <h2 className="text-xl font-semibold">
            Reconciliation (monthly)
          </h2>
          <p className="text-base leading-relaxed">
            Reconciliation is the periodic confirmation that
            Quikfinance&apos;s view of your bank balance matches your
            bank statement. Catches data-entry errors, missed
            transactions, and fraud.
          </p>
          <ol className="list-decimal ml-5 space-y-2 text-base leading-relaxed">
            <li>
              Get your bank statement for the period (e.g. April).
            </li>
            <li>
              On the bank account page, click{" "}
              <strong>Reconcile</strong>.
            </li>
            <li>
              Enter the statement&apos;s closing date and balance.
            </li>
            <li>
              Tick off each Quikfinance transaction that appears on
              the statement. The form shows a live difference.
            </li>
            <li>
              When difference = 0, click{" "}
              <strong>Finish Reconciliation</strong>.
            </li>
          </ol>
          <p className="text-base leading-relaxed">
            Common reasons for a non-zero difference:
          </p>
          <ul className="list-disc ml-6 space-y-1.5 text-base leading-relaxed">
            <li>Bank charges / SMS fees not yet entered</li>
            <li>Cheque issued but not yet cleared</li>
            <li>Interest credited but not recorded</li>
            <li>Typo on amount or date</li>
          </ul>
        </section>

        {/* Security */}
        <section className="space-y-3 border-t pt-8">
          <h2 className="text-xl font-semibold flex items-center gap-2">
            <Shield className="h-5 w-5 text-emerald-600" />
            Security
          </h2>
          <ul className="space-y-2 text-base leading-relaxed">
            <li>
              <strong>
                No online-banking credentials stored.
              </strong>{" "}
              Quikfinance never has your net-banking password. You
              control the data flow.
            </li>
            <li>
              <strong>Encrypted at rest.</strong> Bank account
              numbers, IFSCs, and transaction descriptions are
              stored encrypted in our Postgres database.
            </li>
            <li>
              <strong>TLS in transit.</strong> Every page load uses
              HTTPS.
            </li>
            <li>
              <strong>Role-based access.</strong> Decide which team
              members can see banking data via{" "}
              <Link
                href="/settings/roles"
                className="text-primary hover:underline"
              >
                Settings → Roles
              </Link>
              .
            </li>
          </ul>
        </section>

        {/* Related */}
        <section className="space-y-3 border-t pt-8">
          <h2 className="text-base font-semibold">
            Related FAQs
          </h2>
          <ul className="space-y-2 text-sm">
            <li>
              <Link
                href="/help/banking#add-bank-account"
                className="text-primary hover:underline"
              >
                How do I add a bank account?
              </Link>
            </li>
            <li>
              <Link
                href="/help/banking#import-bank-csv"
                className="text-primary hover:underline"
              >
                How do I import a bank statement?
              </Link>
            </li>
            <li>
              <Link
                href="/help/banking#reconcile"
                className="text-primary hover:underline"
              >
                How do I reconcile my bank account?
              </Link>
            </li>
            <li>
              <Link
                href="/help/banking#bank-rule"
                className="text-primary hover:underline"
              >
                How do I set up a bank rule?
              </Link>
            </li>
            <li>
              <Link
                href="/help/banking#undo-reconciliation"
                className="text-primary hover:underline"
              >
                How do I undo a reconciliation?
              </Link>
            </li>
          </ul>
        </section>

        {/* Support footer */}
        <section className="border-t pt-8">
          <div className="rounded-lg border bg-blue-50/40 dark:bg-blue-950/10 p-5 flex items-start gap-4">
            <div className="h-10 w-10 rounded-md bg-blue-100 dark:bg-blue-900/40 flex items-center justify-center shrink-0">
              <FileBadge className="h-5 w-5 text-blue-600" />
            </div>
            <div className="flex-1 space-y-1">
              <h3 className="text-base font-semibold">
                Banking-specific question?
              </h3>
              <p className="text-sm text-muted-foreground">
                We&apos;re happy to walk you through your first
                statement import.
              </p>
              <div className="flex items-center gap-4 text-sm pt-1">
                <a
                  href="mailto:support@quikfinance.in"
                  className="text-primary hover:underline"
                >
                  support@quikfinance.in
                </a>
                <span className="text-muted-foreground">
                  Helpline: 18003093036
                </span>
              </div>
            </div>
          </div>
        </section>
      </article>
    </div>
  );
}

function MethodCard({
  n,
  icon: Icon,
  title,
  detail,
}: {
  n: number;
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  detail: string;
}) {
  return (
    <div className="flex items-start gap-3 rounded-lg border bg-background p-4">
      <div className="h-9 w-9 rounded-full bg-blue-50 dark:bg-blue-950/40 flex items-center justify-center shrink-0 text-sm font-semibold text-blue-700">
        {n}
      </div>
      <div className="flex-1 space-y-1">
        <h3 className="text-base font-semibold flex items-center gap-2">
          <Icon className="h-4 w-4 text-blue-600" />
          {title}
        </h3>
        <p className="text-sm leading-relaxed text-muted-foreground">
          {detail}
        </p>
      </div>
    </div>
  );
}
