import Link from "next/link";
import {
  Sparkles,
  BookOpen,
  Wallet,
  CreditCard,
  Users,
  Bell,
  Shield,
  FileBadge,
  Phone,
  Video,
} from "lucide-react";
import { db } from "@/lib/db";
import { requireOrganization } from "@/lib/auth-helpers";
import { ChecklistCard, type ChecklistItem } from "./checklist-card";
import { FeatureCard } from "./feature-card";

export const metadata = { title: "Getting Started" };

/**
 * Getting Started — onboarding hub.
 *
 * Mirrors the Zoho Books layout from the user-shared screenshots:
 *
 *   1. Welcome header — "Hello, <first-name>" + org name + helpline
 *   2. Hero card — "Getting Started with Quikfinance" intro
 *   3. Two-pane checklist — 5 items with auto-detected + manual
 *      "Mark as Completed" persistence
 *   4. "Explore useful features and set up Quikfinance" — 7-card
 *      grid linking to real configuration pages
 *
 * Every button is functional:
 *   - Checklist actions → routes to the relevant new-record page
 *   - Mark as Completed → server-side upsert in
 *     UserChecklistProgress
 *   - Feature card Configure → real settings/* route
 *   - Watch & Learn → tooltip ("Tutorial videos coming soon" —
 *     we don't have a video library yet)
 */
