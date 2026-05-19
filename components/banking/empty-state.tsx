import Link from "next/link";
import { Wallet, Play } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Banking module empty state — shown on /banking when the org has zero
 * BankAccount rows. Mirrors Zoho Books' "Stay on top of your money"
 * empty-state pattern (confirmed from Screenshot 1 in the Zoho banking
 * research doc). The primary CTA opens the manual Add-Account form;
 * the secondary CTA is an alias of the primary for v1 since Yodlee
 * auto-feeds (BNK-J) aren't built yet — both buttons go to the same
 * destination. Once feeds ship, primary becomes "Connect Bank /
 * Credit Card" and secondary stays "Add Manually."
 */
export function BankingEmptyState() {
  return (
    <div className="flex flex-col items-center justify-center py-20 px-6 text-center max-w-2xl mx-auto">
      <div className="rounded-full bg-primary/10 p-4 mb-6">
        <Wallet className="h-12 w-12 text-primary" />
      </div>
      <h1 className="text-3xl font-semibold tracking-tight mb-3">
        Stay on top of your money
      </h1>
      <p className="text-sm text-muted-foreground max-w-md mb-8">
        Connect your bank and credit cards to fetch all your transactions.
        Create, categorize and match these transactions to those you have in
        Quikfinance.
      </p>
      <div className="flex items-center gap-3 mb-6">
        <Button asChild size="lg" className="gap-2">
          <Link href="/banking/accounts/new">Add Bank Account</Link>
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
      <div className="mt-12 border-t pt-6 w-full">
        <Link
          href="/help/bank-connections-guide"
          className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
        >
          <Play className="h-4 w-4" />
          Learn how bank connections work
        </Link>
      </div>
    </div>
  );
}
