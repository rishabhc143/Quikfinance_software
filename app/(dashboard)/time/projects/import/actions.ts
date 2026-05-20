"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireOrganization } from "@/lib/auth-helpers";
import { writeAuditLog } from "@/lib/audit";
import { BILLING_METHODS, BILLING_METHOD_VALUES } from "../constants";
import type { SalesImportResult } from "@/components/shared/sales-import-wizard";

/**
 * Server action for the Projects CSV import wizard.
 *
 * Expected CSV columns (header row required, case-insensitive):
 *   Project Name      (required)
 *   Project Code      (optional)
 *   Customer Name     (required, must match an existing customer's displayName)
 *   Billing Method    (required, one of: fixed_cost / project_hours / task_hours / staff_hours
 *                     OR their friendly labels: "Fixed Cost for Project", etc.)
 *   Description       (optional, max 2000 chars)
 *   Cost Budget       (optional, numeric)
 *   Revenue Budget    (optional, numeric)
 *
 * Duplicate handling matches the wizard contract:
 *   - "skip"      → skip rows whose Project Name already exists in this org
 *   - "overwrite" → update the existing Project's fields with the CSV's values
 */
export async function importProjectsAction(input: {
  csvText: string;
  dupHandling: "skip" | "overwrite";
}): Promise<SalesImportResult> {
  const { user, organization } = await requireOrganization();
  const { csvText, dupHandling } = input;

  const result: SalesImportResult = {
    parsed: 0,
    created: 0,
    updated: 0,
    skipped: 0,
    errors: [],
  };

  // Tiny CSV parser — single-line cells only, no embedded quotes.
  // Adequate for the simple Project CSV shape; reuse the heavier
  // `csv-parse` only if we add free-text Description with commas.
  const lines = csvText.replace(/^﻿/, "").trim().split(/\r?\n/);
  if (lines.length < 2) {
    result.errors.push({ row: 0, message: "CSV must have a header row plus at least one data row." });
    return result;
  }

  const head = splitCsvRow(lines[0]).map((h) => h.trim().toLowerCase());
  const idx = (name: string) => head.indexOf(name.toLowerCase());

  const iName = idx("Project Name");
  const iCode = idx("Project Code");
  const iCustomer = idx("Customer Name");
  const iBilling = idx("Billing Method");
  const iDesc = idx("Description");
  const iCost = idx("Cost Budget");
  const iRevenue = idx("Revenue Budget");

  if (iName < 0 || iCustomer < 0 || iBilling < 0) {
    result.errors.push({
      row: 0,
      message:
        "Missing required columns. Expected at minimum: Project Name, Customer Name, Billing Method.",
    });
    return result;
  }

  // Preload all customers in one query so we don't roundtrip per row.
  const customers = await db.contact.findMany({
    where: {
      organizationId: organization.id,
      deletedAt: null,
      type: { in: ["CUSTOMER", "BOTH"] },
    },
    select: { id: true, displayName: true },
  });
  const customerByName = new Map(
    customers.map((c) => [c.displayName.trim().toLowerCase(), c.id])
  );

  const billingLabelToValue = new Map<string, string>(
    BILLING_METHODS.map((b) => [b.label.toLowerCase(), b.value])
  );

  for (let i = 1; i < lines.length; i++) {
    const lineNo = i + 1; // 1-indexed for the user; line 1 was the header.
    const raw = lines[i];
    if (!raw.trim()) continue;
    result.parsed += 1;

    const cells = splitCsvRow(raw);
    const name = cells[iName]?.trim() ?? "";
    const customerName = cells[iCustomer]?.trim() ?? "";
    const billingInput = (cells[iBilling]?.trim() ?? "").toLowerCase();
    const projectCode = iCode >= 0 ? cells[iCode]?.trim() ?? "" : "";
    const description = iDesc >= 0 ? cells[iDesc]?.trim() ?? "" : "";
    const costBudget = iCost >= 0 ? cells[iCost]?.trim() ?? "" : "";
    const revenueBudget = iRevenue >= 0 ? cells[iRevenue]?.trim() ?? "" : "";

    if (!name) {
      result.errors.push({ row: lineNo, message: "Project Name is required" });
      continue;
    }
    if (!customerName) {
      result.errors.push({ row: lineNo, message: "Customer Name is required" });
      continue;
    }
    const customerId = customerByName.get(customerName.toLowerCase());
    if (!customerId) {
      result.errors.push({
        row: lineNo,
        message: `Customer "${customerName}" not found. Create the customer first or fix the spelling.`,
      });
      continue;
    }

    // Billing method can be either the canonical value or the friendly label.
    let billingMethod: string | null = null;
    if (BILLING_METHOD_VALUES.includes(billingInput)) {
      billingMethod = billingInput;
    } else if (billingLabelToValue.has(billingInput)) {
      billingMethod = billingLabelToValue.get(billingInput)!;
    }
    if (!billingMethod) {
      result.errors.push({
        row: lineNo,
        message: `Billing Method "${cells[iBilling]}" not recognized. Use one of: ${BILLING_METHODS.map((b) => b.value).join(", ")}.`,
      });
      continue;
    }

    const costBudgetN = numericOrNull(costBudget);
    const revenueBudgetN = numericOrNull(revenueBudget);
    if (costBudget && costBudgetN === null) {
      result.errors.push({
        row: lineNo,
        message: `Cost Budget "${costBudget}" is not a valid number.`,
      });
      continue;
    }
    if (revenueBudget && revenueBudgetN === null) {
      result.errors.push({
        row: lineNo,
        message: `Revenue Budget "${revenueBudget}" is not a valid number.`,
      });
      continue;
    }

    // Dup detection by Project Name within this org.
    const existing = await db.project.findFirst({
      where: { organizationId: organization.id, name },
      select: { id: true },
    });

    try {
      if (existing) {
        if (dupHandling === "skip") {
          result.skipped += 1;
          continue;
        }
        await db.project.update({
          where: { id: existing.id },
          data: {
            projectCode: projectCode || null,
            customerId,
            billingMethod,
            description: description || null,
            budget: costBudgetN,
            revenueBudget: revenueBudgetN,
          },
        });
        result.updated += 1;
      } else {
        await db.project.create({
          data: {
            organizationId: organization.id,
            name,
            projectCode: projectCode || null,
            customerId,
            billingMethod,
            description: description || null,
            budget: costBudgetN,
            revenueBudget: revenueBudgetN,
          },
        });
        result.created += 1;
      }
    } catch (err) {
      result.errors.push({
        row: lineNo,
        message: err instanceof Error ? err.message : "Database write failed",
      });
    }
  }

  if (result.created > 0 || result.updated > 0) {
    await writeAuditLog({
      organizationId: organization.id,
      userId: user.id,
      action: "CREATE",
      entityType: "Project",
      entityId: "bulk-import",
      after: {
        importedBy: "csv",
        created: result.created,
        updated: result.updated,
        skipped: result.skipped,
        errors: result.errors.length,
      },
    });
    revalidatePath("/time/projects");
  }

  return result;
}

// ── Helpers ──────────────────────────────────────────────────────────────

/**
 * Minimal CSV row splitter. Handles double-quoted cells with embedded
 * commas + escaped double-quotes. Doesn't support CR/LF inside cells.
 */
function splitCsvRow(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (inQuotes) {
      if (c === '"' && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (c === '"') {
        inQuotes = false;
      } else {
        cur += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ",") {
      out.push(cur);
      cur = "";
    } else {
      cur += c;
    }
  }
  out.push(cur);
  return out;
}

function numericOrNull(s: string): number | null {
  if (!s) return null;
  const n = Number(s.replace(/,/g, ""));
  return Number.isFinite(n) ? n : null;
}
