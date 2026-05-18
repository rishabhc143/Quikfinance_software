import * as React from "react";
import Link from "next/link";

/**
 * Quikfinance Help — frequently-asked-questions data.
 *
 * Categorised + anchored. Each FAQ has a stable `id` so other
 * surfaces (FYE page, invoice form, etc.) can deep-link to the
 * answer via `/help/{category}#${id}`.
 *
 * Answers are React nodes so they can embed inline `<Link>`s to
 * the actual feature routes — the most useful kind of help is a
 * one-click jump to the screen the user needs.
 */

export type Faq = {
  id: string;
  q: string;
  a: React.ReactNode;
};

export type FaqCategory = {
  slug: string;
  title: string;
  description: string;
  faqs: Faq[];
};

function P({ children }: { children: React.ReactNode }) {
  return <p className="text-sm leading-relaxed">{children}</p>;
}

function Step({ children }: { children: React.ReactNode }) {
  return <li className="text-sm leading-relaxed">{children}</li>;
}

function Hint({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-xs text-muted-foreground mt-2 italic">{children}</p>
  );
}

function L({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link href={href} className="text-primary hover:underline">
      {children}
    </Link>
  );
}

// ─── Categories ─────────────────────────────────────────────────

export const HELP_CATEGORIES: FaqCategory[] = [
  {
    slug: "account-and-settings",
    title: "Account & Settings",
    description: "Login, password, organisations, data import/export.",
    faqs: [
      {
        id: "reset-password",
        q: "How do I reset my password?",
        a: (
          <P>
            On the login page click &ldquo;Forgot password?&rdquo;
            and enter your email — we&apos;ll send a one-time reset
            link. The link expires after 1 hour for security.
          </P>
        ),
      },
      {
        id: "change-email",
        q: "How do I change my email address?",
        a: (
          <P>
            Open <L href="/settings/profile">Settings → Profile</L>{" "}
            and edit the email field. You&apos;ll get a verification
            email at the new address; click the link to confirm.
            Until you confirm, your old email continues to receive
            notifications.
          </P>
        ),
      },
      {
        id: "enable-2fa",
        q: "How do I enable two-factor authentication?",
        a: (
          <P>
            Two-factor authentication is on the roadmap for Q2.
            Until then, please use a strong unique password and
            enable browser autofill from a password manager.
          </P>
        ),
      },
      {
        id: "switch-organizations",
        q: "How do I switch between organisations?",
        a: (
          <P>
            Click your organisation name in the top-left of the
            sidebar — a dropdown lists every organisation you&apos;re
            a member of. Pick one to switch. Each org has its own
            books, users, and settings.
          </P>
        ),
      },
      {
        id: "import-from-tally",
        q: "How do I import data from Tally or another accounting tool?",
        a: (
          <>
            <P>
              Quikfinance accepts CSV uploads on every list page.
              For a full migration:
            </P>
            <ol className="list-decimal ml-5 space-y-1.5 mt-2">
              <Step>
                Export Chart of Accounts from your old tool, then{" "}
                <L href="/accountant/chart-of-accounts">
                  import into Quikfinance
                </L>
              </Step>
              <Step>
                Capture opening balances via{" "}
                <L href="/settings/opening-balances">
                  Settings → Opening Balances
                </L>
              </Step>
              <Step>
                Import Customers, Vendors, Items as CSVs from each
                list page
              </Step>
              <Step>
                Import open Invoices and Bills (or recreate just
                the open ones — historical can stay in the old
                system as reference)
              </Step>
            </ol>
            <Hint>
              Email{" "}
              <a
                href="mailto:support@quikfinance.in"
                className="text-primary hover:underline"
              >
                support@quikfinance.in
              </a>{" "}
              if you want a guided migration — we offer a free
              30-minute session for new customers.
            </Hint>
          </>
        ),
      },
      {
        id: "export-backup",
        q: "How do I export a full backup of my Quikfinance data?",
        a: (
          <P>
            Every list page has an Export button (Customers,
            Vendors, Items, Invoices, Bills, etc.) that gives a
            CSV/XLSX. For an accounting-grade export, use{" "}
            <L href="/reports/trial-balance">Trial Balance</L>{" "}
            plus the underlying transaction reports. A full
            one-click backup ZIP is on the roadmap.
          </P>
        ),
      },
    ],
  },

  {
    slug: "getting-started",
    title: "Getting Started",
    description: "Setting up your organisation and your first transactions.",
    faqs: [
      {
        id: "add-organisation-details",
        q: "How do I add my organisation's address and tax details?",
        a: (
          <P>
            Go to{" "}
            <L href="/settings/profile">
              Settings → Organisation Profile
            </L>{" "}
            and fill in address, GSTIN, PAN, and contact info. These
            details auto-populate every invoice, bill, and report
            you generate.
          </P>
        ),
      },
      {
        id: "invite-accountant",
        q: "How do I invite my accountant or team?",
        a: (
          <P>
            Open <L href="/settings/users">Settings → Users</L> and
            click &ldquo;Invite User&rdquo;. Pick a role
            (Accountant, Staff, Read-only, etc.) and enter their
            email — they&apos;ll get an invite link.
          </P>
        ),
      },
      {
        id: "first-invoice",
        q: "How do I create my first invoice?",
        a: (
          <>
            <ol className="list-decimal ml-5 space-y-1.5">
              <Step>
                Add at least one Customer at{" "}
                <L href="/sales/customers/new">
                  Sales → Customers → New
                </L>
              </Step>
              <Step>
                Open{" "}
                <L href="/sales/invoices/new">Sales → Invoices → New</L>
              </Step>
              <Step>
                Pick the customer, add line items, set GST, click
                &ldquo;Save as Open&rdquo;
              </Step>
            </ol>
            <Hint>
              The invoice immediately appears in your AR Aging
              and Profit &amp; Loss reports.
            </Hint>
          </>
        ),
      },
      {
        id: "first-bill",
        q: "How do I create my first vendor bill?",
        a: (
          <>
            <ol className="list-decimal ml-5 space-y-1.5">
              <Step>
                Add a Vendor at{" "}
                <L href="/purchases/vendors/new">
                  Purchases → Vendors → New
                </L>
              </Step>
              <Step>
                Open{" "}
                <L href="/purchases/bills/new">
                  Purchases → Bills → New
                </L>
              </Step>
              <Step>
                Enter the vendor invoice number, due date, line
                items, and save as Open
              </Step>
            </ol>
          </>
        ),
      },
      {
        id: "configure-coa",
        q: "How do I configure my Chart of Accounts?",
        a: (
          <P>
            Quikfinance ships with a starter Chart of Accounts. To
            customise it open{" "}
            <L href="/accountant/chart-of-accounts">
              Accountant → Chart of Accounts
            </L>
            . You can add new accounts, edit existing ones, or
            import a CSV from another tool.
          </P>
        ),
      },
    ],
  },

  {
    slug: "sales-and-invoicing",
    title: "Sales & Invoicing",
    description:
      "Invoices, customising PDFs, sending, recurring, credit notes, payments, reminders.",
    faqs: [
      {
        id: "create-invoice",
        q: "How do I create an invoice?",
        a: (
          <P>
            Open{" "}
            <L href="/sales/invoices/new">Sales → Invoices → New</L>,
            pick the customer, add line items (item, qty, rate, GST),
            and click &ldquo;Save as Open&rdquo;. The invoice
            immediately flows into AR and P&amp;L.
          </P>
        ),
      },
      {
        id: "customize-invoice-pdf",
        q: "How do I customise the invoice PDF template?",
        a: (
          <P>
            Open <L href="/settings/pdf-templates">Settings → PDF
            Templates</L>. You can change the header colour, logo,
            footer text, and which columns appear. Multiple
            templates can be saved and applied per invoice type.
          </P>
        ),
      },
      {
        id: "email-invoice",
        q: "How do I email an invoice to a customer?",
        a: (
          <P>
            On any open invoice, click &ldquo;Send&rdquo; in the top-
            right. The dialog pre-fills the customer&apos;s email
            with a default subject + body — both editable. The PDF
            is attached automatically. Configure the default
            template at <L href="/settings/email-templates">
              Settings → Email Templates
            </L>
            .
          </P>
        ),
      },
      {
        id: "recurring-invoice",
        q: "How do I create a recurring invoice?",
        a: (
          <P>
            Open{" "}
            <L href="/sales/recurring-invoices/new">
              Sales → Recurring Invoices → New
            </L>
            . Set the start date, frequency (weekly / monthly /
            quarterly / yearly), and end condition. Quikfinance
            creates the child invoices automatically on schedule.
          </P>
        ),
      },
      {
        id: "record-customer-payment",
        q: "How do I record a payment received from a customer?",
        a: (
          <P>
            Open the invoice and click &ldquo;Record Payment&rdquo;,
            or go to{" "}
            <L href="/sales/customer-payments/new">
              Sales → Payments Received → New
            </L>{" "}
            and allocate the payment across one or more open
            invoices for that customer.
          </P>
        ),
      },
      {
        id: "issue-credit-note",
        q: "How do I issue a credit note?",
        a: (
          <P>
            From the invoice detail page, click More →{" "}
            <em>Create Credit Note</em>. Or open{" "}
            <L href="/sales/credit-notes/new">
              Sales → Credit Notes → New
            </L>{" "}
            and pick the customer + lines you&apos;re crediting.
          </P>
        ),
      },
      {
        id: "customer-statement",
        q: "How do I send a customer their statement?",
        a: (
          <P>
            Open <L href="/sales/customers">Sales → Customers</L>,
            click on the customer, then the
            &ldquo;Statement&rdquo; tab. You can export to PDF or
            email it directly.
          </P>
        ),
      },
      {
        id: "payment-reminders",
        q: "How do I set up payment reminders for overdue invoices?",
        a: (
          <P>
            Open <L href="/settings/reminders">Settings →
            Reminders</L>. Configure when reminders fire (e.g.
            7 days before due, 3 days after due, 14 days after due)
            and what email template each uses. Reminders send
            automatically to customers with overdue invoices.
          </P>
        ),
      },
      {
        id: "discount-or-late-fee",
        q: "How do I add a discount or late fee to an invoice?",
        a: (
          <P>
            On the invoice form, click &ldquo;Add Discount&rdquo;
            under the totals row — enter a flat amount or a
            percentage. For late fees, edit the invoice after the
            due date and add a new line item labelled &ldquo;Late
            Fee&rdquo; against an Income account.
          </P>
        ),
      },
      {
        id: "void-or-delete-invoice",
        q: "How do I void or delete an invoice?",
        a: (
          <P>
            From the invoice detail page, click More → Void (for an
            issued invoice you want to keep in audit history) or
            Delete (only available before any payment was applied).
            Voiding preserves the number for compliance; deleting
            removes it entirely.
          </P>
        ),
      },
    ],
  },

  {
    slug: "quotes-sales-orders-and-delivery",
    title: "Quotes, Sales Orders & Delivery",
    description:
      "Quotes (estimates), sales orders, delivery notes, and the conversion flow.",
    faqs: [
      {
        id: "create-quote",
        q: "How do I create a quote (estimate)?",
        a: (
          <P>
            Open <L href="/sales/quotes/new">Sales → Quotes → New</L>,
            pick the customer, add proposed line items, and click
            &ldquo;Save as Draft&rdquo; or &ldquo;Send&rdquo;. The
            quote has zero accounting impact until converted.
          </P>
        ),
      },
      {
        id: "convert-quote-to-invoice",
        q: "How do I convert a quote to an invoice?",
        a: (
          <P>
            Open the accepted quote, click More → Convert to Invoice.
            Quikfinance creates an invoice pre-filled with the
            quote&apos;s line items — you can edit before saving.
            The quote stays linked to the invoice for audit.
          </P>
        ),
      },
      {
        id: "create-sales-order",
        q: "How do I create a sales order?",
        a: (
          <P>
            Open{" "}
            <L href="/sales/sales-orders/new">
              Sales → Sales Orders → New
            </L>
            . Sales Orders sit between Quote and Invoice — useful
            when goods are dispatched in stages before billing. You
            can convert a Sales Order to Delivery Notes and/or
            Invoices.
          </P>
        ),
      },
      {
        id: "create-delivery-note",
        q: "How do I issue a delivery note (challan)?",
        a: (
          <P>
            Open{" "}
            <L href="/sales/delivery-challans/new">
              Sales → Delivery Challans → New
            </L>
            . A delivery note tracks dispatch of goods without an
            accounting entry. Convert to an invoice later when
            you&apos;re ready to bill.
          </P>
        ),
      },
      {
        id: "sales-document-flow",
        q: "What's the difference between Quote, Sales Order, Delivery Note, and Invoice?",
        a: (
          <>
            <ul className="list-disc ml-5 space-y-1.5">
              <Step>
                <strong>Quote (Estimate)</strong> — a proposed
                price. No accounting impact.
              </Step>
              <Step>
                <strong>Sales Order</strong> — customer has
                committed to buy. No accounting impact yet, but
                reserves stock.
              </Step>
              <Step>
                <strong>Delivery Note (Challan)</strong> — goods
                physically dispatched. Inventory reduces; no GST
                or invoice yet.
              </Step>
              <Step>
                <strong>Invoice</strong> — billable. GST is
                applied, AR is created, P&amp;L is impacted.
              </Step>
            </ul>
            <Hint>
              You don&apos;t have to use them all — many businesses
              go straight from no-document to Invoice.
            </Hint>
          </>
        ),
      },
    ],
  },

  {
    slug: "purchases-and-bills",
    title: "Purchases & Bills",
    description:
      "Bills, expenses, recurring bills, purchase orders, vendor credits, payments.",
    faqs: [
      {
        id: "create-bill",
        q: "How do I record a vendor bill?",
        a: (
          <P>
            Open{" "}
            <L href="/purchases/bills/new">
              Purchases → Bills → New
            </L>
            , pick the vendor, enter the vendor&apos;s invoice
            number + due date, add line items, and click &ldquo;Save
            as Open&rdquo;. The bill becomes a liability on your
            Balance Sheet.
          </P>
        ),
      },
      {
        id: "categorise-expense",
        q: "How do I categorise an expense?",
        a: (
          <P>
            When creating an expense at{" "}
            <L href="/purchases/expenses/new">
              Purchases → Expenses → New
            </L>
            , pick the expense Category from the dropdown — this
            maps to your Chart of Accounts and determines which
            P&amp;L line it hits.
          </P>
        ),
      },
      {
        id: "recurring-bill",
        q: "How do I set up a recurring vendor bill?",
        a: (
          <P>
            Use{" "}
            <L href="/purchases/recurring-bills/new">
              Purchases → Recurring Bills → New
            </L>
            . Set the cadence — Quikfinance creates child bills as
            drafts on each due date so you can review before
            posting.
          </P>
        ),
      },
      {
        id: "purchase-order",
        q: "How do I create a purchase order?",
        a: (
          <P>
            Open{" "}
            <L href="/purchases/orders/new">
              Purchases → Purchase Orders → New
            </L>
            . Once goods are received you can convert the PO to a
            Bill (carries forward line items + GST). POs have no
            accounting impact until billed.
          </P>
        ),
      },
      {
        id: "vendor-credit",
        q: "How do I issue or apply a vendor credit?",
        a: (
          <P>
            When a vendor refunds you (e.g. faulty goods returned),
            open{" "}
            <L href="/purchases/vendor-credits/new">
              Purchases → Vendor Credits → New
            </L>
            . You can apply the credit to an open bill from the
            credit&apos;s detail page.
          </P>
        ),
      },
      {
        id: "vendor-payment",
        q: "How do I record a payment to a vendor?",
        a: (
          <P>
            Open the bill and click &ldquo;Record Payment&rdquo;, or
            use{" "}
            <L href="/purchases/payments-made/new">
              Purchases → Payments Made → New
            </L>
            . Pick which bill(s) the payment applies to.
          </P>
        ),
      },
      {
        id: "vendor-advance",
        q: "How do I record an advance payment to a vendor?",
        a: (
          <P>
            On the Payment Made form, select payment type
            &ldquo;Vendor Advance&rdquo; instead of allocating to
            specific bills. The advance shows up on the vendor&apos;s
            ledger and can be applied to a future bill from that
            bill&apos;s detail page.
          </P>
        ),
      },
    ],
  },

  {
    slug: "items-and-inventory",
    title: "Items & Inventory",
    description: "Items, stock tracking, adjustments, HSN codes, low-stock alerts.",
    faqs: [
      {
        id: "create-item",
        q: "How do I create an item (product or service)?",
        a: (
          <P>
            Open <L href="/items/new">Items → New</L>. Set name,
            type (Goods or Services), sales rate, purchase rate,
            and tax. For inventory-tracked items also set opening
            stock and the inventory account.
          </P>
        ),
      },
      {
        id: "track-stock",
        q: "How do I track stock for an item?",
        a: (
          <P>
            On the item form check &ldquo;Track inventory for this
            item&rdquo;. Quikfinance will then reduce stock when you
            invoice a customer and increase stock when you record a
            bill. View current stock at{" "}
            <L href="/reports/stock-valuation">
              Reports → Stock Valuation
            </L>
            .
          </P>
        ),
      },
      {
        id: "stock-adjustment",
        q: "How do I do a stock adjustment?",
        a: (
          <P>
            Use{" "}
            <L href="/items/stock-adjustments/new">
              Items → Inventory Adjustments → New
            </L>{" "}
            to record damage, theft, recount differences, or
            opening-balance corrections. Pick the reason — it
            posts the offsetting journal entry to the right
            account automatically.
          </P>
        ),
      },
      {
        id: "low-stock-alert",
        q: "How do I see items running low on stock?",
        a: (
          <P>
            On the item form, set a &ldquo;Reorder level&rdquo;.
            Items below their reorder level appear in{" "}
            <L href="/items?lowStock=1">Items</L> with a red
            indicator and in the Inventory Summary report.
          </P>
        ),
      },
      {
        id: "hsn-sac-codes",
        q: "How do I set HSN/SAC codes on items?",
        a: (
          <P>
            On the item form, enter the HSN code (for Goods) or
            SAC code (for Services) in the GST section. These
            codes flow into invoice line items and the GSTR-1
            export. You can bulk-update via CSV import on{" "}
            <L href="/items">Items list</L>.
          </P>
        ),
      },
    ],
  },

  {
    slug: "banking",
    title: "Banking",
    description: "Bank accounts, statement imports, rules, reconciliation.",
    faqs: [
      {
        id: "add-bank-account",
        q: "How do I add a bank account?",
        a: (
          <P>
            Open <L href="/banking/accounts">Banking → Accounts</L>{" "}
            and click &ldquo;Add Account&rdquo;. Pick the type
            (Bank / Credit Card / Cash), set the opening balance,
            and save.
          </P>
        ),
      },
      {
        id: "import-bank-csv",
        q: "How do I import a bank statement?",
        a: (
          <P>
            Open the bank account and click &ldquo;Import
            Statement&rdquo;. Drop a CSV exported from your bank.
            Quikfinance maps the columns and stages each transaction
            for review.
          </P>
        ),
      },
      {
        id: "reconcile",
        q: "How do I reconcile my bank account?",
        a: (
          <P>
            On the bank account page, click &ldquo;Reconcile&rdquo;,
            enter the statement balance + date, and tick off
            transactions that match your statement. Difference
            should reach zero before you save.
          </P>
        ),
      },
      {
        id: "bank-rule",
        q: "How do I set up a bank rule for auto-categorisation?",
        a: (
          <P>
            From the bank account page, click &ldquo;Manage
            Rules&rdquo;. Add conditions (e.g. description contains
            &ldquo;Uber&rdquo;) and the action (categorise to
            Travel Expense). New imports matching the rule auto-
            categorise — you just confirm.
          </P>
        ),
      },
      {
        id: "undo-reconciliation",
        q: "How do I undo a reconciliation?",
        a: (
          <P>
            On the bank account page, go to the &ldquo;Reconcile
            Now&rdquo; section, find the completed reconciliation
            in history, and click &ldquo;Undo&rdquo;. All
            transactions in that batch return to the unreconciled
            state.
          </P>
        ),
      },
      {
        id: "match-transaction",
        q: "How do I match an unmatched bank transaction?",
        a: (
          <P>
            On the bank account&apos;s Categorise tab, find the
            transaction. Quikfinance suggests likely matches
            (open invoices / bills with similar amounts). Click
            &ldquo;Match&rdquo; on the right one — the transaction
            is linked and reconciled in one step.
          </P>
        ),
      },
    ],
  },

  {
    slug: "manual-journals-and-coa",
    title: "Manual Journals & Chart of Accounts",
    description:
      "When to use a journal entry, the Chart of Accounts, account types.",
    faqs: [
      {
        id: "when-to-use-journal",
        q: "When should I use a manual journal entry?",
        a: (
          <>
            <P>
              Manual journals are for entries that don&apos;t fit
              the standard transaction types:
            </P>
            <ul className="list-disc ml-5 space-y-1.5 mt-2">
              <Step>Depreciation</Step>
              <Step>Amortisation of prepaid expenses</Step>
              <Step>Year-end accruals</Step>
              <Step>Corrections / reclassifications</Step>
              <Step>Owner&apos;s draw / capital contribution</Step>
            </ul>
            <P>
              Open{" "}
              <L href="/accountant/manual-journals/new">
                Accountant → Manual Journals → New
              </L>
              .
            </P>
          </>
        ),
      },
      {
        id: "depreciation-entry",
        q: "How do I post a depreciation entry?",
        a: (
          <P>
            At year-end (or each month), create a manual journal
            at{" "}
            <L href="/accountant/manual-journals/new">
              Accountant → Manual Journals → New
            </L>
            : Debit &ldquo;Depreciation Expense&rdquo;, Credit
            &ldquo;Accumulated Depreciation&rdquo; for the period
            amount.
          </P>
        ),
      },
      {
        id: "add-coa-account",
        q: "How do I add a new account to my Chart of Accounts?",
        a: (
          <P>
            Open{" "}
            <L href="/accountant/chart-of-accounts">
              Accountant → Chart of Accounts
            </L>{" "}
            and click &ldquo;+ New&rdquo;. Pick the account type
            (Asset / Liability / Equity / Income / Expense) and
            sub-type. Quikfinance ships with sensible defaults so
            you usually only need to add specialty accounts.
          </P>
        ),
      },
      {
        id: "account-types",
        q: "What do the account types (Asset/Liability/Equity/Income/Expense) mean?",
        a: (
          <>
            <ul className="list-disc ml-5 space-y-1.5">
              <Step>
                <strong>Asset</strong> — things you own (cash,
                receivables, inventory, equipment)
              </Step>
              <Step>
                <strong>Liability</strong> — things you owe (bills,
                loans, GST payable)
              </Step>
              <Step>
                <strong>Equity</strong> — owner&apos;s investment +
                retained earnings
              </Step>
              <Step>
                <strong>Income</strong> — revenue + other earnings
              </Step>
              <Step>
                <strong>Expense</strong> — costs incurred to run
                the business
              </Step>
            </ul>
            <Hint>
              The accounting equation: Assets = Liabilities +
              Equity. Income and Expense roll into Equity at
              year-end via Retained Earnings.
            </Hint>
          </>
        ),
      },
      {
        id: "opening-balances",
        q: "How do I enter opening balances when migrating from another tool?",
        a: (
          <P>
            Open{" "}
            <L href="/settings/opening-balances">
              Settings → Opening Balances
            </L>
            . Enter the closing balance of each ledger account from
            your old tool as of your migration date. The opposite
            entry posts to &ldquo;Opening Balance Equity&rdquo;
            which your accountant will clear at year-end.
          </P>
        ),
      },
    ],
  },

  {
    slug: "taxes-gst-and-tds",
    title: "Taxes, GST & TDS",
    description:
      "GSTIN, GSTR-1, GSTR-3B, composition, IGST vs CGST/SGST, TDS, HSN.",
    faqs: [
      {
        id: "configure-gstin",
        q: "How do I configure my GSTIN?",
        a: (
          <P>
            Go to <L href="/settings/profile">Settings → Profile</L>
            , enter your GSTIN, and choose composition vs regular.
            Quikfinance applies the right GST split (CGST+SGST vs
            IGST) based on the customer&apos;s state.
          </P>
        ),
      },
      {
        id: "gstr1-export",
        q: "How do I export GSTR-1?",
        a: (
          <P>
            Open <L href="/reports/gstr1">Reports → GSTR-1</L>. Pick
            the month, click Export → JSON (for GST portal upload)
            or XLSX (for accountant review).
          </P>
        ),
      },
      {
        id: "gstr3b-filing",
        q: "How do I file GSTR-3B?",
        a: (
          <P>
            Open <L href="/reports/gstr-3b">Reports → GSTR-3B</L>{" "}
            (currently rolling out). The report shows outward
            supplies, inward supplies, eligible ITC, and tax
            payable per the GSTR-3B return format. Export to the
            JSON format for GST portal upload.
          </P>
        ),
      },
      {
        id: "igst-vs-cgst-sgst",
        q: "How does Quikfinance calculate CGST+SGST vs IGST?",
        a: (
          <P>
            Quikfinance compares your organisation&apos;s state
            (from{" "}
            <L href="/settings/profile">Settings → Profile</L>) with
            the customer&apos;s billing state. Same state →
            CGST+SGST split (e.g. 9%+9% for 18%). Different state →
            IGST single line (18%). You can override per invoice if
            needed.
          </P>
        ),
      },
      {
        id: "composition-vs-regular",
        q: "What's the difference between Composition and Regular GST registration?",
        a: (
          <>
            <P>
              <strong>Regular</strong>: charge GST on every sale,
              claim ITC on purchases, file GSTR-1 + GSTR-3B monthly.
              <br />
              <strong>Composition</strong>: pay flat rate (1-6%
              based on business type), can&apos;t charge GST or
              claim ITC, file CMP-08 quarterly.
            </P>
            <P>
              Switch the toggle on{" "}
              <L href="/settings/profile">Settings → Profile</L> →
              GST section. Composition mode hides ITC fields and
              applies the right return format.
            </P>
          </>
        ),
      },
      {
        id: "tax-rates",
        q: "How do I add a new tax rate?",
        a: (
          <P>
            Open <L href="/settings/taxes">Settings → Taxes</L> and
            click &ldquo;Add Tax&rdquo;. Choose the rate (e.g. 18%),
            tax type (GST / IGST), and save. New tax rates appear
            in the dropdown on every transaction line item.
          </P>
        ),
      },
      {
        id: "tds-on-customer-payment",
        q: "How do I record TDS deduction on customer payments?",
        a: (
          <P>
            On the Payment Received form, click &ldquo;Add TDS&rdquo;
            under the amount. Pick the section (194C, 194J, 194Q,
            etc.) — Quikfinance applies the right rate and posts
            the TDS Receivable journal entry.
          </P>
        ),
      },
      {
        id: "tds-on-vendor-payment",
        q: "How do I record TDS deduction on vendor payments?",
        a: (
          <P>
            On the Payment Made form, expand &ldquo;TDS
            Deduction&rdquo;, pick the section, and enter the rate.
            Quikfinance withholds the TDS amount, posts to TDS
            Payable, and shows it on your TDS report at quarter-end.
          </P>
        ),
      },
      {
        id: "hsn-on-returns",
        q: "How do HSN/SAC codes flow into GST returns?",
        a: (
          <P>
            Quikfinance picks up the HSN/SAC code set on each item
            and groups invoice line items by HSN in the GSTR-1
            export. Items without an HSN show as blank — set them
            on the item form or via bulk CSV update.
          </P>
        ),
      },
    ],
  },

  {
    slug: "multi-currency",
    title: "Multi-currency",
    description:
      "Enabling multi-currency, exchange rates, foreign-currency transactions.",
    faqs: [
      {
        id: "enable-multi-currency",
        q: "How do I enable multi-currency?",
        a: (
          <P>
            Open{" "}
            <L href="/settings/currencies">
              Settings → Currencies
            </L>{" "}
            and click &ldquo;Enable Multi-currency&rdquo;. Pick a
            base currency (defaults to INR) and add the foreign
            currencies you transact in (USD, EUR, etc.).
          </P>
        ),
      },
      {
        id: "exchange-rate",
        q: "How do I update an exchange rate?",
        a: (
          <P>
            Open{" "}
            <L href="/settings/currencies">
              Settings → Currencies
            </L>{" "}
            and click on the currency. Add a new exchange rate with
            an effective date — Quikfinance uses the latest rate at
            or before each transaction date.
          </P>
        ),
      },
      {
        id: "foreign-currency-transaction",
        q: "How do I record a transaction in a foreign currency?",
        a: (
          <P>
            On any transaction form (Invoice, Bill, etc.), pick the
            customer/vendor whose currency is non-base. The form
            switches to that currency, shows the exchange rate, and
            posts both the foreign-currency amount and the base-
            currency equivalent. Use{" "}
            <L href="/accountant/currency-adjustments">
              Accountant → Currency Adjustments
            </L>{" "}
            at period-end to revalue open balances.
          </P>
        ),
      },
    ],
  },

  {
    slug: "reports",
    title: "Reports",
    description:
      "P&L, Balance Sheet, Cash Flow, compare periods, scheduling, Schedule III.",
    faqs: [
      {
        id: "compare-periods",
        q: "How do I compare two periods on a report?",
        a: (
          <P>
            Open any of P&amp;L / Balance Sheet / Cash Flow, click
            &ldquo;Customize&rdquo;, set &ldquo;Compare With&rdquo;
            to <em>Previous Period</em> or <em>Previous Year</em>,
            and Run Report. The page renders a 4-column layout
            (label / current / previous / % change).
          </P>
        ),
      },
      {
        id: "schedule-report-email",
        q: "How do I schedule a report by email?",
        a: (
          <P>
            On P&amp;L / Balance Sheet / Cash Flow, click the
            Schedule icon in the toolbar. Set the cadence (daily /
            weekly / monthly), format (PDF / XLSX / CSV), and
            recipient emails. Quikfinance sends the report
            automatically on the chosen schedule.
          </P>
        ),
      },
      {
        id: "report-basis",
        q: "What's the difference between Accrual and Cash basis?",
        a: (
          <P>
            <strong>Accrual</strong> recognises revenue when
            invoiced and expenses when billed (standard for
            Companies Act).{" "}
            <strong>Cash</strong> recognises them only when money
            actually moves. Toggle the basis from the &ldquo;Report
            Basis&rdquo; pill on any of the 3 statements.
          </P>
        ),
      },
      {
        id: "customize-columns",
        q: "How do I show or hide columns on a report?",
        a: (
          <P>
            Click &ldquo;Customize&rdquo; in the report toolbar, go
            to the &ldquo;Show / Hide Columns&rdquo; tab, tick the
            columns you want, and Run Report. Custom column
            preferences are remembered per user per report.
          </P>
        ),
      },
      {
        id: "save-custom-report",
        q: "Can I save a customised report layout?",
        a: (
          <P>
            Saving custom reports under your own name is on the
            roadmap. Today the Customize panel applies for the
            current session via URL parameters — you can bookmark
            the resulting URL to recall the same view.
          </P>
        ),
      },
      {
        id: "schedule-iii",
        q: "How do I generate Schedule III (Companies Act) statements?",
        a: (
          <>
            <P>Two reports follow the Schedule III format:</P>
            <ul className="list-disc ml-5 space-y-1.5 mt-2">
              <Step>
                <L href="/reports/profit-loss-schedule-iii">
                  Profit &amp; Loss (Schedule III)
                </L>{" "}
                — 15-section roman-numeralled layout
              </Step>
              <Step>
                <L href="/reports/balance-sheet-schedule-iii">
                  Balance Sheet (Schedule III)
                </L>{" "}
                — two-pane Equity &amp; Liabilities / Assets
              </Step>
            </ul>
          </>
        ),
      },
    ],
  },

  {
    slug: "budgets-and-reporting-tags",
    title: "Budgets & Reporting Tags",
    description:
      "Setting budgets, tracking actuals, cost centres / reporting tags.",
    faqs: [
      {
        id: "create-budget",
        q: "How do I create a budget?",
        a: (
          <P>
            Open{" "}
            <L href="/accountant/budgets/new">
              Accountant → Budgets → New
            </L>
            . Pick the fiscal year, budget period (Monthly /
            Quarterly / Yearly), and the accounts you want to
            budget for. After saving, you&apos;ll land on a grid
            editor to enter amounts per period.
          </P>
        ),
      },
      {
        id: "budget-vs-actuals",
        q: "How do I compare budgeted vs actual amounts?",
        a: (
          <P>
            On the budget detail page, scroll below the editable
            grid to see the &ldquo;Budget vs Actuals&rdquo;
            comparison — actuals pull from journal entries posted
            during the FY, variance is calculated automatically.
          </P>
        ),
      },
      {
        id: "reporting-tags",
        q: "How do I set up reporting tags (cost centres)?",
        a: (
          <P>
            Open{" "}
            <L href="/settings/reporting-tags">
              Settings → Reporting Tags
            </L>{" "}
            and define tag categories (e.g. &ldquo;Department&rdquo;,
            &ldquo;Project&rdquo;) with their possible values. On
            any transaction line item, pick the relevant tag values
            — reports can then group/filter by these tags.
          </P>
        ),
      },
    ],
  },

  {
    slug: "fiscal-year-end-tasks",
    title: "Fiscal Year-End Tasks",
    description:
      "Closing your books, preparing statements, exporting for tax filing.",
    faqs: [
      {
        id: "modify-invoice-number",
        q: "How do I modify the auto-generated invoice number for the new financial year?",
        a: (
          <>
            <P>
              Quikfinance auto-generates invoice numbers using the
              prefix configured in your number series. To roll over
              for a new fiscal year:
            </P>
            <ol className="list-decimal ml-5 space-y-1.5 mt-2">
              <Step>
                Open{" "}
                <L href="/settings/number-series">
                  Settings → Number Series
                </L>
              </Step>
              <Step>
                Find the <strong>Invoice</strong> row and click{" "}
                <em>Edit</em>
              </Step>
              <Step>
                Update the prefix (e.g. <code>INV-26-</code> for
                FY 2026-27) and the next-number sequence
              </Step>
              <Step>Save</Step>
            </ol>
            <Hint>
              The same flow applies to Bills, Credit Notes, Vendor
              Credits, Payments, and Manual Journals — each has its
              own series.
            </Hint>
          </>
        ),
      },
      {
        id: "outstanding-customer-amounts",
        q: "How do I find the outstanding amount that customers owe me?",
        a: (
          <>
            <P>Two reports show open receivables:</P>
            <ul className="list-disc ml-5 space-y-1.5 mt-2">
              <Step>
                <L href="/reports/ar-aging">AR Aging Summary</L> —
                buckets (0-30 / 31-60 / 61-90 / 90+ days) per
                customer
              </Step>
              <Step>
                <L href="/sales/customers">Customer Statement</L> —
                pick a customer, see their open balance + ledger
              </Step>
            </ul>
            <Hint>
              Both reports export to CSV/XLSX. For year-end, set
              the &ldquo;As of&rdquo; date to your fiscal-year-end
              (Mar 31 in India).
            </Hint>
          </>
        ),
      },
      {
        id: "inventory-valuation",
        q: "How do I get the exact value of the goods in my inventory?",
        a: (
          <>
            <P>
              Run the{" "}
              <L href="/reports/stock-valuation">Stock Valuation</L>{" "}
              report. It shows each tracked item&apos;s
              quantity-on-hand multiplied by its current cost — a
              total inventory value at the bottom.
            </P>
            <P>
              For your statutory year-end snapshot, set the
              &ldquo;As of&rdquo; date to Mar 31. The page
              recomputes against historical movements.
            </P>
          </>
        ),
      },
      {
        id: "documents-for-tax-filing",
        q: "What are the documents that I should send to my accountant to file my taxes?",
        a: (
          <>
            <P>
              Your accountant typically needs every line below for
              an Indian FY close:
            </P>
            <ul className="list-disc ml-5 space-y-1.5 mt-2">
              <Step>
                <L href="/reports/trial-balance">Trial Balance</L>{" "}
                (as of FY end)
              </Step>
              <Step>
                <L href="/reports/profit-loss">Profit &amp; Loss</L>{" "}
                (full FY)
              </Step>
              <Step>
                <L href="/reports/balance-sheet">Balance Sheet</L>{" "}
                (as of FY end)
              </Step>
              <Step>
                <L href="/reports/cash-flow">Cash Flow Statement</L>{" "}
                (full FY)
              </Step>
              <Step>
                <L href="/reports/profit-loss-schedule-iii">
                  P&amp;L (Schedule III)
                </L>{" "}
                — Companies Act format
              </Step>
              <Step>
                <L href="/reports/balance-sheet-schedule-iii">
                  Balance Sheet (Schedule III)
                </L>
              </Step>
              <Step>
                <L href="/reports/gstr1">GSTR-1 Export</L> — per
                month
              </Step>
              <Step>
                <L href="/reports/sales-summary">Sales Summary</L>{" "}
                (full FY)
              </Step>
              <Step>
                Bank statements — download from{" "}
                <L href="/banking">Banking</L> per account
              </Step>
              <Step>
                Any TDS certificates, tax challans, supporting
                receipts
              </Step>
            </ul>
            <Hint>
              Pro tip: use{" "}
              <L href="/reports">Reports Center</L>&apos;s
              Schedule feature to have these emailed
              automatically each month.
            </Hint>
          </>
        ),
      },
      {
        id: "close-books-for-year",
        q: "How do I close my books for the year?",
        a: (
          <>
            <P>
              Quikfinance doesn&apos;t require a hard
              &ldquo;close&rdquo; action. The recommended year-end
              workflow:
            </P>
            <ol className="list-decimal ml-5 space-y-1.5 mt-2">
              <Step>
                Work through the checklist on{" "}
                <L href="/fiscal-year-end">Fiscal Year-End Tasks</L>
              </Step>
              <Step>
                Reconcile every bank account; reach 0 un-reconciled
                items
              </Step>
              <Step>
                Post depreciation, prepaid amortisation, and other
                year-end adjustments via Manual Journals
              </Step>
              <Step>
                Run the final{" "}
                <L href="/reports/trial-balance">Trial Balance</L>{" "}
                and verify it balances
              </Step>
              <Step>
                Export the statutory pack (see &ldquo;Documents to
                send to my accountant&rdquo;)
              </Step>
            </ol>
            <Hint>
              Period-locking (so users can&apos;t edit historical
              transactions) is on the roadmap.
            </Hint>
          </>
        ),
      },
      {
        id: "schedule-iii-statements",
        q: "How do I generate Schedule III (Companies Act) statements?",
        a: (
          <>
            <P>
              Quikfinance ships two Companies-Act-2013 compliant
              reports:
            </P>
            <ul className="list-disc ml-5 space-y-1.5 mt-2">
              <Step>
                <L href="/reports/profit-loss-schedule-iii">
                  Profit &amp; Loss (Schedule III)
                </L>{" "}
                — 15-section roman-numeralled layout
              </Step>
              <Step>
                <L href="/reports/balance-sheet-schedule-iii">
                  Balance Sheet (Schedule III)
                </L>{" "}
                — two-pane Equity &amp; Liabilities / Assets
                comparative layout
              </Step>
            </ul>
            <P>
              Both auto-map your CoA to the Schedule III buckets.
              Pick the As-of date for BS or the FY range for
              P&amp;L, then Export → CSV/XLSX/PDF.
            </P>
          </>
        ),
      },
      {
        id: "year-end-adjustments",
        q: "What year-end adjustment entries should I post?",
        a: (
          <>
            <P>Common ones to consider:</P>
            <ul className="list-disc ml-5 space-y-1.5 mt-2">
              <Step>
                <strong>Depreciation</strong> on fixed assets (use
                WDV or SLM as per your policy)
              </Step>
              <Step>
                <strong>Prepaid expense amortisation</strong> (e.g.
                annual insurance prepaid, recognise monthly portion)
              </Step>
              <Step>
                <strong>Accrued expenses</strong> for services
                received but not yet billed
              </Step>
              <Step>
                <strong>Deferred revenue</strong> recognition for
                services to be delivered
              </Step>
              <Step>
                <strong>Bad debt provision</strong> against doubtful
                AR
              </Step>
              <Step>
                <strong>Inventory adjustments</strong> for damage,
                shrinkage, or recount
              </Step>
            </ul>
            <P>
              All of these are posted via{" "}
              <L href="/accountant/manual-journals/new">
                Manual Journals
              </L>
              .
            </P>
          </>
        ),
      },
      {
        id: "lock-period",
        q: "How do I lock a period so no one can edit historical transactions?",
        a: (
          <P>
            Period-locking is on the roadmap. Until it ships, the
            recommended workaround is a custom Role with
            &ldquo;read-only on historical periods&rdquo;
            permissions — set at{" "}
            <L href="/settings/roles">Settings → Roles</L>.
          </P>
        ),
      },
    ],
  },
];

// ─── Lookup helpers ─────────────────────────────────────────────

export function findCategory(slug: string): FaqCategory | undefined {
  return HELP_CATEGORIES.find((c) => c.slug === slug);
}

export function allFaqCount(): number {
  return HELP_CATEGORIES.reduce((acc, c) => acc + c.faqs.length, 0);
}
