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
  PlayCircle,
} from "lucide-react";
import { db } from "@/lib/db";
import { requireOrganization } from "@/lib/auth-helpers";
import { ChecklistCard, type ChecklistItem } from "./checklist-card";

export const metadata = { title: "Getting Started" };

// Force dynamic; we read auth + DB so it has to render per
// request. Belt-and-suspenders against any stale edge cache from
// the previous broken builds.
export const dynamic = "force-dynamic";
export const revalidate = 0;

type AuthCtx = Awaited<ReturnType<typeof requireOrganization>>;

/**
 * Getting Started — onboarding hub.
 *
 * The page passes ONLY serialisable data (plain objects with
 * strings + nested arrays of {label,href} objects) to the
 * <ChecklistCard> client component. We never pass a function or
 * a forwardRef-component across the server→client boundary
 * (that was the digest-668202148 bug fixed in PR #177).
 *
 * Features grid uses inline <StaticFeatureCard> (server
 * component) so lucide icons stay on the server side.
 */
export default async function GettingStartedPage() {
  // ── Auth + org bootstrap ─────────────────────────────────────
  let auth: AuthCtx | null = null;
  try {
    auth = await requireOrganization();
  } catch (err) {
    console.error(
      "[getting-started] requireOrganization failed — anon render",
      err
    );
  }

  // ── Data fetch + item construction ──────────────────────────
  let items: ChecklistItem[] = STATIC_ITEMS;
  let displayFirstName = "there";
  let organizationName: string | null = null;

  if (auth) {
    const { user, organization } = auth;
    organizationName = organization.name;
    displayFirstName =
      user.name?.trim().split(/\s+/)[0] ??
      user.email?.split("@")[0] ??
      "there";

    try {
      items = await buildLiveItems(auth);
    } catch (err) {
      console.error(
        "[getting-started] buildLiveItems failed — falling back to static items",
        err
      );
    }
  }

  return (
    <div className="min-h-screen">
      {/* ── Top welcome banner ─────────────────────────────────── */}
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
              {organizationName ? (
                <p className="text-sm text-muted-foreground">
                  {organizationName}
                </p>
              ) : (
                <p className="text-sm text-muted-foreground">
                  Welcome to Quikfinance
                </p>
              )}
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

      <div className="max-w-6xl mx-auto px-6 py-6 space-y-6">
        {/* ── Hero card ────────────────────────────────────────── */}
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
                The easy-to-use accounting software you can set up
                in no time. Walk through the 5 steps below to get
                your books ready for your first transaction.
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

        {/* ── Click-switchable 2-pane checklist (CLIENT) ──────── */}
        <ChecklistCard items={items} />

        {/* ── Explore useful features ──────────────────────────── */}
        <div className="space-y-1 text-center pt-6">
          <h2 className="text-xl font-semibold">
            Explore useful features and set up Quikfinance
          </h2>
          <p className="text-sm text-muted-foreground">
            Your journey to effortlessly manage your accounting
            starts here.
          </p>
        </div>

        <div className="grid md:grid-cols-2 gap-4">
          <StaticFeatureCard
            icon={BookOpen}
            title="Configure Chart of Accounts"
            description="The Chart of Accounts in Quikfinance contains a list of default accounts that can be used by any type of business. If there are other accounts that your business needs, you can create them."
            configureHref="/accountant/chart-of-accounts"
            configureLabel="Configure"
            primary
          />
          <StaticFeatureCard
            icon={Wallet}
            title="Enter Opening Balances"
            description="If you're migrating from another software you must enter the opening balances in Quikfinance before you start creating transactions to keep your books intact."
            configureHref="/settings/opening-balances"
            configureLabel="Configure"
          />
          <StaticFeatureCard
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
          <StaticFeatureCard
            icon={Users}
            title="Enable Customer and Vendor Portals"
            description="Customer and vendor portals let your customers and vendors track and communicate with you about all the transactions you've created for them."
            configureHref="/settings/customer-portal"
            configureLabel="Set up"
          />
          <StaticFeatureCard
            icon={Bell}
            title="Set up Payment Reminders"
            description="Payment reminders let you remind your customers to make their due payments. Configure them to send automated emails and SMSes and collect payments on time."
            configureHref="/settings/reminders"
            configureLabel="Set up"
          />
          <StaticFeatureCard
            icon={Shield}
            title="Configure Roles and Permissions"
            description="Add your employees, timesheet staff, and accountants as users to Quikfinance by configuring different roles and permissions for them."
            configureHref="/settings/roles"
            configureLabel="Configure"
          />
          <StaticFeatureCard
            icon={FileBadge}
            title="Update Your GST Settings"
            description="If your business is registered under GST, add your GSTIN to enable GST tax management, create transactions, and file your returns directly from Quikfinance."
            configureHref="/settings/profile"
            configureLabel="Configure"
          />
        </div>

        <div className="text-xs text-muted-foreground text-center pt-4">
          Done with setup? Head to the{" "}
          <Link href="/" className="text-primary hover:underline">
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

// ─── Helpers ────────────────────────────────────────────────────

/**
 * Static fallback items array — used when auth fails OR DB fetch
 * fails. Every action route is hardcoded so the page is fully
 * navigable even with no auto-detect signals.
 */
const STATIC_ITEMS: ChecklistItem[] = [
  {
    key: "add-organisation-details",
    label: "Add Organisation Details",
    done: false,
    paneTitle: "Add Organisation Details",
    paneBody:
      "Add your organization's address and tax details to Quikfinance to auto-populate them when you create transactions. Also, add users to provide access to your employees and accountants.",
    actions: [
      { label: "Add Address", href: "/settings/profile", primary: true },
      { label: "Invite User", href: "/settings/users" },
    ],
  },
  {
    key: "create-first-invoice",
    label: "Create your first invoice",
    done: false,
    paneTitle: "Create your first invoice",
    paneBody:
      "Bill a customer for goods or services. The Invoice's line items + GST flow automatically into your Profit and Loss and into Accounts Receivable on your Balance Sheet.",
    actions: [
      { label: "New Invoice", href: "/sales/invoices/new", primary: true },
      { label: "View all invoices", href: "/sales/invoices" },
    ],
  },
  {
    key: "create-first-bill-expense",
    label: "Create your first bill and expense",
    done: false,
    paneTitle: "Create your first bill and expense",
    paneBody:
      "Capture a vendor invoice or one-off expense. Bills become liabilities on your Balance Sheet; expenses hit your P&L immediately. Both inform your tax filings.",
    actions: [
      { label: "New Bill", href: "/purchases/bills/new", primary: true },
      { label: "New Expense", href: "/purchases/expenses/new" },
    ],
  },
  {
    key: "setup-banking-journals",
    label: "Set up banking and journals",
    done: false,
    paneTitle: "Set up banking and journals",
    paneBody:
      "Add at least one bank account so you can record Payments Made/Received, reconcile statements, and produce a meaningful Cash Flow Statement. Use Manual Journal Entries for one-off adjustments like depreciation.",
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
    done: false,
    paneTitle: "Add Customers and Vendors",
    paneBody:
      "Customers are required to issue Invoices; Vendors are required to record Bills. Capture name + GSTIN so the GST input tax credit flows correctly.",
    actions: [
      { label: "Add Customer", href: "/sales/customers/new", primary: true },
      { label: "Add Vendor", href: "/purchases/vendors/new" },
    ],
  },
];

/**
 * Augments STATIC_ITEMS with `done` state (auto-detect via DB
 * counts + manually-marked) and contextual `autoDoneLine` hints.
 * Every Prisma call is wrapped so one missing table can't take
 * the page down.
 */
async function buildLiveItems({ user, organization }: AuthCtx): Promise<
  ChecklistItem[]
> {
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

  // Shallow-clone STATIC_ITEMS so we don't mutate the module
  // constant, then patch `done` + `autoDoneLine` per item.
  return STATIC_ITEMS.map((it) => {
    const next = { ...it };
    switch (it.key) {
      case "add-organisation-details":
        next.done = completedKeys.has(it.key);
        next.autoDoneLine = organization.gstin
          ? "Great! You've added the tax details!"
          : null;
        break;
      case "create-first-invoice":
        next.done = invoiceCount > 0 || completedKeys.has(it.key);
        next.autoDoneLine =
          invoiceCount > 0
            ? `Great! You've created ${invoiceCount} invoice${invoiceCount === 1 ? "" : "s"}.`
            : null;
        break;
      case "create-first-bill-expense":
        next.done = billCount > 0 || completedKeys.has(it.key);
        next.autoDoneLine =
          billCount > 0
            ? `Great! You've recorded ${billCount} bill${billCount === 1 ? "" : "s"}.`
            : null;
        break;
      case "setup-banking-journals":
        next.done =
          bankAccountCount > 0 ||
          journalEntryCount > 0 ||
          completedKeys.has(it.key);
        next.autoDoneLine =
          bankAccountCount > 0
            ? `Great! You have ${bankAccountCount} bank account${bankAccountCount === 1 ? "" : "s"} configured.`
            : null;
        break;
      case "add-customers-vendors":
        next.done =
          (customerCount > 0 && vendorCount > 0) ||
          completedKeys.has(it.key);
        next.autoDoneLine =
          customerCount > 0 || vendorCount > 0
            ? `Great! ${customerCount} customer${customerCount === 1 ? "" : "s"}, ${vendorCount} vendor${vendorCount === 1 ? "" : "s"} so far.`
            : null;
        break;
    }
    return next;
  });
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
    console.error(
      "[getting-started] UserChecklistProgress query failed",
      err
    );
    return [];
  }
}

async function safeCount(fn: () => Promise<number>): Promise<number> {
  try {
    return await fn();
  } catch (err) {
    console.error("[getting-started] safeCount query failed", err);
    return 0;
  }
}

/**
 * Server-side feature card — keeps lucide icon components on the
 * server-render side (never serialised across the boundary).
 */
function StaticFeatureCard({
  icon: Icon,
  title,
  description,
  configureHref,
  configureLabel,
  primary,
  extra,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  description: string;
  configureHref: string;
  configureLabel: string;
  primary?: boolean;
  extra?: React.ReactNode;
}) {
  return (
    <div
      className={
        "rounded-lg border bg-background p-5 flex gap-4 hover:shadow-sm transition " +
        (primary ? "border-primary ring-1 ring-primary/20" : "border-input")
      }
    >
      <div className="shrink-0">
        <div className="h-10 w-10 rounded-full bg-blue-50 dark:bg-blue-950/40 flex items-center justify-center">
          <Icon className="h-5 w-5 text-blue-600" />
        </div>
      </div>
      <div className="flex-1 min-w-0 space-y-2">
        <h3 className="font-semibold text-base leading-tight">{title}</h3>
        <p className="text-sm text-muted-foreground leading-relaxed">
          {description}
        </p>
        {extra ? <div className="pt-1">{extra}</div> : null}
        <div className="flex items-center gap-3 pt-3">
          <Link
            href={configureHref}
            className={
              "inline-flex items-center justify-center rounded-md text-sm font-medium h-9 px-4 " +
              (primary
                ? "bg-primary text-primary-foreground hover:bg-primary/90"
                : "bg-secondary text-secondary-foreground hover:bg-secondary/80")
            }
          >
            {configureLabel}
          </Link>
          <span className="inline-flex items-center gap-1.5 text-sm text-muted-foreground">
            <PlayCircle className="h-4 w-4" />
            Watch &amp; Learn
          </span>
        </div>
      </div>
    </div>
  );
}
