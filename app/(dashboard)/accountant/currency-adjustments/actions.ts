"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireOrganization } from "@/lib/auth-helpers";
import { writeAuditLog } from "@/lib/audit";
import { nextDocumentNumber } from "@/lib/next-number";
import { getOrCreateSystemAccount } from "@/lib/accounting/system-accounts";
import {
  validateCurrencyAdjustmentLines,
  buildJeLines,
  currencyAdjustmentReference,
} from "@/lib/accounting/currency-adjustment";

/**
 * ACCT-C — Server actions for Currency Adjustments.
 *
 *   createCurrencyAdjustmentAction — header + balanced JE in one
 *                                     transaction.
 *   deleteCurrencyAdjustmentAction — drops the header AND its
 *                                     CADJ:<id> JE.
 *
 * Reference convention: each adjustment posts a JE with reference
 * `CADJ:<id>`, parsed by lib/accounting/parse-je-reference.ts so
 * the journal-entries list links back to the adjustment detail.
 */

const lineSchema = z.object({
  accountId: z.string().min(1, "Pick an account on every line."),
  kind: z.enum(["GAIN", "LOSS"]),
  amount: z.coerce.number().positive("Amount must be greater than zero."),
  description: z.string().max(500).optional().nullable(),
});

const createSchema = z.object({
  date: z.coerce.date(),
  currency: z
    .string()
    .regex(/^[A-Z]{3}$/i, "Currency must be a 3-letter ISO code"),
  exchangeRate: z.coerce.number().positive().optional().nullable(),
  notes: z.string().max(2000).optional().nullable(),
  lines: z.array(lineSchema).min(1, "Add at least one adjustment line."),
});

export type CurrencyAdjustmentInput = z.input<typeof createSchema>;

// ──────────────────── create ────────────────────

export async function createCurrencyAdjustmentAction(
  input: CurrencyAdjustmentInput
): Promise<{ ok: boolean; id?: string; error?: string }> {
  const { user, organization } = await requireOrganization();
  const data = createSchema.parse(input);

  const normLines = data.lines.map((l) => ({
    accountId: l.accountId,
    kind: l.kind,
    amount: Number(l.amount),
    description: l.description ?? null,
  }));

  const lineErr = validateCurrencyAdjustmentLines(normLines);
  if (lineErr) return { ok: false, error: lineErr };

  // Verify every adjustment-line account belongs to this org.
  const accountIds = Array.from(new Set(normLines.map((l) => l.accountId)));
  const accounts = await db.chartOfAccount.findMany({
    where: { id: { in: accountIds }, organizationId: organization.id },
    select: { id: true, code: true },
  });
  if (accounts.length !== accountIds.length) {
    return { ok: false, error: "Some accounts not found in this org." };
  }
  // Defensive: refuse to use the FX system accounts themselves as
  // the adjustment-line target (would create a self-cancelling JE).
  if (accounts.some((a) => a.code === "SYS-FX-GAIN" || a.code === "SYS-FX-LOSS")) {
    return {
      ok: false,
      error: "Pick a non-FX account on every line — the FX gain/loss accounts are filled in automatically.",
    };
  }

  const number = await nextDocumentNumber(
    organization.id,
    "currencyAdjustment"
  );

  const created = await db.$transaction(async (tx) => {
    // Lazy-create the two FX system accounts inside the txn so a
    // first-ever adjustment in an org doesn't half-succeed.
    const fxGain = await getOrCreateSystemAccount(
      organization.id,
      "FX_GAIN",
      tx
    );
    const fxLoss = await getOrCreateSystemAccount(
      organization.id,
      "FX_LOSS",
      tx
    );

    const header = await tx.currencyAdjustment.create({
      data: {
        organizationId: organization.id,
        number,
        date: data.date,
        currency: data.currency.toUpperCase(),
        exchangeRate: data.exchangeRate ?? null,
        notes: data.notes ?? null,
      },
    });

    const jeLines = buildJeLines(normLines, {
      fxGainId: fxGain.id,
      fxLossId: fxLoss.id,
    });

    await tx.journalEntry.create({
      data: {
        organizationId: organization.id,
        date: header.date,
        reference: currencyAdjustmentReference(header.id),
        notes:
          header.notes ??
          `Currency adjustment ${header.number} (${header.currency})`,
        lines: {
          create: jeLines.map((l) => ({
            accountId: l.accountId,
            debit: l.debit,
            credit: l.credit,
            description: l.description,
          })),
        },
      },
    });

    return header;
  });

  await writeAuditLog({
    organizationId: organization.id,
    userId: user.id,
    action: "CREATE",
    entityType: "CurrencyAdjustment",
    entityId: created.id,
    after: {
      number: created.number,
      currency: created.currency,
      lines: normLines.length,
      gains: normLines.filter((l) => l.kind === "GAIN").length,
      losses: normLines.filter((l) => l.kind === "LOSS").length,
    },
  });

  revalidatePath("/accountant/currency-adjustments");
  revalidatePath("/accountant/journal-entries");
  return { ok: true, id: created.id };
}

export async function createCurrencyAdjustmentAndRedirectAction(
  input: CurrencyAdjustmentInput
): Promise<void> {
  const res = await createCurrencyAdjustmentAction(input);
  if (!res.ok || !res.id) {
    throw new Error(res.error ?? "Failed to create currency adjustment");
  }
  redirect(`/accountant/currency-adjustments/${res.id}`);
}

// ──────────────────── delete ────────────────────

export async function deleteCurrencyAdjustmentAction(
  id: string
): Promise<{ ok: boolean; error?: string }> {
  const { user, organization } = await requireOrganization();
  const row = await db.currencyAdjustment.findFirst({
    where: { id, organizationId: organization.id },
  });
  if (!row) return { ok: false, error: "Currency adjustment not found" };

  await db.$transaction([
    db.journalEntry.deleteMany({
      where: {
        organizationId: organization.id,
        reference: currencyAdjustmentReference(id),
      },
    }),
    db.currencyAdjustment.delete({ where: { id } }),
  ]);

  await writeAuditLog({
    organizationId: organization.id,
    userId: user.id,
    action: "DELETE",
    entityType: "CurrencyAdjustment",
    entityId: id,
    before: { number: row.number, currency: row.currency },
  });

  revalidatePath("/accountant/currency-adjustments");
  revalidatePath("/accountant/journal-entries");
  return { ok: true };
}

export async function deleteCurrencyAdjustmentByIdAction(
  id: string
): Promise<void> {
  const res = await deleteCurrencyAdjustmentAction(id);
  if (!res.ok) throw new Error(res.error ?? "Delete failed");
}
