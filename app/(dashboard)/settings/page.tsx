import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Building2, Users, Receipt, Cog, Palette, Workflow, Boxes, CreditCard, Code } from "lucide-react";

type Group = {
  title: string;
  icon: React.ComponentType<{ className?: string }>;
  items: { label: string; href: string }[];
};

const GROUPS: Group[] = [
  {
    title: "Organization", icon: Building2,
    items: [
      { label: "Profile", href: "/settings/profile" },
      { label: "Branding", href: "/settings/branding" },
      { label: "Custom Domain", href: "/settings/custom-domain" },
      { label: "Locations", href: "/settings/locations" },
      { label: "AI Preferences", href: "/settings/ai" },
      { label: "Manage Subscription", href: "/settings/subscription" },
    ],
  },
  {
    title: "Users & Roles", icon: Users,
    items: [
      { label: "Users", href: "/settings/users" },
      { label: "Roles", href: "/settings/roles" },
      { label: "User Preferences", href: "/settings/preferences" },
    ],
  },
  {
    title: "Taxes & Compliance", icon: Receipt,
    items: [
      { label: "Taxes", href: "/settings/taxes" },
      { label: "Direct Taxes", href: "/settings/direct-taxes" },
      { label: "MSME Settings", href: "/settings/msme" },
    ],
  },
  {
    title: "Setup & Configurations", icon: Cog,
    items: [
      { label: "General", href: "/settings/general" },
      { label: "Currencies", href: "/settings/currencies" },
      { label: "Opening Balances", href: "/settings/opening-balances" },
      { label: "Reminders", href: "/settings/reminders" },
      { label: "Customer Portal", href: "/settings/customer-portal" },
      { label: "Vendor Portal", href: "/settings/vendor-portal" },
    ],
  },
  {
    title: "Customization", icon: Palette,
    items: [
      { label: "Transaction Number Series", href: "/settings/number-series" },
      { label: "PDF Templates", href: "/settings/pdf-templates" },
      { label: "Email Notifications", href: "/settings/email-notifications" },
      { label: "SMS Notifications", href: "/settings/sms-notifications" },
      { label: "Reporting Tags", href: "/settings/reporting-tags" },
      { label: "Web Tabs", href: "/settings/web-tabs" },
      { label: "Digital Signature", href: "/settings/digital-signature" },
    ],
  },
  {
    title: "Automation", icon: Workflow,
    items: [
      { label: "Workflow Rules", href: "/settings/workflow-rules" },
      { label: "Workflow Actions", href: "/settings/workflow-actions" },
      { label: "Workflow Logs", href: "/settings/workflow-logs" },
      { label: "Schedules", href: "/settings/schedules" },
    ],
  },
  {
    title: "Module Settings — General", icon: Boxes,
    items: [
      { label: "Customers and Vendors", href: "/settings/modules/contacts" },
      { label: "Items", href: "/settings/preferences/items" },
      { label: "Accountant", href: "/settings/modules/accountant" },
      { label: "Projects", href: "/settings/modules/projects" },
      { label: "Timesheet", href: "/settings/modules/timesheet" },
    ],
  },
  {
    title: "Module Settings — Inventory", icon: Boxes,
    items: [{ label: "Embedded Barcodes", href: "/settings/modules/barcodes" }],
  },
  {
    title: "Module Settings — Online Payments", icon: CreditCard,
    items: [
      { label: "Customer Payments", href: "/settings/online-payments/customer-payments" },
      { label: "Vendor Payments", href: "/settings/modules/vendor-payments" },
    ],
  },
  {
    title: "Module Settings — Sales", icon: Receipt,
    items: [
      { label: "Quotes", href: "/settings/modules/quotes" },
      { label: "Sales Orders", href: "/settings/modules/sales-orders" },
      { label: "Delivery Challans", href: "/settings/modules/delivery-challans" },
      { label: "Invoices", href: "/settings/modules/invoices" },
      { label: "Recurring Invoices", href: "/settings/modules/recurring-invoices" },
      { label: "Payments Received", href: "/settings/modules/payments-received" },
      { label: "Credit Notes", href: "/settings/modules/credit-notes" },
      { label: "Delivery Notes", href: "/settings/modules/delivery-notes" },
    ],
  },
  {
    title: "Module Settings — Purchases", icon: Receipt,
    items: [
      { label: "Expenses", href: "/settings/modules/expenses" },
      { label: "Recurring Expenses", href: "/settings/modules/recurring-expenses" },
      { label: "Purchase Orders", href: "/settings/modules/purchase-orders" },
      { label: "Bills", href: "/settings/modules/bills" },
      { label: "Recurring Bills", href: "/settings/modules/recurring-bills" },
      { label: "Payments Made", href: "/settings/modules/payments-made" },
      { label: "Vendor Credits", href: "/settings/modules/vendor-credits" },
    ],
  },
  {
    title: "Module Settings — Custom Modules", icon: Boxes,
    items: [{ label: "Overview", href: "/settings/modules/custom" }],
  },
  {
    title: "Integrations & Marketplace", icon: Code,
    items: [
      { label: "Quikfinance Apps", href: "/settings/integrations/apps" },
      { label: "WhatsApp", href: "/settings/integrations/whatsapp" },
      { label: "SMS Integrations", href: "/settings/integrations/sms" },
      { label: "Bharat Connect", href: "/settings/integrations/bharat-connect" },
      { label: "Uber for Business", href: "/settings/integrations/uber" },
      { label: "Other Apps", href: "/settings/integrations/other" },
      { label: "Marketplace", href: "/settings/integrations/marketplace" },
    ],
  },
  {
    title: "Developer Data", icon: Code,
    items: [
      { label: "Incoming Webhooks", href: "/settings/developer/webhooks" },
      { label: "Connections", href: "/settings/developer/connections" },
      { label: "API Usage", href: "/settings/developer/api-usage" },
      { label: "Signals", href: "/settings/developer/signals" },
      { label: "Data Management", href: "/settings/developer/data" },
      { label: "Deluge Components Usage", href: "/settings/developer/deluge" },
      { label: "Web Forms", href: "/settings/developer/web-forms" },
    ],
  },
];

export const metadata = { title: "Settings" };

export default function SettingsPage() {
  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Settings</h1>
        <p className="text-sm text-muted-foreground">Configure your organization, users, taxes, and integrations.</p>
      </div>
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {GROUPS.map((g) => {
          const Icon = g.icon;
          return (
            <Card key={g.title}>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Icon className="h-4 w-4 text-muted-foreground" /> {g.title}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="space-y-1 text-sm">
                  {g.items.map((it) => (
                    <li key={it.href}>
                      <Link href={it.href} className="text-muted-foreground hover:text-primary">{it.label}</Link>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
