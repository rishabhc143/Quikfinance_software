import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { requireOrganization } from "@/lib/auth-helpers";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { AccountTypeToggle } from "@/components/banking/account-type-toggle";
import { createBankAccountAction } from "../actions";

export const metadata = { title: "Add Bank or Credit Card" };

/**
 * BNK-A — refactored to Add Bank or Credit Card form.
 *
 * The previous form was a flat field list with a free-text accountType
 * dropdown (Checking/Savings/Credit Card/Cash/Wallet). Per Screenshots
 * 3 + 4 in the banking screenshots doc, the reference form is a
 * Bank vs Credit Card radio toggle that dynamically hides 3 fields
 * (Account Number, IFSC, Make-this-primary) for credit cards.
 *
 * The conditional rendering happens inside <AccountTypeToggle/> (client
 * component). The form submits to createBankAccountAction which now
 * understands the new field shape.
 */
export default async function NewBankAccountPage() {
  const { organization } = await requireOrganization();
  return (
    <div className="p-6 max-w-2xl mx-auto space-y-4">
      <div className="flex items-center gap-2">
        <Button asChild variant="ghost" size="icon">
          <Link href="/banking">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <h1 className="text-xl font-semibold">Add Bank or Credit Card</h1>
      </div>
      <Card>
        <CardContent className="pt-6">
          <form action={createBankAccountAction} className="space-y-4">
            <AccountTypeToggle defaultCurrency={organization.currency} />
            <div className="flex justify-end gap-2 pt-4 border-t">
              <Button type="button" variant="outline" asChild>
                <Link href="/banking">Cancel</Link>
              </Button>
              <Button type="submit">Save</Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
