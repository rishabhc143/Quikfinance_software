import Link from "next/link";
import { db } from "@/lib/db";
import { requireOrganization } from "@/lib/auth-helpers";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Gstr1Form } from "./form";

export const metadata = { title: "GSTR-1 Export" };

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

export default async function Gstr1Page() {
  const { organization } = await requireOrganization();
  const now = new Date();
  // Default: previous month (the one users typically file).
  const defaultMonth = now.getUTCMonth() === 0 ? 12 : now.getUTCMonth();
  const defaultYear =
    now.getUTCMonth() === 0 ? now.getUTCFullYear() - 1 : now.getUTCFullYear();

  // Show a count of invoices in the default period as a sanity check.
  const periodStart = new Date(
    Date.UTC(defaultYear, defaultMonth - 1, 1, 0, 0, 0)
  );
  const periodEnd = new Date(
    Date.UTC(defaultYear, defaultMonth, 1, 0, 0, 0)
  );
  const previewCount = await db.invoice.count({
    where: {
      organizationId: organization.id,
      deletedAt: null,
      status: { in: ["SENT", "PARTIALLY_PAID", "PAID", "OVERDUE"] },
      issueDate: { gte: periodStart, lt: periodEnd },
    },
  });

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">GSTR-1 Export</h1>
          <p className="text-sm text-muted-foreground">
            Generate the GSTR-1 JSON for a tax period — upload to the GST
            portal or import into your filing tool.
          </p>
        </div>
      </div>

      {!organization.gstin ? (
        <Card>
          <CardContent className="py-6">
            <p className="text-sm">
              <strong>GSTIN not configured.</strong> Set your organization&apos;s
              GSTIN in{" "}
              <Link
                href="/settings/profile"
                className="text-primary hover:underline"
              >
                Settings → Organization Profile
              </Link>{" "}
              before generating a return.
            </p>
          </CardContent>
        </Card>
      ) : (
        <>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Period</CardTitle>
            </CardHeader>
            <CardContent>
              <Gstr1Form
                defaultMonth={defaultMonth}
                defaultYear={defaultYear}
                supplierGstin={organization.gstin}
              />
              <p className="text-xs text-muted-foreground mt-3">
                Default is the previous month ({MONTHS[defaultMonth - 1]}{" "}
                {defaultYear}) — adjust if you need an earlier period. Drafts
                and voided invoices are excluded.
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">
                Sanity check — {MONTHS[defaultMonth - 1]} {defaultYear}
              </CardTitle>
            </CardHeader>
            <CardContent className="text-sm">
              <p>
                <strong>{previewCount}</strong> reportable invoice
                {previewCount === 1 ? "" : "s"} in the default period (status
                SENT / PARTIALLY_PAID / PAID / OVERDUE).
              </p>
              {previewCount === 0 ? (
                <p className="text-muted-foreground mt-2">
                  No invoices to report — confirm the period is correct, or
                  pick a different month above.
                </p>
              ) : null}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">What&apos;s included</CardTitle>
            </CardHeader>
            <CardContent className="text-sm space-y-2">
              <ul className="list-disc pl-5 space-y-1">
                <li>
                  <strong>B2B</strong> — invoices to customers with a 15-char
                  GSTIN, grouped by customer
                </li>
                <li>
                  <strong>B2CS</strong> — invoices to unregistered customers,
                  aggregated by (place-of-supply × rate)
                </li>
                <li>
                  <strong>HSN summary</strong> — line-level HSN/SAC aggregated
                  across all invoices
                </li>
              </ul>
              <p className="text-xs text-muted-foreground pt-2">
                Not yet covered: B2CL (large-value unregistered), CDNR (credit
                / debit notes), exports, advance receipts. These can be added
                once we have invoices that need them.
              </p>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
