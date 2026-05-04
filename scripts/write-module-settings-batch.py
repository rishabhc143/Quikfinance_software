"""Batch-write Module Settings sub-pages — each renders a per-module config card."""
from pathlib import Path

ROOT = Path(r"C:\Users\user\Quikfinance\app\(dashboard)\settings")

# Each module-settings page: title, description, link to its module list.
ENTRIES = [
  ("contacts", "Customers and Vendors", "Defaults for new contacts: payment terms, currency, tags.", "/contacts"),
  ("accountant", "Accountant", "Closing dates, journal numbering rules, accounting method (cash vs accrual).", "/accountant"),
  ("projects", "Projects", "Time-tracking rounding, billable defaults, project templates.", "/time/projects"),
  ("timesheet", "Timesheet", "Approval workflow for time entries, weekly minimums.", "/time/entries"),
  ("barcodes", "Embedded Barcodes", "EAN-13 / SKU barcodes printed on labels and PDFs.", "/items"),
  ("customer-payments", "Customer Payments", "Allowed methods (UPI, card, bank transfer) and surcharge rules.", "/sales/payments-received"),
  ("vendor-payments", "Vendor Payments", "Approval thresholds, default payment account.", "/purchases/payments-made"),
  ("quotes", "Quotes", "Default validity, terms, expiration auto-mark.", "/sales/quotes"),
  ("sales-orders", "Sales Orders", "Auto-confirm rules, fulfillment workflow steps.", "/sales/orders"),
  ("delivery-challans", "Delivery Challans", "Numbering, signature requirements.", "/sales/delivery-challans"),
  ("invoices", "Invoices", "Default payment terms, late-fee policy, footer text.", "/sales/invoices"),
  ("recurring-invoices", "Recurring Invoices", "Stop-on-first-failure flag, send-only-on-business-days flag.", "/sales/recurring-invoices"),
  ("payments-received", "Payments Received", "Auto-allocate-oldest-first, deposit-into account default.", "/sales/payments-received"),
  ("credit-notes", "Credit Notes", "Auto-apply to most-recent invoice, refund preference.", "/sales/credit-notes"),
  ("delivery-notes", "Delivery Notes", "Numbering and signature requirements.", "/sales/delivery-challans"),
  ("expenses", "Expenses", "Receipt-required threshold, default category.", "/purchases/expenses"),
  ("recurring-expenses", "Recurring Expenses", "Stop-on-first-failure, mid-cycle-amount-changes-allowed.", "/purchases/recurring-expenses"),
  ("purchase-orders", "Purchase Orders", "Approval thresholds, default delivery terms.", "/purchases/orders"),
  ("bills", "Bills", "Default payment terms, three-way-match enforcement.", "/purchases/bills"),
  ("recurring-bills", "Recurring Bills", "Auto-stop on N consecutive failures.", "/purchases/recurring-bills"),
  ("payments-made", "Payments Made", "Auto-allocate-oldest-first, default debit account.", "/purchases/payments-made"),
  ("vendor-credits", "Vendor Credits", "Auto-apply to oldest open bill, refund preference.", "/purchases/vendor-credits"),
  ("custom", "Custom Modules", "Define new modules with custom fields and views.", None),
]

PAGE_TEMPLATE = '''import Link from "next/link";
import {{ Card, CardContent, CardHeader, CardTitle }} from "@/components/ui/card";
import {{ Button }} from "@/components/ui/button";
import {{ Alert, AlertDescription }} from "@/components/ui/alert";
import {{ Info }} from "lucide-react";
import {{ SettingsShell }} from "@/components/shared/settings-shell";

export const metadata = {{ title: "Module Settings — {label}" }};

export default function Page() {{
  return (
    <SettingsShell title="Module Settings — {label}" description="{description}">
      <Alert variant="info"><Info className="h-4 w-4" /><AlertDescription>Per-module preferences are saved on the OrganizationPreference row. The defaults below apply to all new {entity_lower} records.</AlertDescription></Alert>
      <Card>
        <CardHeader><CardTitle className="text-base">Defaults for {entity_lower}</CardTitle></CardHeader>
        <CardContent className="space-y-3 text-sm">
          <p className="text-muted-foreground">Granular per-field defaults for this module ship with a future release. Globally applicable settings live on /settings/general and /settings/email-notifications.</p>
          {link_section}
        </CardContent>
      </Card>
    </SettingsShell>
  );
}}
'''

LINK_SECTION_WITH = '''<Button asChild variant="outline" size="sm"><Link href="{href}">Open {label}</Link></Button>'''
LINK_SECTION_NONE = '''<p className="text-xs text-muted-foreground">Custom modules support is queued — schema for `WebForm`, `WorkflowAction`, and `Integration` lays the groundwork.</p>'''

for slug, label, description, href in ENTRIES:
    rel = f"modules/{slug}/page.tsx"
    path = ROOT / rel
    path.parent.mkdir(parents=True, exist_ok=True)
    link_section = LINK_SECTION_WITH.format(href=href, label=label) if href else LINK_SECTION_NONE
    content = PAGE_TEMPLATE.format(
        label=label,
        description=description,
        entity_lower=label.lower().rstrip("s") + "s" if not label.endswith("s") else label.lower(),
        link_section=link_section,
    )
    path.write_text(content, encoding="utf-8")
    print(f"wrote {rel}")

print(f"\nTotal: {len(ENTRIES)} module-settings pages")