export default async function GettingStartedPage() {
  const { organization, user } = await requireOrganization();

  // ── Auto-detect signals (parallel COUNT queries).
  // Wrapped per-query so a single missing table or transient DB
  // error doesn't 500 the whole page. Fail-open → 0 / [] which
  // makes the corresponding checklist item just look incomplete.
  const [
    customerCount,
    vendorCount,
    bankAccountCount,
    journalEntryCount,
    invoiceCount,
    billCount,
    completedItems,
  ] = await Promise.all([
    safeCount(() =>
      db.contact.count({
        where: { organizationId: organization.id, type: "CUSTOMER" },
      })
    ),
    safeCount(() =>
      db.contact.count({
        where: { organizationId: organization.id, type: "VENDOR" },
      })
    ),
    safeCount(() =>
      db.bankAccount.count({ where: { organizationId: organization.id } })
    ),
    safeCount(() =>
      db.manualJournal.count({ where: { organizationId: organization.id } })
    ),
    safeCount(() =>
      db.invoice.count({ where: { organizationId: organization.id } })
    ),
    safeCount(() =>
      db.bill.count({ where: { organizationId: organization.id } })
    ),
    fetchCompletedItems(user.id, organization.id),
  ]);
  const completedKeys = new Set(completedItems);

  // First-name guess: pull from User.name or email local-part.
  const displayFirstName =
    user.name?.trim().split(/\s+/)[0] ??
    user.email?.split("@")[0] ??
    "there";

  // Checklist items (5 to match Zoho's left rail).
  const items: ChecklistItem[] = [
    {
      key: "add-organisation-details",
      label: "Add Organisation Details",
      done: completedKeys.has("add-organisation-details"),
      paneTitle: "Add Organisation Details",
      paneBody:
        "Add your organization's address and tax details to Quikfinance to auto-populate them when you create transactions. Also, add users to provide access to your employees and accountants.",
      autoDoneLine: organization.gstin
        ? "Great! You've added the tax details!"
        : null,
      actions: [
        { label: "Add Address", href: "/settings/profile" },
        { label: "Invite User", href: "/settings/users" },
      ],
    },
    {
      key: "create-first-invoice",
      label: "Create your first invoice",
      done: invoiceCount > 0 || completedKeys.has("create-first-invoice"),
      paneTitle: "Create your first invoice",
      paneBody:
        "Bill a customer for goods or services. The Invoice's line items + GST flow automatically into your Profit and Loss and into Accounts Receivable on your Balance Sheet.",
      autoDoneLine:
        invoiceCount > 0
          ? `Great! You've created ${invoiceCount} invoice${invoiceCount === 1 ? "" : "s"}.`
          : null,
      actions: [
        { label: "New Invoice", href: "/sales/invoices/new", primary: true },
        { label: "View all invoices", href: "/sales/invoices" },
      ],
    },
    {
      key: "create-first-bill-expense",
      label: "Create your first bill and expense",
      done: billCount > 0 || completedKeys.has("create-first-bill-expense"),
      paneTitle: "Create your first bill and expense",
      paneBody:
        "Capture a vendor invoice or one-off expense. Bills become liabilities on your Balance Sheet; expenses hit your P&L immediately. Both inform your tax filings.",
      autoDoneLine:
        billCount > 0
          ? `Great! You've recorded ${billCount} bill${billCount === 1 ? "" : "s"}.`
          : null,
      actions: [
        { label: "New Bill", href: "/purchases/bills/new", primary: true },
        { label: "New Expense", href: "/purchases/expenses/new" },
      ],
    },
    {
      key: "setup-banking-journals",
      label: "Set up banking and journals",
      done:
        bankAccountCount > 0 ||
        journalEntryCount > 0 ||
        completedKeys.has("setup-banking-journals"),
      paneTitle: "Set up banking and journals",
      paneBody:
        "Add at least one bank account so you can record Payments Made/Received, reconcile statements, and produce a meaningful Cash Flow Statement. Use Manual Journal Entries for one-off adjustments like depreciation.",
      autoDoneLine:
        bankAccountCount > 0
          ? `Great! You have ${bankAccountCount} bank account${bankAccountCount === 1 ? "" : "s"} configured.`
          : null,
      actions: [
        { label: "Add Bank Account", href: "/banking", primary: true },
        {
          label: "New Manual Journal",
          href: "/accountant/manual-journals/new",
        },
      ],
    },
    {
      key: "add-customers-vendors",
      label: "Add Customers and Vendors",
      done:
        (customerCount > 0 && vendorCount > 0) ||
        completedKeys.has("add-customers-vendors"),
      paneTitle: "Add Customers and Vendors",
      paneBody:
        "Customers are required to issue Invoices; Vendors are required to record Bills. Capture name + GSTIN so the GST input tax credit flows correctly.",
      autoDoneLine:
        customerCount > 0 || vendorCount > 0
          ? `Great! ${customerCount} customer${customerCount === 1 ? "" : "s"}, ${vendorCount} vendor${vendorCount === 1 ? "" : "s"} so far.`
          : null,
      actions: [
        {
          label: "Add Customer",
          href: "/sales/customers/new",
          primary: true,
        },
        { label: "Add Vendor", href: "/purchases/vendors/new" },
      ],
    },
  ];

  // Build the portal URL so the Customer/Vendor Portals card can show
  // it inline like Zoho's screenshot. Falls back to a placeholder
  // when env doesn't expose the public app URL.
  const appUrl =
    process.env.NEXT_PUBLIC_APP_URL ?? "https://quikfinance-software.vercel.app";
  const portalUrl = `${appUrl}/portal/${organization.id}`;

  return (
    <div className="min-h-screen">
      {/* ── Top welcome banner ────────────────────────────────── */}
      <div className="border-b bg-gradient-to-b from-muted/30 to-background">
        <div className="max-w-6xl mx-auto px-6 py-6 flex items-start justify-between gap-4">
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
              <span className="text-muted-foreground">Quikfinance India Helpline:</span>{" "}
              <span className="font-medium">18003093036</span>
            </div>
            <div className="text-xs text-muted-foreground">
              Mon - Fri · 9:00 AM - 7:00 PM · Toll Free
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-6 py-6 space-y-6">
        {/* ── Welcome / hero card ──────────────────────────────── */}
        <div className="rounded-lg border bg-blue-50/40 dark:bg-blue-950/10 p-5">
          <div className="flex items-start gap-4">
            <div className="h-24 w-40 rounded-md bg-blue-100 dark:bg-blue-900/40 flex items-center justify-center shrink-0">
              <Video className="h-10 w-10 text-blue-600/70" />
            </div>
            <div className="flex-1 space-y-2">
              <h2 className="text-base font-semibold">
                Getting Started with Quikfinance
              </h2>
              <p className="text-sm text-muted-foreground">
                The easy-to-use accounting software you can set up in no
                time. Walk through the 5 steps below to get your books
                ready for your first transaction.
              </p>
              <div className="flex items-center gap-2 text-xs text-muted-foreground pt-1">
                <Phone className="h-3.5 w-3.5" />
                Need help getting started?{" "}
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

        {/* ── 2-pane checklist ─────────────────────────────────── */}
        <ChecklistCard items={items} />

        {/* ── Explore useful features ─────────────────────────── */}
        <div className="space-y-1 text-center pt-6">
          <h2 className="text-xl font-semibold">
            Explore useful features and set up Quikfinance
          </h2>
          <p className="text-sm text-muted-foreground">
            Your journey to effortlessly manage your accounting starts
            here.
          </p>
        </div>

        <div className="grid md:grid-cols-2 gap-4">
          <FeatureCard
            icon={BookOpen}
            title="Configure Chart of Accounts"
            description="The Chart of Accounts in Quikfinance contains a list of default accounts that can be used by any type of business. If there are other accounts that your business needs, you can create them."
            configureHref="/accountant/chart-of-accounts"
            configureLabel="Configure"
            primary
          />
          <FeatureCard
            icon={Wallet}
            title="Enter Opening Balances"
            description="If you're migrating from another software you must enter the opening balances in Quikfinance before you start creating transactions to keep your books intact."
            configureHref="/settings/opening-balances"
            configureLabel="Configure"
          />
          <FeatureCard
            icon={CreditCard}
            title="Connect with Payment Gateways"
            description="Integrate with leading payment gateways and collect payments faster from your customers."
            configureHref="/settings/online-payments/customer-payments"
            configureLabel="Configure"
            extra={
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <span className="inline-flex items-center gap-1.5 rounded border bg-background px-2 py-1">
                  Razorpay
                </span>
                <span className="inline-flex items-center gap-1.5 rounded border bg-background px-2 py-1 opacity-60">
                  Stripe · soon
                </span>
                <span className="inline-flex items-center gap-1.5 rounded border bg-background px-2 py-1 opacity-60">
                  PayPal · soon
                </span>
              </div>
            }
          />
          <FeatureCard
            icon={Users}
            title="Enable Customer and Vendor Portals"
            description="Customer and vendor portals let your customers and vendors track and communicate with you about all the transactions you've created for them."
            configureHref="/settings/customer-portal"
            configureLabel="Set up"
            extra={
              <div className="text-xs">
                <span className="text-muted-foreground">URL:</span>{" "}
                <a
                  href={portalUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="text-primary hover:underline break-all"
                >
                  {portalUrl}
                </a>
              </div>
            }
          />
          <FeatureCard
            icon={Bell}
            title="Set up Payment Reminders"
            description="Payment reminders let you remind your customers to make their due payments. Configure them to send automated emails and SMSes and collect payments on time."
            configureHref="/settings/reminders"
            configureLabel="Set up"
          />
          <FeatureCard
            icon={Shield}
            title="Configure Roles and Permissions"
            description="Add your employees, timesheet staff, and accountants as users to Quikfinance by configuring different roles and permissions for them."
            configureHref="/settings/roles"
            configureLabel="Configure"
          />
          <FeatureCard
            icon={FileBadge}
            title="Update Your GST Settings"
            description="If your business is registered under GST, add your GSTIN to enable GST tax management, create transactions, and file your returns directly from Quikfinance."
            configureHref="/settings/profile"
            configureLabel="Configure"
          />
        </div>

        <div className="text-xs text-muted-foreground text-center pt-4">
          Done with setup? Head to the{" "}
          <Link
            href="/"
            className="text-primary hover:underline"
          >
            Dashboard
          </Link>{" "}
          or open the{" "}
          <Link href="/reports" className="text-primary hover:underline">
            Reports Center
          </Link>
          .
        </div>
      </div>
    </div>
  );
}

async function fetchCompletedItems(
  userId: string,
  organizationId: string
): Promise<string[]> {
  try {
    const rows = await db.userChecklistProgress.findMany({
      where: { userId, organizationId },
      select: { itemKey: true },
    });
    return rows.map((r) => r.itemKey);
  } catch (err) {
    // Fail-open: if the table doesn't exist yet (migration lag),
    // pretend nothing is checked. The page still renders + the
    // auto-detect signals still work.
    console.error(
      "[getting-started] UserChecklistProgress query failed",
      err
    );
    return [];
  }
}

/**
 * Wraps a single COUNT query in a try/catch so one missing table
 * or transient DB error doesn't blow up Promise.all and 500 the
 * whole page. Fail-open returns 0 — the corresponding checklist
 * item just looks incomplete until the underlying data appears.
 */
async function safeCount(fn: () => Promise<number>): Promise<number> {
  try {
    return await fn();
  } catch (err) {
    console.error("[getting-started] safeCount query failed", err);
    return 0;
  }
}
