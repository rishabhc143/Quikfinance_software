"use server";

import { revalidatePath } from "next/cache";
import { parse } from "csv-parse/sync";
import { db } from "@/lib/db";
import { requireOrganization } from "@/lib/auth-helpers";
import { writeAuditLog } from "@/lib/audit";

export type DupHandling = "skip" | "overwrite" | "add_as_new";

export type ImportResult = {
  parsed: number;
  created: number;
  updated: number;
  skipped: number;
  errors: { row: number; message: string }[];
};

const HEADER_ALIASES: Record<string, string> = {
  "display name": "displayName",
  "name": "displayName",
  "company name": "companyName",
  "company": "companyName",
  "email": "email",
  "email address": "email",
  "phone": "workPhone",
  "work phone": "workPhone",
  "mobile": "mobile",
  "gstin": "gstin",
  "gst": "gstin",
  "pan": "pan",
  "currency": "currency",
  "first name": "firstName",
  "last name": "lastName",
  "salutation": "salutation",
  "notes": "notes",
};

function normalizeHeader(h: string): string {
  return (HEADER_ALIASES[h.trim().toLowerCase()] ?? h.trim()).slice(0, 80);
}

export async function importCustomersAction(input: {
  csvText: string;
  dupHandling: DupHandling;
}): Promise<ImportResult> {
  const { user, organization } = await requireOrganization();
  const result: ImportResult = {
    parsed: 0,
    created: 0,
    updated: 0,
    skipped: 0,
    errors: [],
  };

  let rows: Record<string, string>[];
  try {
    rows = parse(input.csvText, {
      columns: (header: string[]) => header.map(normalizeHeader),
      skip_empty_lines: true,
      trim: true,
    }) as Record<string, string>[];
  } catch (err) {
    return {
      ...result,
      errors: [{ row: 0, message: `CSV parse failed: ${(err as Error).message}` }],
    };
  }

  result.parsed = rows.length;

  for (let i = 0; i < rows.length; i += 1) {
    const r = rows[i];
    const displayName = (r.displayName ?? "").trim();
    if (!displayName) {
      result.errors.push({ row: i + 2, message: "displayName missing" });
      continue;
    }

    const data = {
      displayName,
      companyName: r.companyName?.trim() || null,
      email: r.email?.trim() || null,
      workPhone: r.workPhone?.trim() || null,
      mobile: r.mobile?.trim() || null,
      gstin: r.gstin?.trim().toUpperCase() || null,
      pan: r.pan?.trim().toUpperCase() || null,
      currency: r.currency?.trim() || organization.currency,
      firstName: r.firstName?.trim() || null,
      lastName: r.lastName?.trim() || null,
      salutation: r.salutation?.trim() || null,
      notes: r.notes?.trim() || null,
    };

    const existing = await db.contact.findFirst({
      where: {
        organizationId: organization.id,
        displayName: data.displayName,
        deletedAt: null,
      },
      select: { id: true },
    });

    try {
      if (existing) {
        if (input.dupHandling === "skip") {
          result.skipped += 1;
        } else if (input.dupHandling === "overwrite") {
          await db.contact.update({
            where: { id: existing.id },
            data: { ...data, type: "CUSTOMER" },
          });
          result.updated += 1;
        } else {
          // add_as_new — append a numeric suffix
          const stamped = `${data.displayName} (${Date.now().toString().slice(-4)})`;
          await db.contact.create({
            data: {
              ...data,
              displayName: stamped,
              organizationId: organization.id,
              type: "CUSTOMER",
            },
          });
          result.created += 1;
        }
      } else {
        await db.contact.create({
          data: {
            ...data,
            organizationId: organization.id,
            type: "CUSTOMER",
          },
        });
        result.created += 1;
      }
    } catch (err) {
      result.errors.push({
        row: i + 2,
        message: err instanceof Error ? err.message : "Save failed",
      });
    }
  }

  await writeAuditLog({
    organizationId: organization.id,
    userId: user.id,
    action: "CREATE",
    entityType: "ContactImport",
    entityId: `import-${Date.now()}`,
    after: {
      parsed: result.parsed,
      created: result.created,
      updated: result.updated,
      skipped: result.skipped,
      errors: result.errors.length,
    },
  });

  revalidatePath("/sales/customers");
  return result;
}
