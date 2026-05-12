"use client";

import * as React from "react";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

/**
 * BNK-A — Add Bank or Credit Card form with Zoho-parity field toggling.
 *
 * Mirrors Screenshots 3 & 4 in docs/zoho-banking-screenshots.md:
 * - Bank type shows: Account Number, IFSC, Make-this-primary checkbox
 * - Credit Card type hides those three fields
 * - Both types share: Account Name, Account Code, Currency, Bank Name,
 *   Description
 *
 * Renders inside a parent <form action={createBankAccountAction}> — submits
 * via standard FormData. The `type` value is what flips the conditional
 * fields; the server action also reads it so the type column gets persisted
 * correctly.
 */
type Props = {
  defaultCurrency: string;
};

export function AccountTypeToggle({ defaultCurrency }: Props) {
  const [accountKind, setAccountKind] = React.useState<"BANK" | "CREDIT_CARD">(
    "BANK"
  );
  const isBank = accountKind === "BANK";

  return (
    <div className="space-y-4">
      <div>
        <Label className="block mb-2">
          Select Account Type <span className="text-destructive">*</span>
        </Label>
        <div className="flex items-center gap-6 text-sm">
          <label className="inline-flex items-center gap-2 cursor-pointer">
            <input
              type="radio"
              name="type"
              value="BANK"
              checked={accountKind === "BANK"}
              onChange={() => setAccountKind("BANK")}
              className="h-4 w-4"
            />
            Bank
          </label>
          <label className="inline-flex items-center gap-2 cursor-pointer">
            <input
              type="radio"
              name="type"
              value="CREDIT_CARD"
              checked={accountKind === "CREDIT_CARD"}
              onChange={() => setAccountKind("CREDIT_CARD")}
              className="h-4 w-4"
            />
            Credit Card
          </label>
        </div>
      </div>

      <div>
        <Label htmlFor="name">
          Account Name <span className="text-destructive">*</span>
        </Label>
        <Input id="name" name="name" required maxLength={120} autoFocus />
      </div>

      <div>
        <Label htmlFor="accountCode">Account Code</Label>
        <Input id="accountCode" name="accountCode" maxLength={40} />
      </div>

      <div>
        <Label htmlFor="currency">
          Currency <span className="text-destructive">*</span>
        </Label>
        <Input
          id="currency"
          name="currency"
          defaultValue={defaultCurrency}
          maxLength={8}
          required
        />
      </div>

      {/* Bank-only: Account Number */}
      {isBank ? (
        <div>
          <Label htmlFor="accountNumber">Account Number</Label>
          <Input id="accountNumber" name="accountNumber" maxLength={40} />
        </div>
      ) : null}

      <div>
        <Label htmlFor="bankName">Bank Name</Label>
        <Input id="bankName" name="bankName" maxLength={120} />
      </div>

      {/* Bank-only: IFSC */}
      {isBank ? (
        <div>
          <Label htmlFor="ifsc">IFSC</Label>
          <Input id="ifsc" name="ifsc" maxLength={20} />
        </div>
      ) : null}

      <div>
        <Label htmlFor="description">Description</Label>
        <Textarea
          id="description"
          name="description"
          maxLength={500}
          rows={3}
          placeholder="Max. 500 characters"
        />
      </div>

      {/* Bank-only: Make this primary */}
      {isBank ? (
        <label className="inline-flex items-center gap-2 text-sm cursor-pointer">
          <input
            type="checkbox"
            name="isPrimary"
            value="true"
            className="h-4 w-4"
          />
          Make this primary
        </label>
      ) : null}
    </div>
  );
}
