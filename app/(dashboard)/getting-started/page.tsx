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
  Circle,
  ArrowRight,
} from "lucide-react";

export const metadata = { title: "Getting Started" };

// Force dynamic + opt out of all caching to ensure stale 500
// responses can never be served from edge or browser cache after
// this deploy.
export const dynamic = "force-dynamic";
export const revalidate = 0;

/**
 * Getting Started — fully static rendering.
 *
 * This is the nuclear-option simplification after several rounds
 * of defensive wrapping failed to stop the page hitting error.tsx
 * on prod. Zero DB calls, zero auth dependencies, zero client
 * components. Just inline JSX that renders identically every
 * request.
 *
 * Trade-off: Mark-as-Completed and auto-detection (e.g. "you've
 * created 3 invoices") are temporarily disabled. Every Configure
 * link still works (they're plain anchors), so the user can still
 * use this as the onboarding hub.
 *
 * Once we confirm this version renders cleanly on prod, the next
 * PR re-introduces the dynamic data behind a single try/catch
 * with an absolutely-failsafe fallback path.
 */
export default function GettingStartedPage() {
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
                Welcome to Quikfinance
              </h1>
              <p className="text-sm text-muted-foreground">
                The easy-to-use accounting software you can set up in
                no time.
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

      <div className="max-w-6xl mx-auto px-6 py-6 space-y-6">
        {/* ── Hero card ────────────────────────────────────────── */}
        <div className="rounded-lg border bg-blue-50/40 dark:bg-blue-950/10 p-5">
          <div className="flex items-start gap-4">
            <div className="h-24 w-40 rounded-md bg-blue-100 dark:bg-blue-900/40 flex items-center justify-center shrink-0 relative">
              <Video className="h-10 w-10 text-blue-600/70" />
              <span className="absolute bottom-1 right-1 text-[10px] bg-white/80 px-1 rounded">
                Coming soon
              </span>
            </div>
            <div className="flex-1 space-y-2">
              <h2 className="text-base font-semibold">
                Getting Started with Quikfinance
              </h2>
              <p className="text-sm text-muted-foreground">
                Walk through the 5 steps below to get your books ready
                for your first transaction. Configure your Chart of
                Accounts, capture opening balances, set up GST, and
                more.
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

        {/* ── "Let's get you up and running" — static checklist ── */}
        <div className="bg-background border rounded-lg overflow-hidden">
          <div className="flex items-center justify-between px-5 py-3.5 border-b">
            <h2 className="text-base font-semibold">
              Let&apos;s get you up and running
            </h2>
            <div className="flex items-center gap-2.5">
              <div className="w-40 h-1.5 rounded-full bg-muted overflow-hidden">
                <div
                  className="h-full bg-emerald-500"
                  style={{ width: "0%" }}
                />
              </div>
              <span className="text-xs tabular-nums text-emerald-700 font-medium">
                0% Completed
              </span>
            </div>
          </div>

          <div className="grid grid-cols-[280px_1fr] min-h-[280px]">
            {/* Left rail */}
            <div className="border-r py-2">
              <ChecklistRail
                items={CHECKLIST_ITEMS}
                activeKey="add-organisation-details"
              />
            </div>

            {/* Right pane — shows the FIRST item by default. */}
            <div className="p-6 space-y-4">
              <h3 className="text-base font-semibold">
                Add Organisation Details
              </h3>
              <p className="text-sm text-muted-foreground leading-relaxed">
                Add your organization&apos;s address and tax details to
                Quikfinance to auto-populate them when you create
                transactions. Also, add users to provide access to your
                employees and accountants.
              </p>
              <div className="border-t pt-4 flex items-center gap-3 flex-wrap">
                <Link
                  href="/settings/profile"
                  className="inline-flex items-center gap-1 text-sm text-primary hover:underline font-medium"
                >
                  Add Address
                  <ArrowRight className="h-3 w-3" />
                </Link>
                <Link
                  href="/settings/users"
                  className="inline-flex items-center gap-1 text-sm text-foreground hover:text-primary"
                >
                  Invite User
                </Link>
              </div>
            </div>
          </div>
        </div>

        {/* ── Explore useful features ──────────────────────────── */}
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

// ─── Static helpers (no client/server-side state) ────────────────

const CHECKLIST_ITEMS = [
  { key: "add-organisation-details", label: "Add Organisation Details" },
  { key: "create-first-invoice", label: "Create your first invoice" },
  {
    key: "create-first-bill-expense",
    label: "Create your first bill and expense",
  },
  { key: "setup-banking-journals", label: "Set up banking and journals" },
  { key: "add-customers-vendors", label: "Add Customers and Vendors" },
];

function ChecklistRail({
  items,
  activeKey,
}: {
  items: { key: string; label: string }[];
  activeKey: string;
}) {
  return (
    <>
      {items.map((it) => {
        const isActive = it.key === activeKey;
        return (
          <div
            key={it.key}
            className={
              "w-full text-left flex items-center gap-2 px-5 py-3 text-sm " +
              (isActive
                ? "bg-background border-l-2 border-primary font-medium text-foreground"
                : "text-muted-foreground border-l-2 border-transparent")
            }
          >
            {isActive ? (
              <Circle className="h-4 w-4 text-primary shrink-0" />
            ) : (
              <Circle className="h-4 w-4 text-muted-foreground/40 shrink-0" />
            )}
            <span className="truncate">{it.label}</span>
          </div>
        );
      })}
    </>
  );
}

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
