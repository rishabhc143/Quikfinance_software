import * as React from "react";
import Link from "next/link";

/**
 * Quikfinance Help — frequently-asked-questions data.
 *
 * Each answer follows a roughly consistent structure:
 *  - 1-2 sentence intro of what the feature does
 *  - When/why to use it
 *  - Numbered steps with inline route links
 *  - Tips, edge cases, gotchas
 *  - Related FAQs (where applicable)
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

// ─── Layout helpers ─────────────────────────────────────────────

function P({ children }: { children: React.ReactNode }) {
  return <p className="text-sm leading-relaxed">{children}</p>;
}

function H({ children }: { children: React.ReactNode }) {
  return (
    <h4 className="text-sm font-semibold mt-4 mb-1">{children}</h4>
  );
}

function Step({ children }: { children: React.ReactNode }) {
  return <li className="text-sm leading-relaxed">{children}</li>;
}

function Bullet({ children }: { children: React.ReactNode }) {
  return <li className="text-sm leading-relaxed">{children}</li>;
}

function Hint({ children }: { children: React.ReactNode }) {
  return (
    <div className="mt-3 text-xs text-muted-foreground bg-muted/40 border-l-2 border-primary/40 px-3 py-2 rounded-r">
      <span className="font-medium text-foreground">Tip:</span>{" "}
      {children}
    </div>
  );
}

function Warning({ children }: { children: React.ReactNode }) {
  return (
    <div className="mt-3 text-xs text-amber-900 dark:text-amber-200 bg-amber-50 dark:bg-amber-950/30 border-l-2 border-amber-500 px-3 py-2 rounded-r">
      <span className="font-medium">Heads up:</span> {children}
    </div>
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
          <>
            <P>
              If you forgot your password, you can request a one-time
              reset link without contacting support.
            </P>
            <H>How to reset</H>
            <ol className="list-decimal ml-5 space-y-1.5">
              <Step>
                On the login page, click{" "}
                <strong>Forgot password?</strong>
              </Step>
              <Step>
                Enter the email address you registered with
              </Step>
              <Step>
                Check your inbox (and spam folder) for a reset link.
                The link arrives within a minute.
              </Step>
              <Step>
                Click the link to open the reset form, type your new
                password twice, and submit.
              </Step>
              <Step>
                You&apos;ll be logged in automatically on the new
                device — and signed out from any other devices for
                safety.
              </Step>
            </ol>
            <Warning>
              Reset links expire <strong>after 1 hour</strong> for
              security. Request a fresh link if yours expired.
            </Warning>
            <Hint>
              If you don&apos;t receive the email at all, double-check
              the address you used to register or contact{" "}
              <a
                href="mailto:support@quikfinance.in"
                className="text-primary hover:underline"
              >
                support@quikfinance.in
              </a>
              .
            </Hint>
          </>
        ),
      },
      {
        id: "change-email",
        q: "How do I change my email address?",
        a: (
          <>
            <P>
              Your email address is your login identity, so changing
              it requires verifying the new address first.
            </P>
            <H>How to change</H>
            <ol className="list-decimal ml-5 space-y-1.5">
              <Step>
                Open <L href="/settings/profile">Settings → Profile</L>
              </Step>
              <Step>
                Edit the <strong>Email</strong> field and Save
              </Step>
              <Step>
                Quikfinance sends a verification email to the new
                address
              </Step>
              <Step>
                Click the verify link to confirm
              </Step>
            </ol>
            <H>What happens in the meantime</H>
            <P>
              Until you click the verify link, your old email keeps
              receiving notifications and remains your login. After
              verification, both transition to the new email
              automatically and you&apos;ll be asked to log in once
              with the new address.
            </P>
            <Hint>
              Changing your email doesn&apos;t change your password.
              If you want to update both, do them sequentially.
            </Hint>
          </>
        ),
      },
      {
        id: "enable-2fa",
        q: "How do I enable two-factor authentication?",
        a: (
          <>
            <P>
              Two-factor authentication (2FA) adds a code-based
              second step after password login, dramatically reducing
              the risk of unauthorised access if your password leaks.
            </P>
            <H>Current status</H>
            <P>
              2FA is on the roadmap for Q2 2026 and will support
              TOTP authenticator apps (Google Authenticator, 1Password,
              Authy) plus optional SMS as a backup.
            </P>
            <H>Until 2FA ships, the recommended hardening:</H>
            <ul className="list-disc ml-5 space-y-1.5">
              <Bullet>Use a unique random password from a password manager</Bullet>
              <Bullet>
                Don&apos;t reuse the same password on other sites
              </Bullet>
              <Bullet>
                Enable browser autofill so you never type the password
                manually (defeats keyloggers)
              </Bullet>
              <Bullet>
                Set up a password-protected screen lock on every
                device that&apos;s logged into Quikfinance
              </Bullet>
            </ul>
          </>
        ),
      },
      {
        id: "switch-organizations",
        q: "How do I switch between organisations?",
        a: (
          <>
            <P>
              Quikfinance supports multiple separate organisations
              (e.g. multiple businesses, multiple clients) under the
              same user account. Each org has its own books,
              transactions, users, and settings — they share nothing
              except your login.
            </P>
            <H>How to switch</H>
            <ol className="list-decimal ml-5 space-y-1.5">
              <Step>
                Click your organisation&apos;s name in the top-left
                of the sidebar
              </Step>
              <Step>
                A dropdown shows every organisation you&apos;re a
                member of, plus the role you have in each
              </Step>
              <Step>
                Click any org to switch — the page reloads with that
                org&apos;s data
              </Step>
            </ol>
            <H>Adding a new organisation</H>
            <P>
              In the same dropdown, pick{" "}
              <strong>+ New Organisation</strong>. You&apos;ll go
              through the same brief setup flow as your first org.
            </P>
            <Hint>
              Your last-selected org is remembered via a cookie so
              you don&apos;t have to switch every login.
            </Hint>
          </>
        ),
      },
      {
        id: "import-from-tally",
        q: "How do I import data from Tally or another accounting tool?",
        a: (
          <>
            <P>
              Quikfinance supports CSV imports on every list page so
              you can move customers, vendors, items, invoices, bills,
              and chart-of-accounts entries over in bulk.
            </P>
            <H>Recommended migration order</H>
            <ol className="list-decimal ml-5 space-y-1.5">
              <Step>
                <strong>Chart of Accounts first.</strong> Export from
                your old tool, normalise to Quikfinance&apos;s
                account-type vocabulary (Asset / Liability / Equity /
                Income / Expense), then upload via{" "}
                <L href="/accountant/chart-of-accounts">
                  Accountant → Chart of Accounts → Import
                </L>
                .
              </Step>
              <Step>
                <strong>Opening balances.</strong> Capture closing
                balances of every account from your old tool as of
                the migration date — enter via{" "}
                <L href="/settings/opening-balances">
                  Settings → Opening Balances
                </L>
                . The offsetting entry posts to &ldquo;Opening Balance
                Equity&rdquo; which your accountant clears at year-end.
              </Step>
              <Step>
                <strong>Master data: Customers, Vendors, Items.</strong>{" "}
                Each list page has an Import button — drop a CSV with
                the columns shown in the template.
              </Step>
              <Step>
                <strong>Open transactions.</strong> Only recreate
                invoices and bills that are still open (not paid yet).
                Historical/paid transactions can stay in the old tool
                as audit reference.
              </Step>
            </ol>
            <Warning>
              Don&apos;t try to import every historical journal entry
              from your old system. It&apos;s rarely worth the effort
              and the opening-balance approach is cleaner.
            </Warning>
            <Hint>
              We offer a <strong>free 30-minute guided migration
              session</strong> for new customers. Email{" "}
              <a
                href="mailto:support@quikfinance.in"
                className="text-primary hover:underline"
              >
                support@quikfinance.in
              </a>{" "}
              with subject &ldquo;Migration help&rdquo; to book one.
            </Hint>
          </>
        ),
      },
      {
        id: "export-backup",
        q: "How do I export a full backup of my Quikfinance data?",
        a: (
          <>
            <P>
              Until a one-click backup ZIP ships, you can self-assemble
              a complete export from the per-list and per-report
              export buttons.
            </P>
            <H>Master data (CSV/XLSX from each list page)</H>
            <ul className="list-disc ml-5 space-y-1.5">
              <Bullet>Customers, Vendors, Items, Chart of Accounts</Bullet>
              <Bullet>Invoices, Bills, Credit Notes, Vendor Credits</Bullet>
              <Bullet>Payments Received, Payments Made</Bullet>
              <Bullet>Manual Journals</Bullet>
              <Bullet>Bank Accounts &amp; reconciliation history</Bullet>
            </ul>
            <H>Accounting reports for archival</H>
            <ul className="list-disc ml-5 space-y-1.5">
              <Bullet>
                <L href="/reports/trial-balance">Trial Balance</L> as
                of the fiscal year end
              </Bullet>
              <Bullet>
                <L href="/reports/profit-loss">Profit &amp; Loss</L>{" "}
                for the full FY
              </Bullet>
              <Bullet>
                <L href="/reports/balance-sheet">Balance Sheet</L> as
                of FY end
              </Bullet>
              <Bullet>
                <L href="/reports/cash-flow">Cash Flow</L> for the
                full FY
              </Bullet>
            </ul>
            <P>
              Export each as PDF/XLSX/CSV and archive to your file
              storage / Google Drive / etc.
            </P>
            <Hint>
              A one-click &ldquo;Download all data&rdquo; ZIP is on
              the roadmap. Until then, you can also POST to our admin
              backup endpoint if your accountant needs a full Postgres
              dump — contact support.
            </Hint>
          </>
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
          <>
            <P>
              Your organisation profile is the source of truth for
              everything that appears on outgoing invoices, bills,
              and reports — address on top of every PDF, GSTIN on
              every GST invoice, PAN on every TDS certificate, and
              so on.
            </P>
            <H>What to fill in</H>
            <ul className="list-disc ml-5 space-y-1.5">
              <Bullet>
                <strong>Legal name</strong> and{" "}
                <strong>display name</strong> (can differ)
              </Bullet>
              <Bullet>
                <strong>Primary address</strong> (used on PDFs and
                determines CGST+SGST vs IGST GST split)
              </Bullet>
              <Bullet>
                <strong>GSTIN</strong> if registered + composition
                vs regular toggle
              </Bullet>
              <Bullet>
                <strong>PAN</strong>, CIN, and other statutory
                identifiers
              </Bullet>
              <Bullet>
                <strong>Logo</strong> (PNG/JPG up to 2 MB) for
                invoice headers
              </Bullet>
              <Bullet>
                <strong>Phone, email, website</strong> for footer
                contact info
              </Bullet>
            </ul>
            <H>How</H>
            <ol className="list-decimal ml-5 space-y-1.5">
              <Step>
                Open{" "}
                <L href="/settings/profile">
                  Settings → Organisation Profile
                </L>
              </Step>
              <Step>
                Fill in each field
              </Step>
              <Step>
                Save — changes apply immediately to all newly
                generated documents
              </Step>
            </ol>
            <Hint>
              Existing invoices/bills don&apos;t retroactively update
              when you change the profile. They&apos;re snapshots at
              the time of creation, which is correct from an audit
              perspective.
            </Hint>
          </>
        ),
      },
      {
        id: "invite-accountant",
        q: "How do I invite my accountant or team?",
        a: (
          <>
            <P>
              You can invite unlimited users into your organisation
              with role-based permissions. Common roles: Owner,
              Admin, Accountant, Staff, Read-only.
            </P>
            <H>How to invite</H>
            <ol className="list-decimal ml-5 space-y-1.5">
              <Step>
                Open <L href="/settings/users">Settings → Users</L>
              </Step>
              <Step>
                Click <strong>Invite User</strong>
              </Step>
              <Step>
                Enter the person&apos;s email and pick a role
              </Step>
              <Step>
                Click Send — they receive a one-click invite link.
                The invite expires after 7 days.
              </Step>
              <Step>
                Once they accept, they show up in the Users list and
                can log in immediately.
              </Step>
            </ol>
            <H>Role permissions</H>
            <ul className="list-disc ml-5 space-y-1.5">
              <Bullet>
                <strong>Owner</strong>: full access including billing
                + deleting the organisation
              </Bullet>
              <Bullet>
                <strong>Admin</strong>: full access except
                billing/org deletion
              </Bullet>
              <Bullet>
                <strong>Accountant</strong>: full read + write on
                accounting modules; cannot manage users
              </Bullet>
              <Bullet>
                <strong>Staff</strong>: create invoices, bills,
                expenses but no Reports or settings access
              </Bullet>
              <Bullet>
                <strong>Read-only</strong>: view everything, change
                nothing — perfect for stakeholders
              </Bullet>
            </ul>
            <Hint>
              You can customise role permissions further at{" "}
              <L href="/settings/roles">Settings → Roles</L>.
            </Hint>
          </>
        ),
      },
      {
        id: "first-invoice",
        q: "How do I create my first invoice?",
        a: (
          <>
            <P>
              Invoices in Quikfinance are double-entry safe — when
              you save an invoice as Open, the system automatically
              posts journal entries to Accounts Receivable (debit) +
              Sales Income (credit) + GST Output (credit), so your
              books stay balanced.
            </P>
            <H>Steps</H>
            <ol className="list-decimal ml-5 space-y-1.5">
              <Step>
                Add at least one Customer at{" "}
                <L href="/sales/customers/new">
                  Sales → Customers → New
                </L>
                . Capture name, GSTIN, billing state, and contact
                info.
              </Step>
              <Step>
                Open{" "}
                <L href="/sales/invoices/new">Sales → Invoices → New</L>
              </Step>
              <Step>
                Pick the customer. The form prefills with their
                default terms (Net 15 / Net 30 / etc.).
              </Step>
              <Step>
                Add line items. For each line: pick an item (from
                Items master) or type a description, set qty +
                rate + GST rate.
              </Step>
              <Step>
                Click <strong>Save as Open</strong> to make it
                billable, or <strong>Save as Draft</strong> to
                continue editing later.
              </Step>
            </ol>
            <Hint>
              The invoice immediately appears in your{" "}
              <L href="/reports/ar-aging">AR Aging</L> and{" "}
              <L href="/reports/profit-loss">P&amp;L</L> reports.
              Stock for inventory-tracked items is reduced at the
              same moment.
            </Hint>
          </>
        ),
      },
      {
        id: "first-bill",
        q: "How do I create my first vendor bill?",
        a: (
          <>
            <P>
              A bill records something you owe a vendor — typically
              after receiving an invoice from them. Like Invoices,
              bills are double-entry safe: the system posts to
              Accounts Payable (credit) + Expense/Asset account
              (debit) + Input GST (debit).
            </P>
            <H>Steps</H>
            <ol className="list-decimal ml-5 space-y-1.5">
              <Step>
                Add the Vendor at{" "}
                <L href="/purchases/vendors/new">
                  Purchases → Vendors → New
                </L>{" "}
                with GSTIN, address, and bank details.
              </Step>
              <Step>
                Open{" "}
                <L href="/purchases/bills/new">
                  Purchases → Bills → New
                </L>
              </Step>
              <Step>
                Pick the vendor. The form prefills payment terms
                and default expense account from their profile.
              </Step>
              <Step>
                Enter the <strong>vendor&apos;s bill number</strong>{" "}
                (their reference, not ours) and the bill date + due
                date.
              </Step>
              <Step>
                Add line items — for each, pick the expense category
                and GST rate.
              </Step>
              <Step>
                <strong>Save as Open</strong> to start tracking AP,
                or Draft for later.
              </Step>
            </ol>
            <Warning>
              Always set the bill date to the vendor&apos;s invoice
              date, not today&apos;s date — this affects GST input
              tax credit timing.
            </Warning>
          </>
        ),
      },
      {
        id: "configure-coa",
        q: "How do I configure my Chart of Accounts?",
        a: (
          <>
            <P>
              The Chart of Accounts (CoA) is the master list of every
              ledger account in your business — bank accounts,
              receivables, sales income, rent expense, etc. Every
              transaction posts to at least two of these accounts.
            </P>
            <H>Starter CoA</H>
            <P>
              Quikfinance ships with a sensible default CoA for Indian
              SMBs (50+ accounts covering common needs). You can use
              it as-is for most businesses.
            </P>
            <H>Customising</H>
            <ol className="list-decimal ml-5 space-y-1.5">
              <Step>
                Open{" "}
                <L href="/accountant/chart-of-accounts">
                  Accountant → Chart of Accounts
                </L>
              </Step>
              <Step>
                Click <strong>+ New</strong> to add an account — pick
                the type (Asset / Liability / Equity / Income /
                Expense) and sub-type (Cash / Bank / AR / Fixed Asset
                / etc.)
              </Step>
              <Step>
                To deactivate an account you don&apos;t need, edit it
                and toggle &ldquo;Inactive&rdquo;. Deletion is
                disabled once an account has any transactions
                (audit-safe).
              </Step>
              <Step>
                To bulk-import a CoA from another tool, use the
                Import button on the same page.
              </Step>
            </ol>
            <Hint>
              See &ldquo;What do the account types mean?&rdquo; in
              the Manual Journals &amp; CoA category for a primer
              on Asset / Liability / Equity / Income / Expense.
            </Hint>
          </>
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
          <>
            <P>
              An invoice records a sale you&apos;ve made — it&apos;s
              the formal document you give your customer and the
              entry that drives both your AR and your revenue
              recognition.
            </P>
            <H>Steps</H>
            <ol className="list-decimal ml-5 space-y-1.5">
              <Step>
                Open{" "}
                <L href="/sales/invoices/new">Sales → Invoices → New</L>
              </Step>
              <Step>
                Pick the customer (must exist in Customers list)
              </Step>
              <Step>
                Invoice date, due date, and payment terms autofill —
                tweak if needed
              </Step>
              <Step>
                Add line items: pick an Item or type a description,
                set qty / rate / GST rate. Subtotal + tax compute
                live.
              </Step>
              <Step>
                Optionally: add a discount, set a custom number,
                attach a PO reference, or pick a non-default PDF
                template
              </Step>
              <Step>
                Click <strong>Save as Open</strong> (commits to AR
                +P&amp;L), <strong>Save as Draft</strong> (no
                accounting impact), or <strong>Save and Send</strong>
                {" "}(saves as Open AND emails the customer
                immediately)
              </Step>
            </ol>
            <Hint>
              Each saved invoice creates a snapshot — changing your
              organisation profile or PDF template later won&apos;t
              alter historical invoices. That&apos;s by design for
              audit safety.
            </Hint>
          </>
        ),
      },
      {
        id: "customize-invoice-pdf",
        q: "How do I customise the invoice PDF template?",
        a: (
          <>
            <P>
              The PDF template controls the look of the invoice your
              customer receives. You can have multiple templates and
              pick a different one per invoice.
            </P>
            <H>What you can customise</H>
            <ul className="list-disc ml-5 space-y-1.5">
              <Bullet>Header colour and accent colour</Bullet>
              <Bullet>Logo placement (left / centre / right)</Bullet>
              <Bullet>Which columns appear (Item / Description / HSN / Qty / Rate / Tax / Amount)</Bullet>
              <Bullet>Footer text (e.g. bank details, terms &amp; conditions, signature line)</Bullet>
              <Bullet>Watermark (e.g. PAID / OVERDUE / DRAFT)</Bullet>
              <Bullet>Page size (A4 / Letter) and orientation</Bullet>
            </ul>
            <H>How</H>
            <ol className="list-decimal ml-5 space-y-1.5">
              <Step>
                Open{" "}
                <L href="/settings/pdf-templates">
                  Settings → PDF Templates
                </L>
              </Step>
              <Step>
                Pick an existing template to edit, or click{" "}
                <strong>New Template</strong> to start from a preset
              </Step>
              <Step>
                Use the live preview pane to see your changes apply
                in real-time
              </Step>
              <Step>
                Save, then optionally tick &ldquo;Set as default&rdquo;
                — newly created invoices use the default template
                unless overridden
              </Step>
            </ol>
            <Hint>
              The same templates apply to Quotes, Sales Orders,
              Delivery Notes, and Credit Notes — saving you from
              maintaining separate looks per document type.
            </Hint>
          </>
        ),
      },
      {
        id: "email-invoice",
        q: "How do I email an invoice to a customer?",
        a: (
          <>
            <P>
              Quikfinance sends emails through Resend (a transactional
              email service) so deliverability is high and bounces
              are tracked.
            </P>
            <H>Steps</H>
            <ol className="list-decimal ml-5 space-y-1.5">
              <Step>
                Open the invoice
              </Step>
              <Step>
                Click <strong>Send</strong> in the top-right
              </Step>
              <Step>
                A dialog opens, pre-filled with the customer&apos;s
                primary contact email, a default subject (e.g.
                &ldquo;Invoice INV-0042 from Quikfinance India
                Pvt Ltd&rdquo;), and a default body — all editable
              </Step>
              <Step>
                Add CC/BCC recipients if needed
              </Step>
              <Step>
                The PDF attaches automatically. You can also tick
                &ldquo;Include a payment link&rdquo; to embed an
                online-pay button
              </Step>
              <Step>
                Click Send. The status of the email (sent / opened /
                clicked) updates on the invoice timeline.
              </Step>
            </ol>
            <Hint>
              Customise the default subject and body at{" "}
              <L href="/settings/email-templates">
                Settings → Email Templates
              </L>{" "}
              — variables like <code>{`{{customerName}}`}</code> and{" "}
              <code>{`{{invoiceNumber}}`}</code> auto-fill per email.
            </Hint>
          </>
        ),
      },
      {
        id: "recurring-invoice",
        q: "How do I create a recurring invoice?",
        a: (
          <>
            <P>
              Recurring invoices are templates that auto-generate
              child invoices on a schedule — perfect for monthly
              retainers, subscription billing, or recurring service
              contracts.
            </P>
            <H>How</H>
            <ol className="list-decimal ml-5 space-y-1.5">
              <Step>
                Open{" "}
                <L href="/sales/recurring-invoices/new">
                  Sales → Recurring Invoices → New
                </L>
              </Step>
              <Step>
                Pick the customer + line items as usual
              </Step>
              <Step>
                Set the <strong>start date</strong> and{" "}
                <strong>frequency</strong>: weekly / monthly /
                quarterly / yearly / custom (every N days)
              </Step>
              <Step>
                Set the <strong>end condition</strong>: never, after
                N occurrences, or on a specific end date
              </Step>
              <Step>
                Pick whether child invoices are created as{" "}
                <strong>Draft</strong> (default — you review then
                send) or <strong>Open</strong> (auto-billable
                without review)
              </Step>
              <Step>
                Save. The next child fires on the start date and
                continues per the cadence.
              </Step>
            </ol>
            <H>Managing in flight</H>
            <P>
              From{" "}
              <L href="/sales/recurring-invoices">
                Sales → Recurring Invoices
              </L>{" "}
              you can pause / resume / edit / delete any active
              template. Pausing skips upcoming child generation
              until you resume.
            </P>
          </>
        ),
      },
      {
        id: "record-customer-payment",
        q: "How do I record a payment received from a customer?",
        a: (
          <>
            <P>
              Recording a payment reduces a customer&apos;s open AR
              and increases your bank/cash account.
            </P>
            <H>Two ways to record</H>
            <H>1. From the invoice (most common)</H>
            <ol className="list-decimal ml-5 space-y-1.5">
              <Step>Open the open invoice</Step>
              <Step>
                Click <strong>Record Payment</strong>
              </Step>
              <Step>
                Set the amount (full balance prefills), date,
                payment mode (Bank Transfer / Cheque / Card / Cash /
                UPI), and the bank/cash account it landed in
              </Step>
              <Step>
                Save. The invoice flips to{" "}
                <strong>Partially Paid</strong> or{" "}
                <strong>Paid</strong>.
              </Step>
            </ol>
            <H>2. Bulk allocation across invoices</H>
            <ol className="list-decimal ml-5 space-y-1.5">
              <Step>
                Open{" "}
                <L href="/sales/payments-received/new">
                  Sales → Payments Received → New
                </L>
              </Step>
              <Step>
                Pick the customer — every open invoice for them is
                listed
              </Step>
              <Step>
                Enter the total payment amount and allocate across
                multiple invoices (the form auto-suggests by
                oldest-first FIFO)
              </Step>
              <Step>
                Save
              </Step>
            </ol>
            <Hint>
              Excess payment (overpayment) becomes an &ldquo;Advance
              Payment&rdquo; on the customer&apos;s ledger, ready to
              apply to future invoices.
            </Hint>
          </>
        ),
      },
      {
        id: "issue-credit-note",
        q: "How do I issue a credit note?",
        a: (
          <>
            <P>
              A credit note reverses (fully or partially) an invoice
              you previously issued — used for returns, refunds, or
              corrections. It posts a credit to Sales/Output GST and
              a debit to Customer&apos;s AR.
            </P>
            <H>From an invoice (recommended)</H>
            <ol className="list-decimal ml-5 space-y-1.5">
              <Step>
                Open the invoice you want to credit
              </Step>
              <Step>
                Click More → <strong>Create Credit Note</strong>
              </Step>
              <Step>
                A new credit note opens, prefilled with the invoice
                line items
              </Step>
              <Step>
                Adjust line quantities or remove lines to credit only
                part of the invoice
              </Step>
              <Step>
                Save as Open
              </Step>
            </ol>
            <H>Standalone credit note</H>
            <P>
              For credits not tied to a specific invoice, open{" "}
              <L href="/sales/credit-notes/new">
                Sales → Credit Notes → New
              </L>
              .
            </P>
            <H>Applying the credit</H>
            <P>
              Once open, you can:
            </P>
            <ul className="list-disc ml-5 space-y-1.5">
              <Bullet>
                <strong>Apply to invoice</strong>: reduce balance on
                a different open invoice for the same customer
              </Bullet>
              <Bullet>
                <strong>Refund</strong>: record a refund payment back
                to the customer (cash leaves your bank)
              </Bullet>
              <Bullet>
                <strong>Hold</strong>: leave it as an open credit on
                the customer&apos;s account
              </Bullet>
            </ul>
          </>
        ),
      },
      {
        id: "customer-statement",
        q: "How do I send a customer their statement?",
        a: (
          <>
            <P>
              A customer statement lists every transaction (invoices,
              credit notes, payments) for a customer in date order,
              ending with their open balance. Useful for monthly
              reconciliation conversations.
            </P>
            <H>How</H>
            <ol className="list-decimal ml-5 space-y-1.5">
              <Step>
                Open <L href="/sales/customers">Sales → Customers</L>
              </Step>
              <Step>
                Click on the customer
              </Step>
              <Step>
                Click the <strong>Statement</strong> tab
              </Step>
              <Step>
                Set the date range (default: last 90 days, but you
                can pick any window)
              </Step>
              <Step>
                Click <strong>Export to PDF</strong> or{" "}
                <strong>Email Statement</strong>
              </Step>
            </ol>
            <Hint>
              For monthly statement runs across all customers, use
              the Schedule Reports feature on AR Aging to email each
              customer their statement automatically.
            </Hint>
          </>
        ),
      },
      {
        id: "payment-reminders",
        q: "How do I set up payment reminders for overdue invoices?",
        a: (
          <>
            <P>
              Payment reminders send automated emails to customers
              with overdue invoices — saving you the awkward manual
              chase.
            </P>
            <H>How</H>
            <ol className="list-decimal ml-5 space-y-1.5">
              <Step>
                Open <L href="/settings/reminders">Settings → Reminders</L>
              </Step>
              <Step>
                Click <strong>+ New Reminder</strong>
              </Step>
              <Step>
                Set the trigger: e.g.{" "}
                <em>7 days before due</em>, <em>3 days after due</em>,
                or <em>14 days after due</em>
              </Step>
              <Step>
                Pick the email template (or edit the default)
              </Step>
              <Step>
                Save — reminders auto-fire every day at 6 AM IST for
                matching invoices
              </Step>
            </ol>
            <H>Recommended ladder</H>
            <P>
              A common 4-step ladder that improves collection rate:
            </P>
            <ul className="list-disc ml-5 space-y-1.5">
              <Bullet>3 days before due — friendly reminder</Bullet>
              <Bullet>1 day after due — &ldquo;Just a heads up&rdquo;</Bullet>
              <Bullet>7 days overdue — more direct ask</Bullet>
              <Bullet>30 days overdue — escalation, mention follow-up</Bullet>
            </ul>
          </>
        ),
      },
      {
        id: "discount-or-late-fee",
        q: "How do I add a discount or late fee to an invoice?",
        a: (
          <>
            <P>
              Both apply at the line-item or document level — choose
              based on whether the adjustment is for a single item
              or the whole invoice.
            </P>
            <H>Discount on a line item</H>
            <P>
              In the line, expand the row to show the Discount column.
              Enter a percentage or flat amount — the line total
              recomputes and GST is calculated on the discounted
              amount (which matches GST law).
            </P>
            <H>Discount on the whole invoice</H>
            <P>
              Below the line items, click{" "}
              <strong>Add Discount</strong>. Enter a percent or flat
              amount that applies to the subtotal before tax.
            </P>
            <H>Late fee on an overdue invoice</H>
            <P>
              Quikfinance doesn&apos;t auto-charge late fees in v1.
              The workaround:
            </P>
            <ol className="list-decimal ml-5 space-y-1.5">
              <Step>
                Open the original invoice after the due date
              </Step>
              <Step>
                Edit and add a new line item labelled{" "}
                <em>Late Fee</em> with the calculated amount
              </Step>
              <Step>
                Map it to your &ldquo;Late Fee Income&rdquo; or
                &ldquo;Other Income&rdquo; account
              </Step>
              <Step>
                Save — invoice balance increases; email a
                supplementary notice if needed
              </Step>
            </ol>
            <Hint>
              Auto-late-fee calculation is on the roadmap. The
              workaround above maintains correct accounting in the
              meantime.
            </Hint>
          </>
        ),
      },
      {
        id: "void-or-delete-invoice",
        q: "How do I void or delete an invoice?",
        a: (
          <>
            <P>
              Choose based on what you want to preserve:
            </P>
            <H>Void</H>
            <P>
              Marks the invoice as cancelled, reverses its accounting
              entries, but <strong>preserves the invoice number</strong>{" "}
              in your sequence for audit history. The PDF shows a
              &ldquo;VOID&rdquo; watermark.
            </P>
            <P>
              <strong>Use when:</strong> you sent it to the customer
              and need to cancel it formally.
            </P>
            <H>Delete</H>
            <P>
              Removes the invoice entirely — including its number,
              which becomes available for the next invoice. Only
              available <strong>before any payment is applied</strong>.
            </P>
            <P>
              <strong>Use when:</strong> you created it by mistake and
              haven&apos;t sent it.
            </P>
            <H>How</H>
            <ol className="list-decimal ml-5 space-y-1.5">
              <Step>Open the invoice</Step>
              <Step>
                Click <strong>More</strong> →{" "}
                <strong>Void</strong> or <strong>Delete</strong>
              </Step>
              <Step>Confirm</Step>
            </ol>
            <Warning>
              For GST-registered businesses, voiding (not deleting) is
              the legally correct path once an invoice has been
              issued to the customer.
            </Warning>
          </>
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
          <>
            <P>
              A quote is a non-binding price proposal you give a
              prospect before they commit. It has no accounting
              impact — your AR, P&amp;L, and stock are all
              unchanged until the quote is accepted and converted.
            </P>
            <H>How</H>
            <ol className="list-decimal ml-5 space-y-1.5">
              <Step>
                Open{" "}
                <L href="/sales/quotes/new">Sales → Quotes → New</L>
              </Step>
              <Step>
                Pick the customer (or create a new one inline)
              </Step>
              <Step>
                Add line items with proposed qty + rate + tax
              </Step>
              <Step>
                Set an <strong>expiry date</strong> (default 30 days)
                so it auto-marks as Expired if not accepted
              </Step>
              <Step>
                Click <strong>Save as Draft</strong> to keep editing,
                or <strong>Save and Send</strong> to email it to the
                customer
              </Step>
            </ol>
            <Hint>
              Quotes use the same PDF templates as invoices, so the
              look is consistent.
            </Hint>
          </>
        ),
      },
      {
        id: "convert-quote-to-invoice",
        q: "How do I convert a quote to an invoice?",
        a: (
          <>
            <P>
              Once a customer accepts your quote, one-click
              conversion creates the invoice with all the same line
              items — no re-typing.
            </P>
            <H>How</H>
            <ol className="list-decimal ml-5 space-y-1.5">
              <Step>
                Open the accepted quote
              </Step>
              <Step>
                Click <strong>More</strong> →{" "}
                <strong>Convert to Invoice</strong>
              </Step>
              <Step>
                Quikfinance creates a draft invoice prefilled with
                the quote&apos;s lines, customer, and terms
              </Step>
              <Step>
                Edit if needed (e.g. update qty if partial billing),
                then Save as Open
              </Step>
            </ol>
            <H>Audit trail</H>
            <P>
              The original quote stays linked to the resulting
              invoice — both reference each other on their detail
              pages, so you can trace the workflow end-to-end.
            </P>
            <Hint>
              You can convert one quote to multiple invoices if you
              bill in installments — each invoice references the
              same source quote.
            </Hint>
          </>
        ),
      },
      {
        id: "create-sales-order",
        q: "How do I create a sales order?",
        a: (
          <>
            <P>
              A Sales Order (SO) sits between Quote and Invoice. It
              records that a customer has committed to buy, but you
              haven&apos;t shipped or billed yet. SOs <strong>reserve
              inventory</strong> so over-selling is prevented.
            </P>
            <H>When to use</H>
            <ul className="list-disc ml-5 space-y-1.5">
              <Bullet>
                Customer pays in advance for future delivery
              </Bullet>
              <Bullet>
                You ship in multiple installments and need to track
                what&apos;s pending
              </Bullet>
              <Bullet>
                Complex B2B workflow where Purchase Order → Sales
                Order → Delivery Note → Invoice is required by audit
              </Bullet>
            </ul>
            <H>How</H>
            <ol className="list-decimal ml-5 space-y-1.5">
              <Step>
                Open{" "}
                <L href="/sales/sales-orders/new">
                  Sales → Sales Orders → New
                </L>
              </Step>
              <Step>
                Pick the customer + line items
              </Step>
              <Step>
                Save as Open — inventory is reserved
              </Step>
              <Step>
                When ready to ship, convert SO → Delivery Note. When
                ready to bill, convert SO → Invoice.
              </Step>
            </ol>
          </>
        ),
      },
      {
        id: "create-delivery-note",
        q: "How do I issue a delivery note (challan)?",
        a: (
          <>
            <P>
              A Delivery Note (also called Delivery Challan) records
              the physical dispatch of goods to a customer{" "}
              <strong>before</strong> you raise an invoice. Stock
              reduces immediately but no GST or AR is created.
            </P>
            <H>When to use</H>
            <ul className="list-disc ml-5 space-y-1.5">
              <Bullet>
                Goods sent for approval (sale-or-return basis)
              </Bullet>
              <Bullet>
                Job work / works-contract dispatch
              </Bullet>
              <Bullet>
                You bill at month-end but dispatch daily
              </Bullet>
            </ul>
            <H>How</H>
            <ol className="list-decimal ml-5 space-y-1.5">
              <Step>
                Open{" "}
                <L href="/sales/delivery-challans/new">
                  Sales → Delivery Challans → New
                </L>
              </Step>
              <Step>
                Pick the customer + line items being dispatched
              </Step>
              <Step>
                Set the dispatch date, transport mode, vehicle
                number (for E-way Bill compliance)
              </Step>
              <Step>
                Save and print/email — the customer signs and returns
                a copy on receipt
              </Step>
              <Step>
                Later, convert one or more delivery notes into a
                single consolidated invoice
              </Step>
            </ol>
            <Warning>
              For consignments above ₹50,000 inter-state (or as per
              your state&apos;s rules), you also need an E-way Bill.
              Quikfinance flags consignments that may need one.
            </Warning>
          </>
        ),
      },
      {
        id: "sales-document-flow",
        q: "What's the difference between Quote, Sales Order, Delivery Note, and Invoice?",
        a: (
          <>
            <P>
              These four document types map to four different points
              in the customer commitment timeline. Each adds more
              binding effect than the last.
            </P>
            <H>The flow</H>
            <ul className="list-disc ml-5 space-y-1.5">
              <Bullet>
                <strong>Quote (Estimate)</strong> — a proposed price.{" "}
                <em>No accounting impact, no stock impact.</em> Can
                be edited or expired with no audit trail.
              </Bullet>
              <Bullet>
                <strong>Sales Order</strong> — customer committed to
                buy.{" "}
                <em>
                  No accounting impact, but reserves inventory
                </em>{" "}
                so you don&apos;t over-sell.
              </Bullet>
              <Bullet>
                <strong>Delivery Note (Challan)</strong> — goods
                physically dispatched.{" "}
                <em>Inventory reduces.</em> No GST or invoice yet.
              </Bullet>
              <Bullet>
                <strong>Invoice</strong> — billable.{" "}
                <em>
                  GST applied, AR created, P&amp;L impacted.
                </em>{" "}
                The committed accounting event.
              </Bullet>
            </ul>
            <H>You don&apos;t have to use all four</H>
            <P>
              Many small businesses skip directly to Invoice. Use the
              extra steps only if your workflow genuinely needs them
              (e.g. B2B with separate dispatch/billing cycles).
            </P>
            <Hint>
              GST law only mandates Invoice for taxable supplies. The
              other three are optional internal control documents.
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
          <>
            <P>
              A bill records an invoice you&apos;ve received from a
              vendor — something you owe. It creates AP and recognises
              the expense (or asset) in your books.
            </P>
            <H>Steps</H>
            <ol className="list-decimal ml-5 space-y-1.5">
              <Step>
                Open{" "}
                <L href="/purchases/bills/new">
                  Purchases → Bills → New
                </L>
              </Step>
              <Step>
                Pick the vendor (their default payment terms +
                expense account autofill)
              </Step>
              <Step>
                Enter the <strong>vendor&apos;s bill number</strong>{" "}
                — their reference, not Quikfinance&apos;s — and the
                bill date + due date
              </Step>
              <Step>
                Add line items: for each, pick the expense category
                (which determines the GL account), HSN/SAC, qty,
                rate, GST
              </Step>
              <Step>
                Optionally tag the bill to a project, customer (for
                billable expense), or reporting tag
              </Step>
              <Step>
                Click <strong>Save as Open</strong> — bill is now a
                liability on your Balance Sheet
              </Step>
            </ol>
            <Warning>
              Always set <strong>bill date</strong> to the vendor&apos;s
              invoice date, not today&apos;s date. GST Input Tax
              Credit timing is calculated from this field, and
              accountants will check it.
            </Warning>
            <Hint>
              If the bill is for an inventory item, also pick the
              item in the line — stock will increase on save.
            </Hint>
          </>
        ),
      },
      {
        id: "categorise-expense",
        q: "How do I categorise an expense?",
        a: (
          <>
            <P>
              Quikfinance distinguishes between two purchase types:
            </P>
            <ul className="list-disc ml-5 space-y-1.5">
              <Bullet>
                <strong>Bill</strong> — from a vendor you&apos;ll pay
                later (creates AP)
              </Bullet>
              <Bullet>
                <strong>Expense</strong> — already paid, often by
                petty cash or company card (immediate cash impact)
              </Bullet>
            </ul>
            <H>How to categorise an expense</H>
            <ol className="list-decimal ml-5 space-y-1.5">
              <Step>
                Open{" "}
                <L href="/purchases/expenses/new">
                  Purchases → Expenses → New
                </L>
              </Step>
              <Step>
                Pick the <strong>Expense Account</strong> from the
                dropdown — this is the GL account on your CoA that
                determines which P&amp;L line it hits
              </Step>
              <Step>
                Pick the <strong>Paid Through</strong> account (Bank
                / Cash / Credit Card)
              </Step>
              <Step>
                Set amount, vendor (optional), GST (for ITC tracking),
                and description
              </Step>
              <Step>
                Save — both legs of the journal entry are posted
                automatically
              </Step>
            </ol>
            <Hint>
              If the expense is reimbursable from a customer, tick{" "}
              <strong>Mark as Billable</strong> and pick the customer —
              the expense will surface on the customer&apos;s next
              invoice form as a billable item to recover.
            </Hint>
          </>
        ),
      },
      {
        id: "recurring-bill",
        q: "How do I set up a recurring vendor bill?",
        a: (
          <>
            <P>
              Recurring bills are templates for predictable vendor
              charges — rent, software subscriptions, utility bills,
              retainers. Quikfinance generates child bills on each
              due date automatically.
            </P>
            <H>How</H>
            <ol className="list-decimal ml-5 space-y-1.5">
              <Step>
                Open{" "}
                <L href="/purchases/recurring-bills/new">
                  Purchases → Recurring Bills → New
                </L>
              </Step>
              <Step>
                Pick the vendor and add line items as usual
              </Step>
              <Step>
                Set frequency (weekly / monthly / quarterly / yearly)
                and start date
              </Step>
              <Step>
                Pick end condition (never / after N occurrences / on
                end date)
              </Step>
              <Step>
                Save — children fire as <strong>Drafts</strong> on
                each due date by default, so you can review before
                posting to AP
              </Step>
            </ol>
            <Hint>
              For predictable bills (e.g. rent), you can flip
              children to <strong>Auto-Open</strong> — they
              auto-post without your review. Use sparingly.
            </Hint>
          </>
        ),
      },
      {
        id: "purchase-order",
        q: "How do I create a purchase order?",
        a: (
          <>
            <P>
              A Purchase Order (PO) is the formal request you send a
              vendor to supply goods or services. Like Sales Orders,
              it has no accounting impact until billed — but it
              creates a paper trail and pre-commits inventory
              expectations.
            </P>
            <H>How</H>
            <ol className="list-decimal ml-5 space-y-1.5">
              <Step>
                Open{" "}
                <L href="/purchases/orders/new">
                  Purchases → Purchase Orders → New
                </L>
              </Step>
              <Step>
                Pick the vendor, set delivery address (your org or
                customer drop-ship), and add line items
              </Step>
              <Step>
                Save as Open and email it to the vendor
              </Step>
              <Step>
                When goods arrive, open the PO and click{" "}
                <strong>Convert to Bill</strong> — the bill prefills
                from the PO
              </Step>
              <Step>
                Adjust line quantities if partial delivery — the PO
                status updates to{" "}
                <strong>Partially Billed</strong>
              </Step>
            </ol>
            <H>PO lifecycle</H>
            <ul className="list-disc ml-5 space-y-1.5">
              <Bullet>Draft → Issued → Partially Billed → Billed → Closed</Bullet>
              <Bullet>Or: Draft → Issued → Cancelled</Bullet>
            </ul>
          </>
        ),
      },
      {
        id: "vendor-credit",
        q: "How do I issue or apply a vendor credit?",
        a: (
          <>
            <P>
              A Vendor Credit (often called a debit note from the
              buyer&apos;s perspective) records that a vendor owes you
              money back — for returned goods, overcharges, or other
              reasons.
            </P>
            <H>How to record</H>
            <ol className="list-decimal ml-5 space-y-1.5">
              <Step>
                Open{" "}
                <L href="/purchases/vendor-credits/new">
                  Purchases → Vendor Credits → New
                </L>
              </Step>
              <Step>
                Pick the vendor and add lines for the credited items
                (with GST reversal where applicable)
              </Step>
              <Step>
                Save as Open
              </Step>
            </ol>
            <H>How to apply</H>
            <P>
              From the credit&apos;s detail page, you can:
            </P>
            <ul className="list-disc ml-5 space-y-1.5">
              <Bullet>
                <strong>Apply to bill</strong> — reduces balance on
                an open bill from the same vendor
              </Bullet>
              <Bullet>
                <strong>Receive refund</strong> — record cash received
                from vendor refunding you
              </Bullet>
              <Bullet>
                <strong>Hold</strong> — keep as open credit to apply
                later
              </Bullet>
            </ul>
          </>
        ),
      },
      {
        id: "vendor-payment",
        q: "How do I record a payment to a vendor?",
        a: (
          <>
            <P>
              Recording a vendor payment reduces AP and reduces the
              bank/cash account you paid from.
            </P>
            <H>From a bill (most common)</H>
            <ol className="list-decimal ml-5 space-y-1.5">
              <Step>
                Open the bill
              </Step>
              <Step>
                Click <strong>Record Payment</strong>
              </Step>
              <Step>
                Set amount, date, payment mode, paid-through account
              </Step>
              <Step>
                Save — bill flips to Partially Paid or Paid
              </Step>
            </ol>
            <H>Bulk allocation</H>
            <ol className="list-decimal ml-5 space-y-1.5">
              <Step>
                Open{" "}
                <L href="/purchases/payments-made/new">
                  Purchases → Payments Made → New
                </L>
              </Step>
              <Step>
                Pick the vendor — every open bill appears
              </Step>
              <Step>
                Enter the total payment, allocate across multiple
                bills (oldest-first auto-suggested)
              </Step>
              <Step>
                Save
              </Step>
            </ol>
            <Hint>
              For payments where you withhold TDS, see &ldquo;How do
              I record TDS on vendor payments?&rdquo; in the Taxes
              category.
            </Hint>
          </>
        ),
      },
      {
        id: "vendor-advance",
        q: "How do I record an advance payment to a vendor?",
        a: (
          <>
            <P>
              An advance payment is money paid to a vendor{" "}
              <strong>before</strong> they bill you — common for
              custom orders, deposits on services, or supplier
              security deposits.
            </P>
            <H>How to record</H>
            <ol className="list-decimal ml-5 space-y-1.5">
              <Step>
                Open{" "}
                <L href="/purchases/payments-made/new">
                  Purchases → Payments Made → New
                </L>
              </Step>
              <Step>
                Pick the vendor
              </Step>
              <Step>
                In the &ldquo;Payment Type&rdquo; field choose{" "}
                <strong>Vendor Advance</strong> (not &ldquo;Bill
                Payment&rdquo;)
              </Step>
              <Step>
                Set amount, date, payment mode, paid-through account
              </Step>
              <Step>
                Save — advance shows up on the vendor&apos;s ledger
                as an asset (Receivable from Vendor)
              </Step>
            </ol>
            <H>Applying the advance later</H>
            <P>
              When the vendor sends their actual bill, open the bill
              and click <strong>Apply Advance</strong>. Pick the
              advance to apply — the balance on the bill reduces
              accordingly.
            </P>
            <Hint>
              GST on advances: for advance payments above ₹50,000,
              GST may need to be paid at advance time and reversed
              when the actual bill arrives. Consult your CA on this.
            </Hint>
          </>
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
          <>
            <P>
              Items are your master list of goods or services you
              buy and sell. Setting them up well means faster line-item
              entry, correct GST application, and accurate stock
              tracking.
            </P>
            <H>Steps</H>
            <ol className="list-decimal ml-5 space-y-1.5">
              <Step>
                Open <L href="/items/new">Items → New</L>
              </Step>
              <Step>
                Set <strong>name</strong> and <strong>type</strong>{" "}
                (Goods or Services)
              </Step>
              <Step>
                <strong>Sales rate</strong>: default selling price
                (per invoice line)
              </Step>
              <Step>
                <strong>Purchase rate</strong>: default cost (per
                bill line)
              </Step>
              <Step>
                <strong>Tax rate</strong>: default GST applied (can
                override per transaction)
              </Step>
              <Step>
                <strong>HSN/SAC code</strong>: required for GST
                returns
              </Step>
              <Step>
                For Goods only: tick <strong>Track Inventory</strong>{" "}
                if you want stock managed, then set opening stock
                and the Inventory Asset account
              </Step>
              <Step>
                Save
              </Step>
            </ol>
            <H>Goods vs Services</H>
            <ul className="list-disc ml-5 space-y-1.5">
              <Bullet>
                <strong>Goods</strong>: physical items with stock,
                HSN code, optional batch/serial tracking
              </Bullet>
              <Bullet>
                <strong>Services</strong>: non-stock, SAC code, no
                inventory implications
              </Bullet>
            </ul>
          </>
        ),
      },
      {
        id: "track-stock",
        q: "How do I track stock for an item?",
        a: (
          <>
            <P>
              Inventory tracking turns Quikfinance into a stock book
              alongside the accounting ledger. Selling an item reduces
              stock; buying increases it.
            </P>
            <H>Enabling stock tracking</H>
            <ol className="list-decimal ml-5 space-y-1.5">
              <Step>
                On the item form, tick{" "}
                <strong>Track Inventory for this item</strong>
              </Step>
              <Step>
                Set <strong>opening stock</strong> (units on hand
                today) and <strong>opening cost</strong> (the unit
                cost for valuation)
              </Step>
              <Step>
                Pick the <strong>Inventory Asset Account</strong>{" "}
                (default: Inventory Asset on your CoA) and the{" "}
                <strong>COGS Account</strong> (default: Cost of
                Goods Sold)
              </Step>
              <Step>
                Save
              </Step>
            </ol>
            <H>What happens after</H>
            <ul className="list-disc ml-5 space-y-1.5">
              <Bullet>
                Invoice line referencing the item → stock reduces +
                COGS posted at cost
              </Bullet>
              <Bullet>
                Bill line referencing the item → stock increases at
                the new purchase price (weighted average)
              </Bullet>
              <Bullet>
                Quikfinance uses{" "}
                <strong>Weighted Average Cost</strong> for valuation
                (industry standard for SMBs)
              </Bullet>
            </ul>
            <H>View current stock</H>
            <P>
              <L href="/reports/stock-valuation">Stock Valuation</L>{" "}
              shows units × WAC for each item plus the total
              inventory asset value.
            </P>
            <Warning>
              You can&apos;t flip an existing transactional item from
              non-tracked → tracked without a stock adjustment to
              set opening balance.
            </Warning>
          </>
        ),
      },
      {
        id: "low-stock-alert",
        q: "How do I see items running low on stock?",
        a: (
          <>
            <P>
              Setting a reorder level per item lets Quikfinance flag
              items that need restocking before you run out.
            </P>
            <H>How</H>
            <ol className="list-decimal ml-5 space-y-1.5">
              <Step>
                On any inventory-tracked item, set the{" "}
                <strong>Reorder Level</strong> field (e.g. 20 units)
              </Step>
              <Step>
                When stock drops below this level, the item shows a
                red &ldquo;Low Stock&rdquo; pill on{" "}
                <L href="/items">Items list</L>
              </Step>
              <Step>
                Use the filter{" "}
                <strong>Show: Low Stock Only</strong> to see just
                items needing restock
              </Step>
            </ol>
            <H>Inventory Summary report</H>
            <P>
              The{" "}
              <L href="/reports/inventory-summary">
                Inventory Summary
              </L>{" "}
              report also lists low-stock items grouped by category
              and warehouse — useful for purchase-planning meetings.
            </P>
            <Hint>
              Auto-create-PO-on-low-stock is on the roadmap. For now,
              you&apos;ll manually create POs based on the report.
            </Hint>
          </>
        ),
      },
      {
        id: "hsn-sac-codes",
        q: "How do I set HSN/SAC codes on items?",
        a: (
          <>
            <P>
              HSN (Harmonised System Nomenclature) codes for goods
              and SAC codes for services are mandatory on every GST
              invoice. They determine the correct tax rate and
              appear on your GSTR-1 export.
            </P>
            <H>Per-item setup (recommended)</H>
            <ol className="list-decimal ml-5 space-y-1.5">
              <Step>
                Open the item form
              </Step>
              <Step>
                In the GST section, enter the HSN code (for Goods) or
                SAC code (for Services)
              </Step>
              <Step>
                Save — every future invoice line using this item
                auto-fills the HSN/SAC
              </Step>
            </ol>
            <H>Bulk update via CSV</H>
            <P>
              For populating HSN across many existing items, use the
              Import button on{" "}
              <L href="/items">Items list</L>. Export the current
              items, fill the HSN column, re-import.
            </P>
            <H>How HSN flows into returns</H>
            <P>
              The{" "}
              <L href="/reports/gstr1">GSTR-1</L> export groups
              invoice lines by HSN/SAC code as required by the GST
              portal. Items without an HSN show as blank — set them
              before filing.
            </P>
            <Hint>
              Turnover &lt; ₹5 cr: 4-digit HSN suffices.
              Turnover ≥ ₹5 cr: 6-digit HSN required.
            </Hint>
          </>
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
          <>
            <P>
              Every bank or cash account in Quikfinance is also a
              ledger account on your Chart of Accounts. Adding one
              here automatically creates the corresponding GL entry.
            </P>
            <H>Steps</H>
            <ol className="list-decimal ml-5 space-y-1.5">
              <Step>
                Open <L href="/banking/accounts">Banking → Accounts</L>
              </Step>
              <Step>
                Click <strong>Add Account</strong>
              </Step>
              <Step>
                Pick the account type:
                <ul className="list-disc ml-5 space-y-1 mt-1">
                  <Bullet>
                    <strong>Bank</strong> — current / savings /
                    fixed deposit
                  </Bullet>
                  <Bullet>
                    <strong>Credit Card</strong> — appears as a
                    liability rather than asset
                  </Bullet>
                  <Bullet>
                    <strong>Cash</strong> — petty cash / cash drawer
                  </Bullet>
                </ul>
              </Step>
              <Step>
                Fill in account number, IFSC, branch, holder name
                (for Bank). For Credit Card add the card number last
                4 digits + credit limit. For Cash just the name.
              </Step>
              <Step>
                Set <strong>opening balance</strong> as of the date
                you started using Quikfinance
              </Step>
              <Step>
                Save
              </Step>
            </ol>
            <Hint>
              Each bank account gets its own &ldquo;feed&rdquo; — a
              stream of transactions you can import via CSV. See the
              import question below.
            </Hint>
          </>
        ),
      },
      {
        id: "import-bank-csv",
        q: "How do I import a bank statement?",
        a: (
          <>
            <P>
              Importing bank statements automates the chore of
              entering individual bank transactions. Once imported,
              Quikfinance matches them against existing invoices/
              bills and lets you categorise the unmatched ones.
            </P>
            <H>Steps</H>
            <ol className="list-decimal ml-5 space-y-1.5">
              <Step>
                Download a CSV statement from your bank&apos;s portal
                (or use Excel and Save As CSV)
              </Step>
              <Step>
                In Quikfinance, open the bank account and click{" "}
                <strong>Import Statement</strong>
              </Step>
              <Step>
                Drag-drop the CSV. Quikfinance auto-detects columns:
                date, description, amount, balance. You can re-map
                if it guesses wrong.
              </Step>
              <Step>
                Preview the import. Skip any duplicate transactions
                Quikfinance flags.
              </Step>
              <Step>
                Confirm — each row is staged in the{" "}
                <strong>Categorise</strong> tab for review
              </Step>
            </ol>
            <H>What happens to duplicates</H>
            <P>
              Quikfinance fingerprints each transaction by (date,
              amount, description-prefix) and rejects repeats. If
              you re-import the same statement, no duplicates are
              created.
            </P>
            <Hint>
              Most banks support OFX/QFX too. CSV is simplest. If
              your bank doesn&apos;t expose CSV, copy-paste into
              Excel and save as CSV manually.
            </Hint>
          </>
        ),
      },
      {
        id: "reconcile",
        q: "How do I reconcile my bank account?",
        a: (
          <>
            <P>
              Reconciliation is the periodic confirmation that
              Quikfinance&apos;s view of your bank balance matches
              your bank statement. Catches data entry errors, missed
              transactions, and fraud.
            </P>
            <H>Steps (monthly recommended)</H>
            <ol className="list-decimal ml-5 space-y-1.5">
              <Step>
                Get your bank statement for the period (e.g.
                Apr 1 → Apr 30)
              </Step>
              <Step>
                Open the bank account in Quikfinance and click{" "}
                <strong>Reconcile</strong>
              </Step>
              <Step>
                Enter the <strong>Statement Date</strong> and the{" "}
                <strong>Closing Balance</strong> from your statement
              </Step>
              <Step>
                Tick off each Quikfinance transaction that appears on
                your bank statement
              </Step>
              <Step>
                Quikfinance shows a live difference between ticked
                items and statement balance
              </Step>
              <Step>
                When difference reaches <strong>zero</strong>, click{" "}
                <strong>Finish Reconciliation</strong>
              </Step>
            </ol>
            <H>Common reasons for a non-zero difference</H>
            <ul className="list-disc ml-5 space-y-1.5">
              <Bullet>
                Bank charges / SMS fees not entered in Quikfinance
              </Bullet>
              <Bullet>
                Cheque issued in Quikfinance but not yet cleared at
                bank
              </Bullet>
              <Bullet>
                Interest credited at bank but not recorded
              </Bullet>
              <Bullet>
                Data entry mistake (amount typo, wrong date)
              </Bullet>
            </ul>
          </>
        ),
      },
      {
        id: "bank-rule",
        q: "How do I set up a bank rule for auto-categorisation?",
        a: (
          <>
            <P>
              Bank rules are if-this-then-that recipes that
              automatically categorise imported bank transactions.
              They save hours per month if you have many recurring
              line items.
            </P>
            <H>Example rules</H>
            <ul className="list-disc ml-5 space-y-1.5">
              <Bullet>
                IF description contains &ldquo;Uber&rdquo;,
                THEN categorise to <em>Travel Expense</em>
              </Bullet>
              <Bullet>
                IF description contains &ldquo;Salary&rdquo; and
                amount &gt; 50000, THEN categorise to{" "}
                <em>Salaries &amp; Wages</em>
              </Bullet>
              <Bullet>
                IF description matches{" "}
                <em>/IGST*Refund*/i</em>, THEN categorise to{" "}
                <em>GST Refund Receivable</em>
              </Bullet>
            </ul>
            <H>How</H>
            <ol className="list-decimal ml-5 space-y-1.5">
              <Step>
                From the bank account page, click{" "}
                <strong>Manage Rules</strong>
              </Step>
              <Step>
                <strong>+ New Rule</strong>: pick conditions
                (description / amount / type) and the target account
              </Step>
              <Step>
                Save — future imports matching the rule auto-
                categorise; you only need to click Confirm to commit
              </Step>
            </ol>
            <Hint>
              Set the rule to apply <strong>retroactively</strong> on
              save to back-fill already-imported but uncategorised
              transactions.
            </Hint>
          </>
        ),
      },
      {
        id: "undo-reconciliation",
        q: "How do I undo a reconciliation?",
        a: (
          <>
            <P>
              If you discover an error after marking a period
              reconciled (e.g. ticked off a transaction that
              shouldn&apos;t have been), you can undo.
            </P>
            <H>How</H>
            <ol className="list-decimal ml-5 space-y-1.5">
              <Step>
                Open the bank account page
              </Step>
              <Step>
                Scroll to the{" "}
                <strong>Reconciliation History</strong> table
              </Step>
              <Step>
                Find the completed reconciliation and click{" "}
                <strong>Undo</strong>
              </Step>
              <Step>
                Confirm — every transaction in that batch returns to
                the unreconciled state and the reconciliation is
                removed from history
              </Step>
            </ol>
            <H>When to undo vs re-reconcile</H>
            <P>
              Undo only if the original reconciliation had real
              errors. If you just want to add a missing transaction
              to an already-reconciled period, record the transaction
              with its correct date — Quikfinance will surface it as
              a &ldquo;late-added&rdquo; item to include in your next
              reconciliation.
            </P>
            <Warning>
              Undoing a reconciliation that&apos;s already in your
              accountant&apos;s audit trail can create disputes.
              Document why you undid it (in the audit notes field).
            </Warning>
          </>
        ),
      },
      {
        id: "match-transaction",
        q: "How do I match an unmatched bank transaction?",
        a: (
          <>
            <P>
              When you import a bank statement, Quikfinance tries to
              auto-match each transaction against your open
              invoices/bills based on amount + counterparty heuristics.
              The Categorise tab lists each match with a confidence
              score.
            </P>
            <H>Steps</H>
            <ol className="list-decimal ml-5 space-y-1.5">
              <Step>
                Open the bank account&apos;s <strong>Categorise</strong>{" "}
                tab
              </Step>
              <Step>
                For each unmatched transaction Quikfinance shows
                likely matches on the right (e.g. an open invoice
                with the same amount)
              </Step>
              <Step>
                Click <strong>Match</strong> on the right one — the
                bank transaction is linked to the invoice and the
                invoice is marked Paid in one step
              </Step>
              <Step>
                If no good match is suggested, use{" "}
                <strong>Find &amp; Match</strong> to search by
                customer/vendor/amount/date
              </Step>
              <Step>
                If the transaction has no corresponding invoice/bill,
                use <strong>Categorise</strong> to post directly to a
                GL account (e.g. bank charges → Bank Charges expense)
              </Step>
            </ol>
            <Hint>
              Setting a Bank Rule (see above) auto-categorises future
              instances of the same pattern, so you only do the work
              once.
            </Hint>
          </>
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
              Most accounting events in Quikfinance happen via
              standard transactions (Invoices, Bills, Payments,
              etc.) which auto-post the right journal entries. Manual
              journals are for the edge cases that don&apos;t fit
              those forms.
            </P>
            <H>Common manual journal scenarios</H>
            <ul className="list-disc ml-5 space-y-1.5">
              <Bullet>
                <strong>Depreciation</strong> on fixed assets (monthly
                or year-end)
              </Bullet>
              <Bullet>
                <strong>Amortisation</strong> of prepaid expenses
                (e.g. annual insurance paid up-front, recognise
                monthly portion)
              </Bullet>
              <Bullet>
                <strong>Year-end accruals</strong> for expenses you
                incurred but haven&apos;t received a bill for yet
              </Bullet>
              <Bullet>
                <strong>Deferred revenue</strong> recognition (revenue
                received in advance, recognise as service is
                delivered)
              </Bullet>
              <Bullet>
                <strong>Owner&apos;s draw / capital contribution</strong>
                {" "}— money in/out from the business owner
              </Bullet>
              <Bullet>
                <strong>Inter-account transfers</strong> (e.g. moving
                money between two bank accounts)
              </Bullet>
              <Bullet>
                <strong>Corrections / reclassifications</strong> when
                you posted to the wrong account
              </Bullet>
            </ul>
            <H>How</H>
            <P>
              Open{" "}
              <L href="/accountant/manual-journals/new">
                Accountant → Manual Journals → New
              </L>
              . Pick a date, narration, and at least two lines (one
              debit, one credit). The form enforces that
              total debit = total credit.
            </P>
            <Warning>
              If your day-to-day looks like &ldquo;mostly manual
              journals&rdquo;, you&apos;re probably under-using the
              built-in transaction forms. Talk to support — there&apos;s
              often a more idiomatic way to capture what you&apos;re
              doing.
            </Warning>
          </>
        ),
      },
      {
        id: "depreciation-entry",
        q: "How do I post a depreciation entry?",
        a: (
          <>
            <P>
              Depreciation spreads the cost of a fixed asset (laptop,
              vehicle, machinery) across its useful life so each
              year&apos;s P&amp;L absorbs a slice rather than the
              full cost up-front.
            </P>
            <H>Setup (one-time)</H>
            <P>
              You need three GL accounts on your CoA:
            </P>
            <ul className="list-disc ml-5 space-y-1.5">
              <Bullet>
                <strong>Fixed Asset</strong> (Asset, e.g. &ldquo;Office
                Equipment&rdquo;) — holds the original cost
              </Bullet>
              <Bullet>
                <strong>Accumulated Depreciation</strong> (contra-
                Asset) — holds the cumulative depreciation written
                off
              </Bullet>
              <Bullet>
                <strong>Depreciation Expense</strong> (Expense) —
                this year&apos;s charge to P&amp;L
              </Bullet>
            </ul>
            <H>Posting the entry (monthly or yearly)</H>
            <ol className="list-decimal ml-5 space-y-1.5">
              <Step>
                Calculate the period&apos;s depreciation. For SLM:{" "}
                <code>(Cost − Residual) ÷ Useful Life (years) ÷ 12</code>{" "}
                per month.
              </Step>
              <Step>
                Open{" "}
                <L href="/accountant/manual-journals/new">
                  Manual Journals → New
                </L>
              </Step>
              <Step>
                Line 1: <strong>Debit Depreciation Expense</strong>{" "}
                for the period amount
              </Step>
              <Step>
                Line 2:{" "}
                <strong>Credit Accumulated Depreciation</strong> for
                the same amount
              </Step>
              <Step>
                Narration: e.g. &ldquo;Depreciation for April 2026 —
                Office Equipment&rdquo;
              </Step>
              <Step>
                Save
              </Step>
            </ol>
            <Hint>
              For repetitive monthly depreciation across many assets,
              consider a <strong>Recurring Manual Journal</strong> at{" "}
              <L href="/accountant/recurring-manual-journals/new">
                Accountant → Recurring Journals → New
              </L>{" "}
              — set it to monthly and it auto-fires.
            </Hint>
          </>
        ),
      },
      {
        id: "add-coa-account",
        q: "How do I add a new account to my Chart of Accounts?",
        a: (
          <>
            <P>
              Quikfinance ships with a sensible default CoA for Indian
              SMBs — most users never need to add new accounts. But
              for specialty needs (industry-specific income lines,
              custom expense categories), you can extend it.
            </P>
            <H>How</H>
            <ol className="list-decimal ml-5 space-y-1.5">
              <Step>
                Open{" "}
                <L href="/accountant/chart-of-accounts">
                  Accountant → Chart of Accounts
                </L>
              </Step>
              <Step>
                Click <strong>+ New</strong>
              </Step>
              <Step>
                Pick the <strong>Type</strong>: Asset / Liability /
                Equity / Income / Expense (see the &ldquo;Account
                Types&rdquo; FAQ for definitions)
              </Step>
              <Step>
                Pick the <strong>Sub-type</strong>: Cash / Bank /
                Accounts Receivable / Inventory / Fixed Asset / etc.
                — determines how the account behaves in reports
              </Step>
              <Step>
                Set the <strong>name</strong> (visible everywhere)
                and <strong>code</strong> (optional ledger code for
                accounting tooling)
              </Step>
              <Step>
                Save
              </Step>
            </ol>
            <H>Naming conventions</H>
            <ul className="list-disc ml-5 space-y-1.5">
              <Bullet>
                Be specific: &ldquo;Marketing — Google Ads&rdquo; is
                more useful than &ldquo;Marketing&rdquo;
              </Bullet>
              <Bullet>
                Don&apos;t create too many — 50-100 accounts is
                typical for an SMB; 200+ becomes hard to navigate
              </Bullet>
              <Bullet>
                Group related expenses under similar names so reports
                read well
              </Bullet>
            </ul>
            <Warning>
              Don&apos;t delete an account that has transactions —
              it&apos;ll error. Use the &ldquo;Deactivate&rdquo;
              toggle instead, which hides it from new transactions
              but preserves history.
            </Warning>
          </>
        ),
      },
      {
        id: "account-types",
        q: "What do the account types (Asset/Liability/Equity/Income/Expense) mean?",
        a: (
          <>
            <P>
              Every account on the CoA belongs to exactly one of
              five types. The type determines how the account behaves
              in reports and how its balance flows at year-end.
            </P>
            <H>Asset</H>
            <P>
              Things you <strong>own</strong> or that owe you money.
              Cash, bank balances, accounts receivable, inventory,
              equipment, vehicles, deposits paid.
            </P>
            <P>
              <em>Normal balance: Debit.</em> Appears on the Balance
              Sheet (left side).
            </P>
            <H>Liability</H>
            <P>
              Things you <strong>owe</strong>. Accounts payable,
              loans, GST payable, TDS payable, employee dues.
            </P>
            <P>
              <em>Normal balance: Credit.</em> Appears on the Balance
              Sheet (right side, top).
            </P>
            <H>Equity</H>
            <P>
              The owner&apos;s stake in the business. Capital
              contributions + retained earnings (cumulative profit
              kept inside the business).
            </P>
            <P>
              <em>Normal balance: Credit.</em> Appears on the Balance
              Sheet (right side, bottom).
            </P>
            <H>Income (Revenue)</H>
            <P>
              Money earned from selling goods/services + other
              earnings (interest, gains).
            </P>
            <P>
              <em>Normal balance: Credit.</em> Appears on the P&amp;L
              (top). Closes to Retained Earnings at year-end.
            </P>
            <H>Expense</H>
            <P>
              Costs incurred to run the business. Rent, salaries,
              utilities, depreciation, marketing.
            </P>
            <P>
              <em>Normal balance: Debit.</em> Appears on the P&amp;L
              (bottom). Closes to Retained Earnings at year-end.
            </P>
            <Hint>
              The accounting equation: <strong>Assets = Liabilities
              + Equity</strong>. Income and Expenses are temporary —
              they roll up into Equity (via Retained Earnings) at
              year-end.
            </Hint>
          </>
        ),
      },
      {
        id: "opening-balances",
        q: "How do I enter opening balances when migrating from another tool?",
        a: (
          <>
            <P>
              When you migrate from Tally, Excel, or another tool,
              you need to seed Quikfinance with the closing balance
              of every ledger account as of your migration date.
              Without this, your reports would only show
              transactions posted after migration.
            </P>
            <H>How</H>
            <ol className="list-decimal ml-5 space-y-1.5">
              <Step>
                From your old tool, run a <strong>Trial Balance</strong>{" "}
                as of the migration date (e.g. Mar 31)
              </Step>
              <Step>
                Open{" "}
                <L href="/settings/opening-balances">
                  Settings → Opening Balances
                </L>
              </Step>
              <Step>
                For each account on the Trial Balance, find or create
                the matching account in Quikfinance, and enter its
                debit or credit balance
              </Step>
              <Step>
                Quikfinance posts the offset to{" "}
                <strong>Opening Balance Equity</strong> — a
                temporary equity holding account
              </Step>
              <Step>
                Save
              </Step>
            </ol>
            <H>Clearing Opening Balance Equity</H>
            <P>
              The total in Opening Balance Equity should be zero if
              your Trial Balance was actually balanced. If not, work
              with your accountant to find the missing entry. Once
              you&apos;re live, the balance can stay there until
              year-end when your accountant clears it via a manual
              journal to retained earnings.
            </P>
            <Warning>
              Be especially careful with AR / AP opening balances.
              Most teams seed them as a <strong>summary</strong>{" "}
              line (one total AR per customer at migration date)
              rather than recreating individual open invoices —
              ask your accountant which approach they prefer.
            </Warning>
          </>
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
          <>
            <P>
              Your GSTIN (Goods &amp; Services Tax Identification
              Number) is the 15-digit ID you got from the GST portal.
              Quikfinance uses it everywhere GST applies — invoices,
              GSTR-1, GSTR-3B, e-invoicing.
            </P>
            <H>How</H>
            <ol className="list-decimal ml-5 space-y-1.5">
              <Step>
                Open <L href="/settings/profile">Settings → Profile</L>
              </Step>
              <Step>
                Scroll to the <strong>GST</strong> section
              </Step>
              <Step>
                Enter your <strong>GSTIN</strong> (15 chars, starts
                with the state code)
              </Step>
              <Step>
                Pick <strong>Composition</strong> if you&apos;re
                registered under the composition scheme; otherwise
                leave as Regular
              </Step>
              <Step>
                Confirm your <strong>Place of Supply</strong> (the
                state your business is in) — this drives the
                CGST+SGST vs IGST decision
              </Step>
              <Step>
                Save
              </Step>
            </ol>
            <Hint>
              Once GSTIN is set, every Invoice/Bill form auto-
              calculates GST based on this state vs the
              customer/vendor state. See &ldquo;IGST vs
              CGST/SGST&rdquo; FAQ for the logic.
            </Hint>
          </>
        ),
      },
      {
        id: "gstr1-export",
        q: "How do I export GSTR-1?",
        a: (
          <>
            <P>
              GSTR-1 is the monthly (or quarterly for small business)
              return that reports your <strong>outward
              supplies</strong> — every sale invoice you raised.
              Quikfinance generates it directly from your invoice
              data.
            </P>
            <H>Steps</H>
            <ol className="list-decimal ml-5 space-y-1.5">
              <Step>
                Open <L href="/reports/gstr1">Reports → GSTR-1</L>
              </Step>
              <Step>
                Pick the return period (month or quarter)
              </Step>
              <Step>
                Review each section: B2B / B2C Large / B2C Small /
                Credit Notes / Export / Nil-Rated / HSN Summary
              </Step>
              <Step>
                Click <strong>Export → JSON</strong> for direct
                upload to the GST portal, or{" "}
                <strong>Export → XLSX</strong> for accountant review
              </Step>
            </ol>
            <H>Uploading to the GST portal</H>
            <ol className="list-decimal ml-5 space-y-1.5">
              <Step>
                Log into <em>gst.gov.in</em>
              </Step>
              <Step>
                Navigate to Returns Dashboard → Prepare Online →
                Initiate Filing → GSTR-1
              </Step>
              <Step>
                Click <strong>Import JSON</strong> and drop the
                Quikfinance-generated file
              </Step>
              <Step>
                Verify summary, click Submit, then File with DSC/EVC
              </Step>
            </ol>
            <Warning>
              Lock down your books before generating the return —
              any invoice edit after filing creates compliance
              issues. Use the &ldquo;Lock Period&rdquo; feature once
              available, or set roles to read-only on closed periods.
            </Warning>
          </>
        ),
      },
      {
        id: "gstr3b-filing",
        q: "How do I file GSTR-3B?",
        a: (
          <>
            <P>
              GSTR-3B is the monthly self-declaration of outward
              supplies, inward supplies, eligible ITC, and tax
              payable. It&apos;s how you actually pay your monthly
              GST liability.
            </P>
            <H>What it contains</H>
            <ul className="list-disc ml-5 space-y-1.5">
              <Bullet>Section 3.1: Outward supplies + RCM</Bullet>
              <Bullet>Section 4: Eligible ITC + reversal</Bullet>
              <Bullet>Section 5: Exempt, nil-rated, non-GST inward supplies</Bullet>
              <Bullet>Section 6: Payment of tax</Bullet>
            </ul>
            <H>How in Quikfinance</H>
            <ol className="list-decimal ml-5 space-y-1.5">
              <Step>
                Open{" "}
                <L href="/reports/gstr-3b">Reports → GSTR-3B</L>{" "}
                (currently rolling out)
              </Step>
              <Step>
                Pick the month
              </Step>
              <Step>
                The report computes each section from your invoices
                and bills automatically — review each carefully
              </Step>
              <Step>
                Export to JSON for portal upload, or XLSX for
                accountant review
              </Step>
            </ol>
            <H>Payment timeline</H>
            <ul className="list-disc ml-5 space-y-1.5">
              <Bullet>Turnover &gt; ₹5 cr: file by 20th of next month</Bullet>
              <Bullet>Turnover ≤ ₹5 cr: 22nd or 24th depending on state</Bullet>
            </ul>
            <Warning>
              Late filing attracts ₹50/day late fee (₹20/day for
              nil returns) plus 18% p.a. interest on unpaid tax.
            </Warning>
          </>
        ),
      },
      {
        id: "igst-vs-cgst-sgst",
        q: "How does Quikfinance calculate CGST+SGST vs IGST?",
        a: (
          <>
            <P>
              GST splits depending on whether the transaction is
              within your state (intra-state) or across states
              (inter-state). Quikfinance applies the right split
              automatically based on the customer/vendor&apos;s
              billing state.
            </P>
            <H>Intra-state (same state)</H>
            <P>
              Your org and the customer/vendor are in the same state
              → <strong>CGST + SGST</strong> split (e.g. for 18% GST:
              9% CGST + 9% SGST).
            </P>
            <H>Inter-state (different states)</H>
            <P>
              Different states → <strong>IGST</strong> single line at
              the full rate (e.g. 18% IGST).
            </P>
            <H>How Quikfinance decides</H>
            <ol className="list-decimal ml-5 space-y-1.5">
              <Step>
                Reads your <strong>Place of Supply</strong> from
                Settings → Profile
              </Step>
              <Step>
                Reads the customer&apos;s <strong>Billing State</strong>{" "}
                from their record
              </Step>
              <Step>
                Same → CGST+SGST. Different → IGST.
              </Step>
            </ol>
            <H>Overriding per invoice</H>
            <P>
              On the invoice line you can click the GST cell and
              pick a different split if your specific transaction has
              an exception (e.g. export, SEZ, deemed export).
            </P>
            <Hint>
              For export invoices, set the customer&apos;s state to{" "}
              <strong>Other Country</strong> — Quikfinance treats
              this as zero-rated and reports it under the export
              section of GSTR-1.
            </Hint>
          </>
        ),
      },
      {
        id: "composition-vs-regular",
        q: "What's the difference between Composition and Regular GST registration?",
        a: (
          <>
            <P>
              Composition is a simplified GST scheme for small
              businesses — easier compliance but with limits.
            </P>
            <H>Regular (default)</H>
            <ul className="list-disc ml-5 space-y-1.5">
              <Bullet>
                Charge GST on every sale (5% / 12% / 18% / 28% by
                item HSN)
              </Bullet>
              <Bullet>
                Claim Input Tax Credit on purchases
              </Bullet>
              <Bullet>
                File <strong>GSTR-1 monthly/quarterly</strong> +{" "}
                <strong>GSTR-3B monthly</strong>
              </Bullet>
              <Bullet>
                Can sell anywhere in India / abroad
              </Bullet>
            </ul>
            <H>Composition</H>
            <ul className="list-disc ml-5 space-y-1.5">
              <Bullet>
                Pay flat rate on turnover (1% for traders, 5% for
                restaurants, 6% for service providers)
              </Bullet>
              <Bullet>
                <strong>Can&apos;t charge GST to customers</strong>{" "}
                (no GST shown on invoice)
              </Bullet>
              <Bullet>
                <strong>Can&apos;t claim Input Tax Credit</strong>
              </Bullet>
              <Bullet>
                File <strong>CMP-08 quarterly</strong> instead of
                GSTR-1/3B
              </Bullet>
              <Bullet>
                Can only sell within your state (intra-state) — no
                inter-state sales allowed
              </Bullet>
              <Bullet>
                Turnover limit: ₹1.5 crore (₹75 lakh in NE/hilly
                states)
              </Bullet>
            </ul>
            <H>Switching in Quikfinance</H>
            <P>
              Open <L href="/settings/profile">Settings → Profile</L>{" "}
              → GST section → toggle Composition. The toggle hides
              ITC fields, hides GST columns on invoices, and switches
              the return format.
            </P>
            <Warning>
              Composition is a one-way switch each year. Once chosen
              for an FY, you generally can&apos;t flip back to
              Regular mid-year. Talk to your CA.
            </Warning>
          </>
        ),
      },
      {
        id: "tax-rates",
        q: "How do I add a new tax rate?",
        a: (
          <>
            <P>
              Quikfinance ships with the standard Indian GST rates
              (0%, 5%, 12%, 18%, 28%). You can add custom rates for
              edge cases like reverse-charge or compensation cess.
            </P>
            <H>How</H>
            <ol className="list-decimal ml-5 space-y-1.5">
              <Step>
                Open <L href="/settings/taxes">Settings → Taxes</L>
              </Step>
              <Step>
                Click <strong>+ Add Tax</strong>
              </Step>
              <Step>
                Set name (e.g. &ldquo;GST 5%&rdquo;), rate (5),
                type (GST / IGST / Cess / Other)
              </Step>
              <Step>
                Save — the new rate appears in the GST dropdown on
                every invoice/bill line
              </Step>
            </ol>
            <H>Compound taxes</H>
            <P>
              For state-specific cesses (e.g. compensation cess on
              luxury items), create a separate Cess-type tax and
              both will calculate on the same line item.
            </P>
          </>
        ),
      },
      {
        id: "tds-on-customer-payment",
        q: "How do I record TDS deduction on customer payments?",
        a: (
          <>
            <P>
              When a customer pays you, they may deduct Tax at Source
              (TDS) and remit it to the government on your behalf.
              You collect the net amount but report the gross +
              claim the TDS credit at year-end.
            </P>
            <H>How to record</H>
            <ol className="list-decimal ml-5 space-y-1.5">
              <Step>
                Open the customer&apos;s payment form (either{" "}
                <L href="/sales/payments-received/new">
                  Payments Received → New
                </L>{" "}
                or via the invoice&apos;s Record Payment)
              </Step>
              <Step>
                Below the amount field, click{" "}
                <strong>Add TDS</strong>
              </Step>
              <Step>
                Pick the <strong>Section</strong>: 194C (contracts),
                194J (professional services), 194Q (purchase of
                goods), etc.
              </Step>
              <Step>
                Quikfinance applies the right rate (e.g. 10% for
                194J) and computes the TDS amount automatically
              </Step>
              <Step>
                Confirm the amount actually received (net of TDS) +
                the TDS amount, and save
              </Step>
            </ol>
            <H>What gets posted</H>
            <ul className="list-disc ml-5 space-y-1.5">
              <Bullet>
                <strong>Bank Account</strong>: debit by net amount
                received
              </Bullet>
              <Bullet>
                <strong>TDS Receivable</strong>: debit by TDS amount
                (an asset you&apos;ll claim at year-end)
              </Bullet>
              <Bullet>
                <strong>Customer AR</strong>: credit by total
                (invoice fully settled)
              </Bullet>
            </ul>
            <Hint>
              At year-end, ask each customer for their TDS Certificate
              (Form 16A). Match it against the TDS Receivable
              balance — should reconcile.
            </Hint>
          </>
        ),
      },
      {
        id: "tds-on-vendor-payment",
        q: "How do I record TDS deduction on vendor payments?",
        a: (
          <>
            <P>
              When you pay a vendor for services (especially
              professional fees, contracts, rent), you may have to
              withhold TDS and pay it to the government directly.
              The vendor receives the net amount.
            </P>
            <H>How to record</H>
            <ol className="list-decimal ml-5 space-y-1.5">
              <Step>
                Open the payment form at{" "}
                <L href="/purchases/payments-made/new">
                  Payments Made → New
                </L>
              </Step>
              <Step>
                Pick the vendor + the bill to pay
              </Step>
              <Step>
                Expand the <strong>TDS Deduction</strong> section
              </Step>
              <Step>
                Pick the Section, confirm the rate, and Quikfinance
                computes the TDS amount
              </Step>
              <Step>
                Save — the cash leaving your bank is{" "}
                <em>bill amount minus TDS</em>; the TDS portion is
                booked to <strong>TDS Payable</strong>
              </Step>
            </ol>
            <H>Paying TDS to the government</H>
            <P>
              Each quarter, Quikfinance shows your accumulated TDS
              Payable on the{" "}
              <L href="/reports/tds-summary">TDS Summary</L> report.
              Pay via Challan ITNS-281 on the income tax portal and
              record the bank payment against the TDS Payable
              liability to clear it.
            </P>
            <H>Issuing TDS certificates</H>
            <P>
              File quarterly TDS returns (Form 26Q for non-salary
              TDS), then issue Form 16A to each vendor showing the
              TDS withheld. Quikfinance generates Form 16A drafts —
              support@quikfinance.in for now.
            </P>
            <Warning>
              Late TDS payment attracts heavy interest (1.5% per
              month) and penalties. Set a calendar reminder for the
              7th of each month.
            </Warning>
          </>
        ),
      },
      {
        id: "hsn-on-returns",
        q: "How do HSN/SAC codes flow into GST returns?",
        a: (
          <>
            <P>
              The GST portal expects each line of your GSTR-1 to be
              grouped by HSN/SAC code. Quikfinance auto-aggregates
              invoice lines by HSN when generating the return.
            </P>
            <H>Setting HSN on items</H>
            <P>
              See &ldquo;How do I set HSN/SAC codes on items?&rdquo;
              in the Items &amp; Inventory category. Once an item
              has an HSN, every invoice line using that item picks
              it up automatically.
            </P>
            <H>HSN summary on GSTR-1</H>
            <P>
              Open <L href="/reports/gstr1">Reports → GSTR-1</L> for
              a return period and scroll to the{" "}
              <strong>HSN Summary</strong> section. It shows for
              each HSN code:
            </P>
            <ul className="list-disc ml-5 space-y-1.5">
              <Bullet>Total taxable value</Bullet>
              <Bullet>Total tax (IGST / CGST / SGST / Cess)</Bullet>
              <Bullet>Total quantity (for goods)</Bullet>
            </ul>
            <H>Required HSN digits</H>
            <ul className="list-disc ml-5 space-y-1.5">
              <Bullet>
                Turnover &lt; ₹5 cr in previous FY: 4-digit HSN
              </Bullet>
              <Bullet>
                Turnover ≥ ₹5 cr: 6-digit HSN
              </Bullet>
              <Bullet>
                B2C invoices: 4-digit minimum even for small
                businesses (from April 2025)
              </Bullet>
            </ul>
          </>
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
          <>
            <P>
              Multi-currency lets you bill customers and receive bills
              in non-INR currencies (USD, EUR, GBP, AED, etc.). It&apos;s
              essential if you have international clients or vendors.
            </P>
            <H>How</H>
            <ol className="list-decimal ml-5 space-y-1.5">
              <Step>
                Open <L href="/settings/currencies">Settings → Currencies</L>
              </Step>
              <Step>
                Click <strong>Enable Multi-currency</strong>
              </Step>
              <Step>
                Confirm your <strong>Base Currency</strong> (defaults
                to INR — almost always correct for Indian businesses)
              </Step>
              <Step>
                Add the foreign currencies you transact in (USD,
                EUR, etc.) — Quikfinance pulls daily reference rates
                from RBI by default
              </Step>
            </ol>
            <H>What changes</H>
            <ul className="list-disc ml-5 space-y-1.5">
              <Bullet>
                Customer/Vendor forms get a Currency picker — set it
                once per contact
              </Bullet>
              <Bullet>
                Invoice/Bill forms inherit the customer/vendor&apos;s
                currency
              </Bullet>
              <Bullet>
                Reports always show base-currency totals (INR), with
                foreign currency amounts shown alongside
              </Bullet>
            </ul>
            <Warning>
              Once enabled, multi-currency can&apos;t be disabled (would
              orphan existing foreign-currency transactions). Pick the
              right base currency before enabling.
            </Warning>
          </>
        ),
      },
      {
        id: "exchange-rate",
        q: "How do I update an exchange rate?",
        a: (
          <>
            <P>
              Exchange rates can be auto-fetched from a feed or
              manually entered. Quikfinance uses the most recent rate
              at or before each transaction date.
            </P>
            <H>Auto rates (default)</H>
            <P>
              Quikfinance fetches daily RBI reference rates for major
              currencies (USD, EUR, GBP, JPY, etc.). No action needed
              — you just transact and the rate applies.
            </P>
            <H>Manual override</H>
            <ol className="list-decimal ml-5 space-y-1.5">
              <Step>
                Open <L href="/settings/currencies">Settings → Currencies</L>
              </Step>
              <Step>
                Click on the currency (e.g. USD)
              </Step>
              <Step>
                Click <strong>+ Add Rate</strong>
              </Step>
              <Step>
                Enter the effective date and rate (e.g.{" "}
                <code>1 USD = 84.50 INR</code>)
              </Step>
              <Step>
                Save — Quikfinance uses this rate for any transaction
                dated on or after the effective date, until the next
                rate is set
              </Step>
            </ol>
            <H>Per-transaction override</H>
            <P>
              When creating a foreign-currency invoice or bill, the
              exchange rate field is editable — you can override the
              auto-fetched rate for that single transaction (useful
              for forward contracts or special arrangements).
            </P>
          </>
        ),
      },
      {
        id: "foreign-currency-transaction",
        q: "How do I record a transaction in a foreign currency?",
        a: (
          <>
            <P>
              Once multi-currency is enabled, any transaction with a
              foreign-currency customer/vendor automatically posts
              both the foreign amount and the INR equivalent.
            </P>
            <H>How (invoice example)</H>
            <ol className="list-decimal ml-5 space-y-1.5">
              <Step>
                Open <L href="/sales/invoices/new">Sales → Invoices → New</L>
              </Step>
              <Step>
                Pick a customer whose currency is non-base (e.g. USD)
              </Step>
              <Step>
                The form switches to USD: amounts entered are in USD
              </Step>
              <Step>
                The exchange rate appears as a banner (e.g.{" "}
                <code>1 USD = 84.50 INR</code>) — editable
              </Step>
              <Step>
                Add lines, save. Quikfinance posts:
                <ul className="list-disc ml-5 space-y-1 mt-1">
                  <Bullet>USD amount on the invoice + AR ledger</Bullet>
                  <Bullet>INR equivalent on the GL + P&amp;L</Bullet>
                  <Bullet>Exchange rate snapshot for audit</Bullet>
                </ul>
              </Step>
            </ol>
            <H>Realised vs unrealised FX gain/loss</H>
            <P>
              When a foreign customer pays you later, the exchange
              rate is probably different — Quikfinance posts the
              FX gain/loss automatically to the &ldquo;Foreign
              Exchange Gain/Loss&rdquo; account.
            </P>
            <P>
              For open balances at period-end, use{" "}
              <L href="/accountant/currency-adjustments">
                Accountant → Currency Adjustments
              </L>{" "}
              to revalue them at the period-end rate — the offset
              posts to &ldquo;Unrealised FX Gain/Loss&rdquo;.
            </P>
            <Hint>
              For accountants: Quikfinance uses the
              transaction-date spot rate for posting and revalues to
              period-end rate at year-end. Matches Ind AS 21 / IAS
              21 treatment.
            </Hint>
          </>
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
          <>
            <P>
              The Compare feature lets you put two periods side by
              side on any of the 3 main statements — useful for
              spotting trends, justifying expenses, or showing
              growth to investors.
            </P>
            <H>How</H>
            <ol className="list-decimal ml-5 space-y-1.5">
              <Step>
                Open the report (P&amp;L / Balance Sheet / Cash Flow)
              </Step>
              <Step>
                Click <strong>Customize</strong> in the toolbar
              </Step>
              <Step>
                In the <strong>Compare With</strong> dropdown, pick:
                <ul className="list-disc ml-5 space-y-1 mt-1">
                  <Bullet>
                    <strong>Previous Period</strong> — last 30 days
                    vs the 30 days before
                  </Bullet>
                  <Bullet>
                    <strong>Previous Year</strong> — same period 12
                    months back
                  </Bullet>
                </ul>
              </Step>
              <Step>
                Click <strong>Run Report</strong>
              </Step>
              <Step>
                The table renders 4 columns: Label / Current /
                Previous / % Change
              </Step>
            </ol>
            <H>Export with compare</H>
            <P>
              CSV exports include the compare columns. XLSX and PDF
              exports are getting compare-column support in an
              upcoming release.
            </P>
            <Hint>
              For finer control over the comparison period (e.g.
              compare Q1 2026 vs Q1 2025), use the Date Range pill
              first, then Customize the Compare With dropdown.
            </Hint>
          </>
        ),
      },
      {
        id: "schedule-report-email",
        q: "How do I schedule a report by email?",
        a: (
          <>
            <P>
              Scheduling a report sets up an automatic email of the
              same report to one or more recipients on a recurring
              cadence — perfect for monthly board reports, weekly
              investor updates, or daily cash-flow checks.
            </P>
            <H>How</H>
            <ol className="list-decimal ml-5 space-y-1.5">
              <Step>
                Open the report (P&amp;L / Balance Sheet / Cash Flow)
              </Step>
              <Step>
                Click the <strong>Schedule</strong> icon in the
                toolbar
              </Step>
              <Step>
                Set the <strong>cadence</strong>: Daily / Weekly /
                Monthly (with day of week / day of month)
              </Step>
              <Step>
                Pick the <strong>format</strong>: PDF / XLSX / CSV
              </Step>
              <Step>
                Enter <strong>recipient emails</strong> (comma-
                separated, no limit)
              </Step>
              <Step>
                Optionally: customise the email subject and body
              </Step>
              <Step>
                Save
              </Step>
            </ol>
            <H>What happens</H>
            <P>
              Quikfinance fires a cron at 03:30 UTC daily and emails
              every scheduled report whose next-fire-time has passed.
              Each run is logged so you can audit delivery (and
              re-send if a recipient missed it).
            </P>
            <H>Managing schedules</H>
            <P>
              From the same Schedule drawer you can{" "}
              <strong>Pause</strong> (temporarily stop sending),{" "}
              <strong>Resume</strong>, <strong>Edit</strong>, or{" "}
              <strong>Delete</strong> any active schedule.
            </P>
            <Hint>
              Requires <code>RESEND_API_KEY</code> in your prod env.
              If not set, the worker logs and gracefully skips
              (no errors).
            </Hint>
          </>
        ),
      },
      {
        id: "report-basis",
        q: "What's the difference between Accrual and Cash basis?",
        a: (
          <>
            <P>
              Accrual and Cash are the two fundamental ways to
              recognise income and expense — they give different
              answers about &ldquo;how is the business doing?&rdquo;
              for the same period.
            </P>
            <H>Accrual basis (default)</H>
            <P>
              Recognises <strong>revenue when invoiced</strong> (even
              if not yet paid) and <strong>expense when billed</strong>{" "}
              (even if not yet paid).
            </P>
            <ul className="list-disc ml-5 space-y-1.5">
              <Bullet>
                Required for Companies Act audit
              </Bullet>
              <Bullet>
                More accurate &ldquo;true&rdquo; profitability
                picture
              </Bullet>
              <Bullet>
                Matches expenses to the periods they relate to
              </Bullet>
            </ul>
            <H>Cash basis</H>
            <P>
              Recognises <strong>revenue when money is actually
              received</strong> and{" "}
              <strong>expense when money actually leaves</strong>.
            </P>
            <ul className="list-disc ml-5 space-y-1.5">
              <Bullet>
                Simpler — what hit your bank is the answer
              </Bullet>
              <Bullet>
                Allowed for small proprietorships under presumptive
                taxation
              </Bullet>
              <Bullet>
                Hides AR/AP impact on profitability
              </Bullet>
            </ul>
            <H>Toggling in Quikfinance</H>
            <P>
              Every report has a <strong>Report Basis</strong> pill
              in the filter strip — toggle between Accrual and Cash.
              The data refreshes; same report, different view.
            </P>
            <Warning>
              Don&apos;t mix bases across reports for the same
              audience. Pick one (typically Accrual) for the
              statutory pack and stick with it.
            </Warning>
          </>
        ),
      },
      {
        id: "customize-columns",
        q: "How do I show or hide columns on a report?",
        a: (
          <>
            <P>
              You can tailor each report to show only the columns
              you care about — useful for cleaner exports or focused
              reviews.
            </P>
            <H>How</H>
            <ol className="list-decimal ml-5 space-y-1.5">
              <Step>
                Open the report
              </Step>
              <Step>
                Click <strong>Customize</strong> in the toolbar
              </Step>
              <Step>
                Switch to the <strong>Show / Hide Columns</strong>{" "}
                tab
              </Step>
              <Step>
                Tick or untick the available columns (each report
                has its own list)
              </Step>
              <Step>
                Click <strong>Run Report</strong>
              </Step>
            </ol>
            <P>
              Your preferences are remembered per user per report —
              next time you open the same report it&apos;ll show the
              same columns.
            </P>
          </>
        ),
      },
      {
        id: "save-custom-report",
        q: "Can I save a customised report layout?",
        a: (
          <>
            <P>
              Saving custom reports as named views (e.g. &ldquo;Board
              P&amp;L&rdquo;, &ldquo;Internal Mgmt View&rdquo;) is on
              the roadmap.
            </P>
            <H>Workaround today</H>
            <P>
              The current Customize panel applies via URL parameters
              — so you can bookmark the resulting URL to recall the
              same view. Example: a P&amp;L compared to previous year
              for FY 2025-26 has a stable URL like{" "}
              <code>/reports/profit-loss?from=...&amp;to=...&amp;compare=previous-year</code>.
            </P>
            <P>
              Stash these bookmarks in a browser folder labelled
              &ldquo;QF reports&rdquo; for quick access.
            </P>
          </>
        ),
      },
      {
        id: "schedule-iii",
        q: "How do I generate Schedule III (Companies Act) statements?",
        a: (
          <>
            <P>
              Schedule III of the Companies Act 2013 mandates a
              specific format for P&amp;L and Balance Sheet for
              companies filing with MCA. Quikfinance ships both
              statements in that format out of the box.
            </P>
            <H>Two reports</H>
            <ul className="list-disc ml-5 space-y-1.5">
              <Bullet>
                <L href="/reports/profit-loss-schedule-iii">
                  Profit &amp; Loss (Schedule III)
                </L>{" "}
                — 15-section roman-numeralled layout (I. Revenue
                from Operations, II. Other Income, ... XV. Profit/
                Loss for the period)
              </Bullet>
              <Bullet>
                <L href="/reports/balance-sheet-schedule-iii">
                  Balance Sheet (Schedule III)
                </L>{" "}
                — two-pane Equity &amp; Liabilities / Assets
                comparative layout
              </Bullet>
            </ul>
            <H>How they work</H>
            <P>
              Both auto-map your Chart of Accounts to the Schedule
              III buckets using account sub-type + name heuristics.
              You don&apos;t need to manually classify each account.
            </P>
            <H>For year-end filing</H>
            <ol className="list-decimal ml-5 space-y-1.5">
              <Step>
                On the P&amp;L Schedule III page, set the date range
                to your FY (Apr 1 → Mar 31)
              </Step>
              <Step>
                On the BS Schedule III page, set As-of to Mar 31
              </Step>
              <Step>
                Click Export → PDF (for filing) or XLSX (for your
                accountant to copy into the MCA filing tool)
              </Step>
            </ol>
            <Hint>
              Both reports include the comparative prior-year column
              automatically as required by Schedule III.
            </Hint>
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
          <>
            <P>
              A budget sets target amounts per account per period —
              monthly / quarterly / yearly. As actual transactions
              post, Quikfinance compares actuals to budget so you
              can see where you&apos;re over or under.
            </P>
            <H>How</H>
            <ol className="list-decimal ml-5 space-y-1.5">
              <Step>
                Open <L href="/accountant/budgets/new">
                  Accountant → Budgets → New
                </L>
              </Step>
              <Step>
                Pick the <strong>Fiscal Year</strong> (defaults to
                current FY)
              </Step>
              <Step>
                Pick the <strong>Budget Period</strong>: Monthly (12
                buckets), Quarterly (4 buckets), or Yearly (1 bucket)
              </Step>
              <Step>
                Pick which accounts to budget for. Standard:
                <ul className="list-disc ml-5 space-y-1 mt-1">
                  <Bullet>Income accounts (your revenue targets)</Bullet>
                  <Bullet>Expense accounts (your cost ceilings)</Bullet>
                </ul>
                Optionally also: Asset / Liability / Equity accounts
                if relevant.
              </Step>
              <Step>
                Click <strong>Create Budget</strong>
              </Step>
              <Step>
                You land on the budget&apos;s grid editor: rows =
                accounts, columns = period buckets. Enter target
                amounts per cell.
              </Step>
              <Step>
                Click <strong>Save</strong> when done
              </Step>
            </ol>
          </>
        ),
      },
      {
        id: "budget-vs-actuals",
        q: "How do I compare budgeted vs actual amounts?",
        a: (
          <>
            <P>
              On the budget detail page, the Budget vs Actuals card
              auto-computes actuals from your posted journal entries
              for the FY and shows variance per account per period.
            </P>
            <H>How to read it</H>
            <ul className="list-disc ml-5 space-y-1.5">
              <Bullet>
                <strong>Budget</strong> column: the target you set
              </Bullet>
              <Bullet>
                <strong>Actual</strong> column: posted transactions
                aggregated to date
              </Bullet>
              <Bullet>
                <strong>Variance</strong>: Actual − Budget. Positive
                = over budget; Negative = under budget. Income
                accounts are inverse: positive variance = beat
                target.
              </Bullet>
              <Bullet>
                <strong>% of Budget</strong>: how far through the
                budget you are
              </Bullet>
            </ul>
            <Hint>
              Schedule a monthly P&amp;L vs Budget email to your
              senior team so the variance conversation happens
              regularly, not just at year-end.
            </Hint>
          </>
        ),
      },
      {
        id: "reporting-tags",
        q: "How do I set up reporting tags (cost centres)?",
        a: (
          <>
            <P>
              Reporting tags (a.k.a. dimensions, cost centres,
              classes) let you slice your books by{" "}
              <strong>orthogonal axes</strong> independent of the
              account structure — for example by Department,
              Project, Location, or Business Unit.
            </P>
            <H>Setup</H>
            <ol className="list-decimal ml-5 space-y-1.5">
              <Step>
                Open <L href="/settings/reporting-tags">
                  Settings → Reporting Tags
                </L>
              </Step>
              <Step>
                Click <strong>+ New Tag Category</strong>
              </Step>
              <Step>
                Name the category (e.g. &ldquo;Department&rdquo;) and
                its allowed values (Sales / Engineering / Operations
                / HR)
              </Step>
              <Step>
                Save
              </Step>
            </ol>
            <H>Tagging transactions</H>
            <P>
              On every Invoice line, Bill line, Expense, or Manual
              Journal line you now see a Reporting Tag picker — assign
              the relevant Department to each line.
            </P>
            <H>Reports by tag</H>
            <P>
              On any report, use the &ldquo;Group By&rdquo; or
              &ldquo;Filter By&rdquo; controls (in Customize) to slice
              by tag. Example: P&amp;L grouped by Department → 4
              columns, one per department + total.
            </P>
            <Hint>
              Tags are far more flexible than creating
              department-specific GL accounts. You can change tag
              values without touching the CoA, and a single
              transaction can be tagged with multiple dimensions
              (Department AND Project AND Location).
            </Hint>
          </>
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
              Many Indian businesses prefix invoice numbers with the
              fiscal year for compliance and audit clarity (e.g.{" "}
              <code>INV-25-0001</code> for FY 2025-26,{" "}
              <code>INV-26-0001</code> for FY 2026-27). To roll over
              on April 1:
            </P>
            <H>Steps</H>
            <ol className="list-decimal ml-5 space-y-1.5">
              <Step>
                Open{" "}
                <L href="/settings/number-series">
                  Settings → Number Series
                </L>
              </Step>
              <Step>
                Find the <strong>Invoice</strong> series and click{" "}
                <em>Edit</em>
              </Step>
              <Step>
                Update the prefix (e.g. <code>INV-26-</code>) and
                the next-number sequence (reset to 0001 or carry
                forward — your choice)
              </Step>
              <Step>
                Save
              </Step>
            </ol>
            <Warning>
              Once you save the new prefix, all new invoices use it.
              Existing invoices keep their old numbers — that&apos;s
              correct for audit history.
            </Warning>
            <Hint>
              The same flow applies to Bills, Credit Notes, Vendor
              Credits, Payments, and Manual Journals — each has its
              own series you can configure independently.
            </Hint>
          </>
        ),
      },
      {
        id: "outstanding-customer-amounts",
        q: "How do I find the outstanding amount that customers owe me?",
        a: (
          <>
            <P>
              At year-end you typically want two views of open AR:
              the aggregate (how much total is owed) and the
              per-customer breakdown (who specifically owes what,
              for how long).
            </P>
            <H>AR Aging Summary</H>
            <P>
              <L href="/reports/ar-aging">AR Aging Summary</L>{" "}
              shows every open invoice grouped into age buckets
              (0-30 / 31-60 / 61-90 / 90+ days) per customer. The
              90+ bucket is your collection priority.
            </P>
            <H>Per-customer statement</H>
            <P>
              In <L href="/sales/customers">Sales → Customers</L>,
              click any customer to see their Statement tab with a
              full transaction history and current open balance.
              Useful for sending statements to customers asking
              &ldquo;how much do I owe you?&rdquo;.
            </P>
            <Hint>
              For year-end, set the &ldquo;As of&rdquo; date on AR
              Aging to your FY end (Mar 31 in India). Match the
              total against your Balance Sheet&apos;s Accounts
              Receivable balance — they should be identical.
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
              Inventory value is one of the biggest year-end numbers
              for any goods-trading business — both for your Balance
              Sheet and for income tax. Quikfinance gives you a
              point-in-time snapshot per item.
            </P>
            <H>How</H>
            <ol className="list-decimal ml-5 space-y-1.5">
              <Step>
                Open <L href="/reports/stock-valuation">
                  Reports → Stock Valuation
                </L>
              </Step>
              <Step>
                Set the &ldquo;As of&rdquo; date to Mar 31 (your FY
                end)
              </Step>
              <Step>
                The report shows each tracked item with: opening
                stock, in (purchases), out (sales), closing stock,
                weighted-average cost, total value
              </Step>
              <Step>
                Total at the bottom is your inventory asset value at
                FY end
              </Step>
              <Step>
                Export to CSV/XLSX for your accountant + as evidence
                for tax filings
              </Step>
            </ol>
            <Warning>
              Before relying on the FY-end value, do a{" "}
              <strong>physical stock count</strong> and reconcile via
              Stock Adjustments if the count differs from
              Quikfinance&apos;s number. Year-end physical counts
              are mandatory for credible inventory valuation.
            </Warning>
          </>
        ),
      },
      {
        id: "documents-for-tax-filing",
        q: "What are the documents that I should send to my accountant to file my taxes?",
        a: (
          <>
            <P>
              For an Indian FY close (Apr-Mar), your accountant will
              typically ask for every line below. Each link goes to
              the report — Export to PDF/XLSX/CSV from there and
              attach to your tax-filing email.
            </P>
            <H>Statutory reports</H>
            <ul className="list-disc ml-5 space-y-1.5">
              <Bullet>
                <L href="/reports/trial-balance">Trial Balance</L>{" "}
                (as of FY end)
              </Bullet>
              <Bullet>
                <L href="/reports/profit-loss">Profit &amp; Loss</L>{" "}
                (full FY)
              </Bullet>
              <Bullet>
                <L href="/reports/balance-sheet">Balance Sheet</L>{" "}
                (as of FY end)
              </Bullet>
              <Bullet>
                <L href="/reports/cash-flow">Cash Flow Statement</L>{" "}
                (full FY)
              </Bullet>
              <Bullet>
                <L href="/reports/profit-loss-schedule-iii">
                  P&amp;L (Schedule III)
                </L>{" "}
                — Companies Act format
              </Bullet>
              <Bullet>
                <L href="/reports/balance-sheet-schedule-iii">
                  Balance Sheet (Schedule III)
                </L>
              </Bullet>
            </ul>
            <H>GST-specific</H>
            <ul className="list-disc ml-5 space-y-1.5">
              <Bullet>
                <L href="/reports/gstr1">GSTR-1 Export</L> for each
                month of the FY
              </Bullet>
              <Bullet>
                <L href="/reports/sales-summary">Sales Summary</L>{" "}
                (full FY) — cross-checks GSTR-1 totals
              </Bullet>
              <Bullet>
                GSTR-3B filings for each month (downloaded from the
                GST portal)
              </Bullet>
            </ul>
            <H>Bank &amp; cash</H>
            <ul className="list-disc ml-5 space-y-1.5">
              <Bullet>
                Bank statements for each account for the full FY
                (PDF from your bank or CSV download)
              </Bullet>
              <Bullet>
                Reconciliation reports — printable from each bank
                account&apos;s Reconciliation History
              </Bullet>
            </ul>
            <H>Supporting documents</H>
            <ul className="list-disc ml-5 space-y-1.5">
              <Bullet>
                TDS Certificates (Form 16A) received from customers
              </Bullet>
              <Bullet>
                TDS Returns (Form 26Q) you filed
              </Bullet>
              <Bullet>
                Tax challans for any tax payments made (income tax,
                advance tax, etc.)
              </Bullet>
              <Bullet>
                Loan statements + amortisation schedules
              </Bullet>
              <Bullet>
                Fixed-asset register + depreciation schedule
              </Bullet>
            </ul>
            <Hint>
              <strong>Pro tip</strong>: schedule each of these
              reports via{" "}
              <L href="/reports">Reports Center</L>&apos;s Schedule
              feature to be emailed to your accountant automatically
              each month. Year-end becomes a non-event.
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
              Quikfinance doesn&apos;t require a hard &ldquo;close&rdquo;
              action — your books remain editable. The recommended
              year-end workflow:
            </P>
            <H>Step-by-step</H>
            <ol className="list-decimal ml-5 space-y-1.5">
              <Step>
                Work through the checklist on{" "}
                <L href="/fiscal-year-end">Fiscal Year-End Tasks</L>{" "}
                — 7 cards covering the main areas
              </Step>
              <Step>
                <strong>Reconcile every bank account</strong> to
                zero un-reconciled items
              </Step>
              <Step>
                <strong>Physical stock count</strong> for inventory-
                tracked items + Stock Adjustments to align book
                with reality
              </Step>
              <Step>
                <strong>Year-end adjusting entries</strong> via Manual
                Journals: depreciation, prepaid amortisation,
                accruals, deferrals, bad-debt provisions, FX
                revaluation
              </Step>
              <Step>
                <strong>Review Trial Balance</strong> as of FY end —
                must balance to zero
              </Step>
              <Step>
                <strong>Export statutory pack</strong> (see &ldquo;What
                documents to send to my accountant?&rdquo;)
              </Step>
              <Step>
                After your accountant files, optionally lock the
                period (roadmap) or set permissions to read-only on
                closed FYs (via Roles)
              </Step>
            </ol>
            <Hint>
              The transition into the new FY is a natural moment to
              roll your invoice number prefix (see &ldquo;Modify
              invoice number&rdquo;), update budget for the new FY,
              and start fresh on AR Aging.
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
              Schedule III of the Companies Act 2013 is the mandated
              format for P&amp;L and Balance Sheet for any company
              registered with MCA. Quikfinance generates both in this
              format directly from your CoA.
            </P>
            <H>Two reports</H>
            <ul className="list-disc ml-5 space-y-1.5">
              <Bullet>
                <L href="/reports/profit-loss-schedule-iii">
                  Profit &amp; Loss (Schedule III)
                </L>{" "}
                — 15 sections (I. Revenue from Operations → XV.
                Profit/Loss for the period)
              </Bullet>
              <Bullet>
                <L href="/reports/balance-sheet-schedule-iii">
                  Balance Sheet (Schedule III)
                </L>{" "}
                — Equity &amp; Liabilities pane + Assets pane,
                comparative columns
              </Bullet>
            </ul>
            <H>How they auto-map</H>
            <P>
              Both reports use your account&apos;s{" "}
              <em>sub-type</em> + name heuristics to route each
              ledger entry to the correct Schedule III bucket — you
              don&apos;t need to manually classify accounts.
              Example mappings:
            </P>
            <ul className="list-disc ml-5 space-y-1.5">
              <Bullet>
                CoA &ldquo;Cash on Hand&rdquo; → Cash and Cash
                Equivalents
              </Bullet>
              <Bullet>
                CoA &ldquo;Office Equipment&rdquo; → Property, Plant
                and Equipment
              </Bullet>
              <Bullet>
                CoA &ldquo;Trade Receivables&rdquo; → Trade
                Receivables (current asset)
              </Bullet>
            </ul>
            <H>Exporting for filing</H>
            <P>
              Both have Export → CSV / XLSX / PDF. For MCA filing
              your CA usually wants the XLSX so they can copy the
              numbers into the official MCA-21 filing tool.
            </P>
          </>
        ),
      },
      {
        id: "year-end-adjustments",
        q: "What year-end adjustment entries should I post?",
        a: (
          <>
            <P>
              Year-end adjustments are accounting entries that don&apos;t
              correspond to a routine transaction but are required to
              accurately match revenue with expense for the period.
              All are posted via{" "}
              <L href="/accountant/manual-journals/new">
                Manual Journals
              </L>
              .
            </P>
            <H>Common adjustments</H>
            <ul className="list-disc ml-5 space-y-1.5">
              <Bullet>
                <strong>Depreciation</strong> on every fixed asset
                (use SLM or WDV per your policy). Debit
                Depreciation Expense / Credit Accumulated
                Depreciation.
              </Bullet>
              <Bullet>
                <strong>Prepaid expense amortisation</strong>: for
                expenses paid in advance covering multiple periods
                (annual insurance, annual software licence),
                recognise the portion that&apos;s expired. Debit
                Insurance Expense / Credit Prepaid Insurance.
              </Bullet>
              <Bullet>
                <strong>Accrued expenses</strong>: services you
                received but haven&apos;t been billed for (e.g.
                December electricity bill arriving in January).
                Debit Expense / Credit Accrued Liabilities.
              </Bullet>
              <Bullet>
                <strong>Deferred revenue</strong> recognition:
                services you&apos;ve been paid for but haven&apos;t
                delivered. Debit Deferred Revenue / Credit
                Revenue.
              </Bullet>
              <Bullet>
                <strong>Bad-debt provision</strong>: AR balances
                you don&apos;t expect to collect. Debit Bad Debt
                Expense / Credit Allowance for Doubtful Debts.
              </Bullet>
              <Bullet>
                <strong>Inventory adjustments</strong>: damage,
                shrinkage, or recount differences (see Stock
                Adjustments for inventory items).
              </Bullet>
              <Bullet>
                <strong>FX revaluation</strong>: revalue open
                foreign-currency balances to the FY-end rate (use{" "}
                <L href="/accountant/currency-adjustments">
                  Currency Adjustments
                </L>
                ).
              </Bullet>
            </ul>
            <Hint>
              For repetitive adjustments (e.g. monthly depreciation
              of a fixed asset), set up a{" "}
              <strong>Recurring Manual Journal</strong> so it auto-
              fires each period instead of you remembering.
            </Hint>
          </>
        ),
      },
      {
        id: "lock-period",
        q: "How do I lock a period so no one can edit historical transactions?",
        a: (
          <>
            <P>
              Period locking — preventing edits to closed
              months/years — is on the roadmap. The feature will
              let you set a cutoff date past which Owner-only edits
              are allowed.
            </P>
            <H>Today&apos;s workaround</H>
            <ol className="list-decimal ml-5 space-y-1.5">
              <Step>
                Create a new role in{" "}
                <L href="/settings/roles">Settings → Roles</L>{" "}
                called &ldquo;Limited Editor&rdquo;
              </Step>
              <Step>
                Grant write permissions only on current-period
                modules (Invoice, Bill, Expense) and read-only on
                historical data
              </Step>
              <Step>
                Reassign all non-Owner users to this role after
                year-end close
              </Step>
              <Step>
                Owners still have full edit rights — preserve this
                as the exception path for genuine corrections
              </Step>
            </ol>
            <Hint>
              Document any post-close edits in your audit log via
              Manual Journal narration — this is the standard way to
              satisfy auditors when corrections are needed.
            </Hint>
          </>
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
