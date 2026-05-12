/**
 * PDF rendering for sales documents.
 *
 * Phase S1 ships a minimal HTML-string renderer; Phase S3 swaps the
 * implementation for `@react-pdf/renderer`. Server callers should treat the
 * return value as opaque bytes (`Uint8Array`) and pass it through to the
 * route handler / EmailJob attachment.
 *
 * Decision (D43): the HTML renderer is intentionally simple — it's there so
 * the data flow ("server action enqueues email with rendered attachment") is
 * exercised end-to-end before we add the PDF dependency.
 */

import type { DocumentComputed } from "./totals";

export type RenderableSalesDocument = {
  type:
    | "QUOTE"
    | "SALES_ORDER"
    | "INVOICE"
    | "CREDIT_NOTE"
    | "DELIVERY_CHALLAN"
    | "DEBIT_NOTE"
    // P3-D (Purchases): the renderer is generic — the `customer`
    // field is populated with the vendor when type=PURCHASE_ORDER.
    | "PURCHASE_ORDER"
    // P-acc#15 (Purchases): Bills are never emailed but the user can
    // still print / save as PDF for their records. Vendor Credits
    // similarly produce a PDF that gets attached to a refund or
    // sent alongside related correspondence.
    | "BILL"
    | "VENDOR_CREDIT";
  organization: { name: string; logoUrl?: string | null; address?: string | null };
  document: {
    number: string;
    date: string;
    dueDate?: string;
    referenceNumber?: string | null;
    subject?: string | null;
    status?: string;
  };
  customer: {
    displayName: string;
    email?: string | null;
    billingAddress?: string | null;
    shippingAddress?: string | null;
  };
  lines: Array<{
    name: string;
    description?: string | null;
    quantity: string;
    rate: string;
    amount: string;
  }>;
  totals: DocumentComputed;
  notes?: string | null;
  termsAndConditions?: string | null;
  /**
   * M20: custom fields with showOnPdf=true (or showOnPortal=true).
   * Already formatted by lib/sales/custom-fields-loader.ts — caller
   * passes plain `{ label, value }` rows ready to print.
   */
  customFields?: { label: string; value: string }[];
};

const TYPE_LABEL: Record<RenderableSalesDocument["type"], string> = {
  QUOTE: "Quote",
  SALES_ORDER: "Sales Order",
  INVOICE: "Invoice",
  CREDIT_NOTE: "Credit Note",
  DELIVERY_CHALLAN: "Delivery Challan",
  DEBIT_NOTE: "Debit Note",
  PURCHASE_ORDER: "Purchase Order",
  BILL: "Bill",
  VENDOR_CREDIT: "Credit Note",
};

