import Link from "next/link";
import { ExternalLink } from "lucide-react";

/**
 * CF-7 — Deep-link from an alert card to its source row.
 *
 * Each detector emits a `refType` + `refId`. We map the type to its
 * canonical URL. Unknown types render as plain text rather than a
 * dangling link — future detectors that produce new refTypes need
 * to add a case here.
 */
const URL_MAP: Record<string, (id: string) => string> = {
  bill: (id) => `/purchases/bills/${id}`,
  invoice: (id) => `/sales/invoices/${id}`,
  recurring_invoice: (id) => `/sales/recurring-invoices/${id}`,
  recurring_bill: (id) => `/purchases/recurring-bills/${id}`,
  recurring_expense: (id) => `/purchases/recurring-expenses/${id}`,
};

const LABEL_MAP: Record<string, string> = {
  bill: "View bill",
  invoice: "View invoice",
  recurring_invoice: "View recurring invoice",
  recurring_bill: "View recurring bill",
  recurring_expense: "View recurring expense",
};

export function AlertSourceLink({
  refType,
  refId,
}: {
  refType: string;
  refId: string;
}) {
  const make = URL_MAP[refType];
  if (!make) {
    return (
      <span className="text-xs text-muted-foreground">
        Source: {refType.replace(/_/g, " ")}
      </span>
    );
  }
  return (
    <Link
      href={make(refId)}
      className="text-xs inline-flex items-center gap-1 text-primary hover:underline"
    >
      <ExternalLink className="h-3 w-3" />
      {LABEL_MAP[refType] ?? "View source"}
    </Link>
  );
}
