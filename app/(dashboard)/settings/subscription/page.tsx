import Link from "next/link";
import { format } from "date-fns";
import { db } from "@/lib/db";
import { requireOrganization } from "@/lib/auth-helpers";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { SettingsShell } from "@/components/shared/settings-shell";
import { Check } from "lucide-react";

export const metadata = { title: "Manage Subscription" };

const PLANS = [
  { id: "trial", name: "Trial", price: 0, interval: "14 days", features: ["All features", "Up to 3 users", "1 organization"] },
  { id: "starter", name: "Starter", price: 999, interval: "month", features: ["All features", "Up to 10 users", "Unlimited orgs", "Email support"] },
  { id: "professional", name: "Professional", price: 2499, interval: "month", features: ["Everything in Starter", "Workflow automation", "Priority support", "Custom roles"] },
  { id: "enterprise", name: "Enterprise", price: 0, interval: "Contact sales", features: ["Everything in Pro", "Dedicated success manager", "SLA + audits", "Volume pricing"] },
];

export default async function SubscriptionPage() {
  const { organization } = await requireOrganization();
  const aiCount = await db.aiMessage.count({ where: { conversation: { organizationId: organization.id } } });
  return (
    <SettingsShell title="Manage Subscription" description="Plan, billing, and Quikfinance Wallet credits.">
      <Card>
        <CardHeader><CardTitle className="text-base">Current plan</CardTitle></CardHeader>
        <CardContent>
          <div className="flex items-center gap-3">
            <Badge variant="default" className="text-base px-3 py-1 capitalize">{organization.planTier}</Badge>
            {organization.trialEndsAt && organization.planTier === "trial" && (
              <span className="text-sm text-muted-foreground">Trial ends {format(organization.trialEndsAt, "dd MMM yyyy")}</span>
            )}
          </div>
          <p className="text-xs text-muted-foreground mt-3">
            AI assistant messages used: <strong>{aiCount}</strong>
          </p>
        </CardContent>
      </Card>

      <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
        {PLANS.map((p) => (
          <Card key={p.id} className={organization.planTier === p.id ? "border-primary" : ""}>
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center justify-between">
                {p.name}
                {organization.planTier === p.id && <Badge variant="success">Current</Badge>}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-semibold">{p.price > 0 ? `₹${p.price}` : "—"}<span className="text-sm font-normal text-muted-foreground"> / {p.interval}</span></div>
              <ul className="mt-3 space-y-1 text-xs">
                {p.features.map((f) => (
                  <li key={f} className="flex items-start gap-1"><Check className="h-3.5 w-3.5 text-emerald-600 shrink-0 mt-0.5" /> {f}</li>
                ))}
              </ul>
              <Button asChild size="sm" variant="outline" className="w-full mt-4" disabled={organization.planTier === p.id}>
                <Link href={`mailto:billing@quikfinance.app?subject=Switch to ${p.name}`}>{organization.planTier === p.id ? "Selected" : `Switch to ${p.name}`}</Link>
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">Billing</CardTitle></CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          Real billing runs through Razorpay/Stripe in production. The plan-switch flow becomes an in-app checkout once payment keys are configured.
        </CardContent>
      </Card>
    </SettingsShell>
  );
}
