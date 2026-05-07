/**
 * Merge-tag substitution for email subjects + bodies.
 *
 * Supported tags (per <quotes_spec> / <invoices_spec>):
 *   {{customer.name}}      — Contact.displayName
 *   {{customer.email}}     — Contact.email
 *   {{document.number}}    — doc number (quote/invoice/etc.)
 *   {{document.total}}     — formatted total
 *   {{document.date}}      — issue/quote/order date (formatted)
 *   {{document.dueDate}}   — invoice due date (formatted)
 *   {{org.name}}           — Organization.name
 *
 * Unknown tags pass through verbatim so a typo in a template doesn't
 * silently swallow content. Tag names are case-insensitive.
 */
export type MergeTagContext = {
  customerName?: string | null;
  customerEmail?: string | null;
  documentNumber?: string | null;
  documentTotal?: string | null;
  documentDate?: string | null;
  documentDueDate?: string | null;
  orgName?: string | null;
};

const TAG_PATTERN = /\{\{\s*([\w.]+)\s*\}\}/g;

export function applyMergeTags(template: string, ctx: MergeTagContext): string {
  if (!template) return "";
  return template.replace(TAG_PATTERN, (match, raw: string) => {
    const key = String(raw).toLowerCase();
    switch (key) {
      case "customer.name":
        return ctx.customerName ?? match;
      case "customer.email":
        return ctx.customerEmail ?? match;
      case "document.number":
      case "quote.number":
      case "invoice.number":
        return ctx.documentNumber ?? match;
      case "document.total":
      case "quote.total":
      case "invoice.total":
        return ctx.documentTotal ?? match;
      case "document.date":
      case "quote.date":
      case "invoice.date":
        return ctx.documentDate ?? match;
      case "document.duedate":
      case "invoice.duedate":
        return ctx.documentDueDate ?? match;
      case "org.name":
        return ctx.orgName ?? match;
      default:
        return match;
    }
  });
}
