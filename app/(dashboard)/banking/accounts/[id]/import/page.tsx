import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Upload } from "lucide-react";
import { db } from "@/lib/db";
import { requireOrganization } from "@/lib/auth-helpers";
import { Button } from "@/components/ui/button";
import { ImportBankStatementWizard } from "./wizard";

export const metadata = { title: "Import Bank Statement" };

/**
 * BNK-A — Server wrapper that loads the bank account + any saved
 * column-mapping presets, then renders the 4-step client wizard.
 *
 * Presets are scoped to a single bank account so the same bank's
 * statement format auto-fills next month's import.
 */
export default async function ImportBankStatementPage({
  params,
}: {
  params: { id: string };
}) {
  const { organization } = await requireOrganization();

  const account = await db.bankAccount.findFirst({
    where: { id: params.id, organizationId: organization.id },
  });
  if (!account) notFound();

  const presets = await db.bankImportPreset.findMany({
    where: { bankAccountId: account.id, organizationId: organization.id },
    orderBy: { createdAt: "desc" },
  });

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-4">
      <div className="flex items-center gap-2">
        <Button asChild variant="ghost" size="icon" aria-label="Back">
          <Link href={`/banking/accounts/${account.id}`}>
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <Upload className="h-5 w-5 text-muted-foreground" />
        <h1 className="text-2xl font-semibold tracking-tight">
          Import Bank Statement
        </h1>
        <span className="text-sm text-muted-foreground ml-2">
          for {account.name}
        </span>
      </div>
      <ImportBankStatementWizard
        bankAccountId={account.id}
        currency={account.currency}
        presets={presets.map((p) => ({
          id: p.id,
          name: p.name,
          amountColumnType: p.amountColumnType,
          encoding: p.encoding,
          delimiter: p.delimiter,
          columnMapJson: p.columnMapJson as Record<string, unknown>,
        }))}
      />
    </div>
  );
}
