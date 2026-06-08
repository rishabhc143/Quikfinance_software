import Link from "next/link";
import { PlayCircle } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Banking module empty state — shown on /banking when the org has zero
 * BankAccount rows. Matches the Zoho Books reference layout 1:1:
 *
 *   - No top icon (text-first layout)
 *   - Centered title "Stay on top of your money"
 *   - Two-line body copy describing what bank connections do
 *   - Primary CTA: "Connect Bank / Credit Card" (BLUE)
 *   - Secondary CTA: "Add Manually" (outline)
 *   - "Don't use banking for your business? Skip" link directly under
 *     the buttons (small, with Skip as a blue link)
 *   - Horizontal separator
 *   - Bottom video link: play-in-circle icon + "Watch how to connect
 *     your bank account to Quikfinance"
 *
 * Routing note: until Yodlee/Plaid feeds (BNK-J) ship, BOTH buttons
 * route to the manual Add-Account form. When feeds land, the primary
 * button will open the connection picker instead and the secondary
 * stays on the manual path.
 */
export function BankingEmptyState() {
  return (
    <div className="mx-auto flex max-w-2xl flex-col items-center px-6 py-20 text-center">
      <h1 className="mb-3 text-2xl font-semibold tracking-tight">
        Stay on top of your money
      </h1>
      <p className="mb-8 max-w-md text-sm text-muted-foreground">
        Connect your bank and credit cards to fetch all your transactions.
        Create, categorize and match these transactions to those you have in
        Quikfinance.
      </p>
      <div className="mb-6 flex items-center gap-3">
        <Button asChild size="lg">
          <Link href="/banking/accounts/new">Connect Bank / Credit Card</Link>
        </Button>
        <Button asChild variant="outline" size="lg">
          <Link href="/banking/accounts/new?type=manual">Add Manually</Link>
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">
        Don&apos;t use banking for your business?{" "}
        <Link
          href="/banking?skipped=1"
          className="text-primary hover:underline"
        >
          Skip
        </Link>
      </p>
      <div className="mt-12 w-full border-t pt-6">
        <Link
          href="/help/bank-connections-guide"
          className="inline-flex items-center gap-2 text-sm font-medium text-foreground hover:text-primary"
        >
          <PlayCircle className="h-5 w-5 text-primary" />
          Watch how to connect your bank account to Quikfinance
        </Link>
      </div>
    </div>
  );
}
