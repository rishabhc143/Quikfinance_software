import { ExternalLink } from "lucide-react";
import { db } from "@/lib/db";
import { requireOrganization } from "@/lib/auth-helpers";
import { SettingsShell } from "@/components/shared/settings-shell";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { RazorpayMark } from "./razorpay-mark";
import { SetupDialog } from "./setup-dialog";
import { DisconnectDialog } from "./disconnect-dialog";
import { CardVerificationDialog } from "./card-verification-dialog";

export const metadata = { title: "Customer Payments" };

/**
 * M17b: Razorpay-only customer-payments settings page. Renders the
 * single Razorpay card; no Paytm or gateways exist
 * here per the patch spec.
 */
export default async function CustomerPaymentsPage() {
  const { organization } = await requireOrganization();

  const cfg = await db.paymentGatewayConfig.findUnique({
    where: { organizationId: organization.id },
  });
  const enabled = cfg?.razorpayEnabled ?? false;
  const cardVerification = cfg?.cardVerificationEnabled ?? false;

  // Build webhook URL from APP_URL or NEXTAUTH_URL fallback. Shown in
  // the setup modal (read-only with copy).
  const webhookUrl =
    `${process.env.APP_URL ?? process.env.NEXT_PUBLIC_APP_URL ?? process.env.NEXTAUTH_URL ?? ""}/api/webhooks/razorpay`;

  return (
    <SettingsShell
      title="Customer Payments"
      description="Connect a payment gateway to accept online payments from your customers."
    >
      <div className="flex justify-end">
        <CardVerificationDialog
          enabled={cardVerification}
          trigger={
            <button
              type="button"
              className="text-sm text-primary hover:underline"
            >
              Card Verification Settings
            </button>
          }
        />
      </div>

      <Card>
        <CardContent className="pt-6 space-y-4">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-center gap-3">
              <RazorpayMark className="h-7 w-auto" />
              <Badge
                variant="outline"
                className="border-orange-500 text-orange-600 bg-orange-50"
              >
                Preferred Gateway
              </Badge>
            </div>
            <div className="flex items-center gap-2">
              {enabled ? (
                <>
                  <SetupDialog
                    initial={{
                      mode: (cfg?.razorpayMode as "test" | "live") ?? "test",
                      keyId: cfg?.razorpayKeyId ?? "",
                    }}
                    webhookUrl={webhookUrl}
                    triggerLabel="Manage"
                    triggerVariant="outline"
                  />
                  <DisconnectDialog
                    trigger={
                      <button
                        type="button"
                        className="text-sm text-destructive hover:underline"
                      >
                        Disconnect
                      </button>
                    }
                  />
                </>
              ) : (
                <SetupDialog
                  initial={{ mode: "test", keyId: "" }}
                  webhookUrl={webhookUrl}
                  triggerLabel="Set Up Now"
                  triggerVariant="default"
                />
              )}
            </div>
          </div>
          <p className="text-sm text-muted-foreground">
            Razorpay is a payments platform supporting both domestic and
            international payments. Enjoy the industry&apos;s best success
            rates &amp; 100+ payment options to grow your business. Also,
            empower your customers with various EMI options.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-6 space-y-2">
          <div className="text-sm font-semibold">Online Transaction Fees</div>
          <a
            href="https://razorpay.com/pricing/"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-sm text-primary hover:underline"
          >
            View Razorpay&apos;s Transaction Fees
            <ExternalLink className="h-3 w-3" />
          </a>
        </CardContent>
      </Card>

      {enabled ? (
        <Card>
          <CardContent className="pt-6 text-sm">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-xs uppercase tracking-wider text-muted-foreground">
                  Mode
                </div>
                <div className="font-medium uppercase">{cfg?.razorpayMode}</div>
              </div>
              <div>
                <div className="text-xs uppercase tracking-wider text-muted-foreground">
                  Key ID
                </div>
                <div className="font-mono text-xs">
                  {cfg?.razorpayKeyId ?? "—"}
                </div>
              </div>
              <div>
                <div className="text-xs uppercase tracking-wider text-muted-foreground">
                  Activated
                </div>
                <div className="text-xs">
                  {cfg?.razorpayActivatedAt
                    ? new Date(cfg.razorpayActivatedAt).toLocaleString()
                    : "—"}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      ) : null}
    </SettingsShell>
  );
}
