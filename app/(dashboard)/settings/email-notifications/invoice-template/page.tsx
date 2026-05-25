import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { db } from "@/lib/db";
import { requireOrganization } from "@/lib/auth-helpers";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { InvoiceEmailTemplateForm } from "./form";

export const metadata = { title: "Invoice Email Template" };

/**
 * SETTINGS — Invoice Email Template editor.
 *
 * Lets the Accounts team configure the default subject + body that
 * the "Send via Email" dialog pre-fills on every invoice. Saved
 * values live on `OrganizationPreference` (per-org).
 *
 * Null values fall back to the hard-coded template baked into
 * `send-invoice-dialog.tsx`.
 */
export default async function InvoiceEmailTemplatePage() {
  const { organization } = await requireOrganization();

  const pref = await db.organizationPreference.findUnique({
    where: { organizationId: organization.id },
    select: { invoiceEmailSubject: true, invoiceEmailBody: true },
  });

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-4">
      <div className="flex items-start gap-2">
        <Button asChild variant="ghost" size="icon" aria-label="Back">
          <Link href="/settings/email-notifications">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <div>
          <h1 className="text-xl font-semibold leading-tight">
            Invoice Email Template
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Customize the default subject and body for the &quot;Send via
            Email&quot; flow on Invoices.
          </p>
        </div>
      </div>

      <Card className="p-6">
        <InvoiceEmailTemplateForm
          initialSubject={pref?.invoiceEmailSubject ?? null}
          initialBody={pref?.invoiceEmailBody ?? null}
        />
      </Card>
    </div>
  );
}