function escape(s: string | null | undefined): string {
  if (!s) return "";
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Render a sales document to an HTML string. Returns a fully-formed document
 * that browsers can open or that downstream code can convert to PDF using a
 * headless renderer.
 */
export function renderSalesDocumentHtml(doc: RenderableSalesDocument): string {
  const label = TYPE_LABEL[doc.type];
  const rows = doc.lines
    .map(
      (l) => `
      <tr>
        <td style="padding:8px;border-bottom:1px solid #eee;">
          <div style="font-weight:600;">${escape(l.name)}</div>
          ${l.description ? `<div style="font-size:12px;color:#555;">${escape(l.description)}</div>` : ""}
        </td>
        <td style="padding:8px;border-bottom:1px solid #eee;text-align:right;">${escape(l.quantity)}</td>
        <td style="padding:8px;border-bottom:1px solid #eee;text-align:right;">${escape(l.rate)}</td>
        <td style="padding:8px;border-bottom:1px solid #eee;text-align:right;">${escape(l.amount)}</td>
      </tr>`
    )
    .join("");

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>${label} ${escape(doc.document.number)}</title>
<style>body{font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,sans-serif;margin:32px;color:#111;}</style>
</head>
<body>
  <header style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:32px;">
    <div>
      <h1 style="margin:0;font-size:28px;">${label}</h1>
      <div style="color:#555;font-size:14px;">${escape(doc.document.number)}</div>
    </div>
    <div style="text-align:right;">
      <div style="font-weight:600;">${escape(doc.organization.name)}</div>
      ${doc.organization.address ? `<div style="color:#555;font-size:13px;">${escape(doc.organization.address)}</div>` : ""}
    </div>
  </header>

  <section style="display:flex;justify-content:space-between;margin-bottom:24px;">
    <div>
      <div style="text-transform:uppercase;font-size:11px;color:#666;letter-spacing:1px;">Bill to</div>
      <div style="font-weight:600;">${escape(doc.customer.displayName)}</div>
      ${doc.customer.billingAddress ? `<div style="color:#555;font-size:13px;white-space:pre-line;">${escape(doc.customer.billingAddress)}</div>` : ""}
    </div>
    <div style="text-align:right;font-size:13px;">
      <div><strong>Date:</strong> ${escape(doc.document.date)}</div>
      ${doc.document.dueDate ? `<div><strong>Due date:</strong> ${escape(doc.document.dueDate)}</div>` : ""}
      ${doc.document.referenceNumber ? `<div><strong>Reference:</strong> ${escape(doc.document.referenceNumber)}</div>` : ""}
      ${doc.document.subject ? `<div><strong>Subject:</strong> ${escape(doc.document.subject)}</div>` : ""}
    </div>
  </section>

  <table style="width:100%;border-collapse:collapse;margin-bottom:16px;">
    <thead>
      <tr style="background:#f7f7f7;text-align:left;font-size:12px;text-transform:uppercase;color:#555;">
        <th style="padding:8px;">Item</th>
        <th style="padding:8px;text-align:right;">Qty</th>
        <th style="padding:8px;text-align:right;">Rate</th>
        <th style="padding:8px;text-align:right;">Amount</th>
      </tr>
    </thead>
    <tbody>${rows}</tbody>
  </table>

  <section style="display:flex;justify-content:flex-end;margin-bottom:32px;">
    <table style="font-size:13px;">
      <tr><td style="padding:4px 16px 4px 0;color:#555;">Sub Total</td><td style="text-align:right;">${escape(doc.totals.subTotal)}</td></tr>
      <tr><td style="padding:4px 16px 4px 0;color:#555;">Discount</td><td style="text-align:right;">${escape(doc.totals.documentDiscountAmount)}</td></tr>
      <tr><td style="padding:4px 16px 4px 0;color:#555;">Tax</td><td style="text-align:right;">${escape(doc.totals.documentTaxAmount)}</td></tr>
      <tr><td style="padding:4px 16px 4px 0;color:#555;">Adjustment</td><td style="text-align:right;">${escape(doc.totals.adjustmentAmount)}</td></tr>
      <tr style="font-weight:700;font-size:15px;border-top:2px solid #111;"><td style="padding:8px 16px 4px 0;">Total</td><td style="text-align:right;padding:8px 0 4px 0;">${escape(doc.totals.total)}</td></tr>
    </table>
  </section>

  ${
    doc.customFields && doc.customFields.length > 0
      ? `<section style="margin-bottom:16px;">
        <div style="font-weight:600;margin-bottom:4px;">Additional Information</div>
        <table style="border-collapse:collapse;font-size:13px;color:#444;">
          ${doc.customFields
            .map(
              (cf) =>
                `<tr><td style="padding:2px 16px 2px 0;color:#777;">${escape(
                  cf.label
                )}</td><td>${escape(cf.value)}</td></tr>`
            )
            .join("")}
        </table>
      </section>`
      : ""
  }
  ${doc.notes ? `<section style="margin-bottom:16px;"><div style="font-weight:600;margin-bottom:4px;">Notes</div><div style="color:#444;font-size:13px;white-space:pre-line;">${escape(doc.notes)}</div></section>` : ""}
  ${doc.termsAndConditions ? `<section style="margin-bottom:16px;"><div style="font-weight:600;margin-bottom:4px;">Terms &amp; Conditions</div><div style="color:#444;font-size:13px;white-space:pre-line;">${escape(doc.termsAndConditions)}</div></section>` : ""}
</body>
</html>`;
}

/**
 * Convenience: return the rendered document as bytes the way a real PDF
 * route would. Phase S3 replaces this with @react-pdf/renderer; the call
 * sites stay the same.
 */
export function renderSalesDocumentBytes(doc: RenderableSalesDocument): Uint8Array {
  return new TextEncoder().encode(renderSalesDocumentHtml(doc));
}
