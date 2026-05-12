import Link from "next/link";
import { ArrowLeft, Building2, Sparkles } from "lucide-react";
import { db } from "@/lib/db";
import { requireOrganization } from "@/lib/auth-helpers";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { notifyMeBillPayBankAction } from "./actions";
import { NotifyMeButton } from "./notify-me-button";

export const metadata = { title: "Bill Pay Banks" };

/**
 * Partner-bank integration stub per <partner_bank_integration_stub>.
 *
 * Three bank cards (ICICI / HDFC / Axis) rendered with hand-rolled
 * mini-logos (NOT real bank trademarks per spec — those need licensing).
 * Each card carries:
 *   - "Coming Soon" badge
 *   - Disabled "Set Up" button
 *   - "Notify me when available" link that writes a UserPreference
 *     row (`notify_bill_pay_bank_<slug>=true`) and shows a toast.
 *
 * Linked from <PartnerBankPromo> which renders on three forms (Vendor
 * → Bank Details, Payments Made → Bill Payment / Vendor Advance).
 */

const PARTNERS: Array<{
  slug: string;
  name: string;
  tagline: string;
  description: string;
  accent: string;
  initials: string;
}> = [
  {
    slug: "icici",
    name: "ICICI Bank",
    tagline: "RTGS, NEFT, and IMPS for vendor payments",
    description:
      "Direct payment routing for ICICI corporate accounts. Bulk-pay your vendors, with reconciliation back into the Bill ledger.",
    accent: "from-orange-500 to-orange-600",
    initials: "ICICI",
  },
  {
    slug: "hdfc",
    name: "HDFC Bank",
    tagline: "Corporate payment files + API initiation",
    description:
      "Generate an HDFC-formatted payment file or initiate via API once we have your sandbox keys. Reconciles every paid Bill automatically.",
    accent: "from-blue-600 to-blue-700",
    initials: "HDFC",
  },
  {
    slug: "axis",
    name: "Axis Bank",
    tagline: "Connected Banking for Quikfinance accounts",
    description:
      "Connect your Axis Connected Banking account and let Quikfinance settle vendor bills with a one-click approval workflow.",
    accent: "from-purple-700 to-fuchsia-700",
    initials: "AXIS",
  },
];

export default async function BillPayBanksPage() {
  const { user, organization } = await requireOrganization();

  // Pre-load which partners the user has already opted into, so we
  // can render the "✓ We'll let you know" state on next visit.
  const prefs = await db.userPreference.findMany({
    where: {
      userId: user.id,
      organizationId: organization.id,
      key: { in: PARTNERS.map((p) => `notify_bill_pay_bank_${p.slug}`) },
    },
    select: { key: true, value: true },
  });
  const subscribed = new Set(
    prefs.filter((p) => p.value === "true").map((p) => p.key)
  );

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <nav aria-label="Breadcrumb" className="text-xs text-muted-foreground">
        <Link href="/settings" className="hover:underline">
          Settings
        </Link>
        <span className="mx-1">/</span>
        <Link href="/settings/integrations" className="hover:underline">
          Integrations &amp; Marketplace
        </Link>
        <span className="mx-1">/</span>
        <span aria-current="page">Bill Pay Banks</span>
      </nav>

      <div className="flex items-center gap-2">
        <Button asChild variant="ghost" size="icon" aria-label="Back">
          <Link href="/settings/integrations">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <Building2 className="h-5 w-5 text-muted-foreground" />
        <h1 className="text-2xl font-semibold tracking-tight">
          Bill Pay Banks
        </h1>
      </div>

      <Card className="border-amber-200 bg-amber-50/50 dark:bg-amber-950/20">
        <CardContent className="pt-6 flex items-start gap-3 text-sm">
          <Sparkles className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
          <div>
            <div className="font-medium">
              Partner-bank integration is on the roadmap
            </div>
            <p className="text-muted-foreground mt-1">
              Full implementation requires banking partnership agreements
              with each bank. We&apos;re working through them. In the
              meantime, you can pay your vendors via the existing
              Payments Made form using cash / cheque / bank transfer /
              UPI modes, and reconcile against your bank statements
              manually.
            </p>
            <p className="text-muted-foreground mt-2">
              Click <strong>Notify me</strong> below on any bank to get
              an email when the integration is live for your
              organization.
            </p>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-3">
        {PARTNERS.map((p) => {
          const key = `notify_bill_pay_bank_${p.slug}`;
          const isSubscribed = subscribed.has(key);
          return (
            <Card key={p.slug} className="overflow-hidden">
              <div
                className={`h-20 bg-gradient-to-br ${p.accent} flex items-center justify-center`}
              >
                <span className="text-white text-xl font-bold tracking-wider">
                  {p.initials}
                </span>
              </div>
              <CardContent className="pt-4 space-y-3">
                <div>
                  <div className="flex items-center justify-between">
                    <h2 className="font-semibold">{p.name}</h2>
                    <Badge variant="outline" className="text-xs">
                      Coming Soon
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {p.tagline}
                  </p>
                </div>
                <p className="text-xs text-muted-foreground min-h-[3rem]">
                  {p.description}
                </p>
                <div className="flex items-center gap-2 pt-1">
                  <Button
                    size="sm"
                    variant="outline"
                    disabled
                    title="Not yet available — click Notify me to be alerted when it ships."
                  >
                    Set Up
                  </Button>
                  <NotifyMeButton
                    bankSlug={p.slug}
                    bankName={p.name}
                    initialSubscribed={isSubscribed}
                    action={notifyMeBillPayBankAction}
                  />
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <p className="text-xs text-muted-foreground">
        Org: <span className="font-mono">{organization.name}</span> · You
        can opt in or out at any time — the notification is per-user.
      </p>
    </div>
  );
}
