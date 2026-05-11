"use server";

import { revalidatePath } from "next/cache";
import { parse } from "csv-parse/sync";
import { db } from "@/lib/db";
import { requireOrganization } from "@/lib/auth-helpers";
import { writeAuditLog } from "@/lib/audit";

/**
 * Vendor import server actions.
 *
 * Mirrors the customer-side import flow (`app/(dashboard)/sales/
 * customers/import/actions.ts`) but writes Contact rows with
 * type=VENDOR and supports vendor-specific columns (MSME registration
 * fields, default TDS, GSTIN).
 *
 * Contact-persons + addresses imports are scaffolded in the UI but
 * the server-side commit is deferred — they need their own
 * column-mapping screens to disambiguate which vendor each row
 * belongs to. For now the action returns a clear "deferred" message
 * so the UI surfaces it.
 */

export type VendorDupHandling = "skip" | "overwrite" | "add_as_new";

export type VendorImportResult = {
  parsed: number;
  created: number;
  updated: number;
  skipped: number;
  errors: { row: number; message: string }[];
};

/**
 * Header aliases — let the importer accept the most common spellings
 * users actually write. The right-hand value is the canonical
 * VendorInput field name.
 */
const HEADER_ALIASES: Record<string, string> = {
  // identifiers
  "display name": "displayName",
  "vendor name": "displayName",
  "name": "displayName",
  "company name": "companyName",
  "company": "companyName",
  // contact
  "email": "email",
  "email address": "email",
  "phone": "workPhone",
  "work phone": "workPhone",
  "mobile": "mobile",
  "first name": "firstName",
  "last name": "lastName",
  "salutation": "salutation",
  // tax
  "gstin": "gstin",
  "gst": "gstin",
  "pan": "pan",
  "place of supply": "placeOfSupply",
  // money
  "currency": "currency",
  "opening balance": "openingBalance",
  // msme
  "msme number": "msmeNumber",
  "msme registered": "msmeRegistered",
  "msme category": "msmeCategory",
  // misc
  "notes": "notes",
  "website": "websiteUrl",
};

function normalizeHeader(h: string): string {
  return (HEADER_ALIASES[h.trim().toLowerCase()] ?? h.trim()).slice(0, 80);
}

function parseBool(v: string | undefined): boolean | null {
  if (v == null) return null;
  const t = v.trim().toLowerCase();
  if (!t) return null;
  if (["true", "yes", "1", "y"].includes(t)) return true;
  if (["false", "no", "0", "n"].includes(t)) return false;
  return null;
}

/**
 * Apply a single CSV row to a Contact upsert. Returns one of
 * "created" / "updated" / "skipped" for accounting. Throws on errors
 * the caller is expected to log per-row.
 */
async function applyRow(
  organizationId: string,
  data: Record<string, unknown> & { displayName: string },
  dupHandling: VendorDupHandling
): Promise<"created" | "updated" | "skipped"> {
  const existing = await db.contact.findFirst({
    where: {
      organizationId,
      displayName: data.displayName,
      type: { in: ["VENDOR", "BOTH"] },
      deletedAt: null,
    },
    select: { id: true },
  });

  if (existing) {
    if (dupHandling === "skip") return "skipped";
    if (dupHandling === "overwrite") {
      await db.contact.update({
        where: { id: existing.id },
        data: { ...data, type: "VENDOR" },
      });
      return "updated";
    }
    // add_as_new — append a numeric suffix to deduplicate the
    // displayName key.
    const stamped = `${data.displayName} (${Date.now().toString().slice(-4)})`;
    await db.contact.create({
      data: {
        ...data,
        displayName: stamped,
        organizationId,
        type: "VENDOR",
      },
    });
    return "created";
  }

  await db.contact.create({
    data: {
      ...data,
      organizationId,
      type: "VENDOR",
    },
  });
  return "created";
}

export async function importVendorsAction(input: {
  csvText: string;
  dupHandling: VendorDupHandling;
}): Promise<VendorImportResult> {
  const { user, organization } = await requireOrganization();
  const result: VendorImportResult = {
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
      errors: [
        { row: 0, message: `CSV parse failed: ${(err as Error).message}` },
      ],
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

    // Coerce CSV strings into Contact column shapes. Everything else
    // is left as null when unset — `applyRow` writes them as-is.
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
      placeOfSupply: r.placeOfSupply?.trim() || null,
      websiteUrl: r.websiteUrl?.trim() || null,
      notes: r.notes?.trim() || null,
      msmeRegistered: parseBool(r.msmeRegistered),
      msmeNumber: r.msmeNumber?.trim() || null,
      msmeCategory: r.msmeCategory?.trim()?.toUpperCase() || null,
      openingBalance: r.openingBalance?.trim()
        ? Number(r.openingBalance.trim())
        : null,
    };

    try {
      const outcome = await applyRow(organization.id, data, input.dupHandling);
      result[outcome] += 1;
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
    entityType: "VendorImport",
    entityId: `import-${Date.now()}`,
    after: {
      parsed: result.parsed,
      created: result.created,
      updated: result.updated,
      skipped: result.skipped,
      errors: result.errors.length,
    },
  });

  revalidatePath("/purchases/vendors");
  return result;
}

/**
 * Export modes per the master prompt's <vendors_spec>. The third
 * option (addresses) is vendor-specific and NOT on the Customer
 * export modal.
 */
export type VendorExportMode = "vendors" | "contact_persons" | "addresses";

export type VendorExportResult = {
  filename: string;
  csv: string;
  rowCount: number;
};

function csvCell(v: unknown): string {
  if (v == null) return "";
  const s = String(v);
  if (s.includes(",") || s.includes('"') || s.includes("\n")) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

function csvLine(cells: unknown[]): string {
  return cells.map(csvCell).join(",");
}

/**
 * Export vendors / contact persons / addresses for the current org
 * as CSV. The returned string is sent back to the client which
 * builds the download. Per the spec we cap at 25k rows.
 */
export async function exportVendorsAction(input: {
  mode: VendorExportMode;
  scope: "all" | "active";
}): Promise<VendorExportResult> {
  const { user, organization } = await requireOrganization();
  const baseWhere = {
    organizationId: organization.id,
    type: { in: ["VENDOR", "BOTH"] as ("VENDOR" | "BOTH")[] },
    deletedAt: null,
    ...(input.scope === "active" ? { isInactive: false } : {}),
  };

  let lines: string[] = [];
  let rowCount = 0;
  let filename = "vendors.csv";

  if (input.mode === "vendors") {
    const vendors = await db.contact.findMany({
      where: baseWhere,
      orderBy: { displayName: "asc" },
      take: 25000,
      select: {
        displayName: true,
        companyName: true,
        salutation: true,
        firstName: true,
        lastName: true,
        email: true,
        workPhone: true,
        mobile: true,
        gstin: true,
        pan: true,
        currency: true,
        placeOfSupply: true,
        websiteUrl: true,
        isInactive: true,
        msmeRegistered: true,
        msmeNumber: true,
        msmeCategory: true,
        openingBalance: true,
        notes: true,
      },
    });
    lines = [
      csvLine([
        "Display Name",
        "Company Name",
        "Salutation",
        "First Name",
        "Last Name",
        "Email",
        "Work Phone",
        "Mobile",
        "GSTIN",
        "PAN",
        "Currency",
        "Place of Supply",
        "Website",
        "Active",
        "MSME Registered",
        "MSME Number",
        "MSME Category",
        "Opening Balance",
        "Notes",
      ]),
      ...vendors.map((v) =>
        csvLine([
          v.displayName,
          v.companyName,
          v.salutation,
          v.firstName,
          v.lastName,
          v.email,
          v.workPhone,
          v.mobile,
          v.gstin,
          v.pan,
          v.currency,
          v.placeOfSupply,
          v.websiteUrl,
          v.isInactive ? "No" : "Yes",
          v.msmeRegistered ? "Yes" : "No",
          v.msmeNumber,
          v.msmeCategory,
          v.openingBalance ? Number(v.openingBalance).toFixed(2) : "",
          v.notes,
        ])
      ),
    ];
    rowCount = vendors.length;
    filename = "vendors.csv";
  } else if (input.mode === "contact_persons") {
    const persons = await db.contactPerson.findMany({
      where: { contact: baseWhere },
      orderBy: [{ contactId: "asc" }, { isPrimary: "desc" }],
      take: 25000,
      select: {
        salutation: true,
        firstName: true,
        lastName: true,
        email: true,
        workPhone: true,
        mobile: true,
        designation: true,
        department: true,
        isPrimary: true,
        contact: { select: { displayName: true } },
      },
    });
    lines = [
      csvLine([
        "Vendor Display Name",
        "Salutation",
        "First Name",
        "Last Name",
        "Email",
        "Work Phone",
        "Mobile",
        "Designation",
        "Department",
        "Primary",
      ]),
      ...persons.map((p) =>
        csvLine([
          p.contact.displayName,
          p.salutation,
          p.firstName,
          p.lastName,
          p.email,
          p.workPhone,
          p.mobile,
          p.designation,
          p.department,
          p.isPrimary ? "Yes" : "No",
        ])
      ),
    ];
    rowCount = persons.length;
    filename = "vendor-contact-persons.csv";
  } else {
    // addresses
    const addresses = await db.contactAddress.findMany({
      where: { contact: baseWhere },
      orderBy: [{ contactId: "asc" }, { isDefault: "desc" }],
      take: 25000,
      select: {
        kind: true,
        attention: true,
        country: true,
        addressLine1: true,
        addressLine2: true,
        city: true,
        state: true,
        zipCode: true,
        phone: true,
        fax: true,
        isDefault: true,
        contact: { select: { displayName: true } },
      },
    });
    lines = [
      csvLine([
        "Vendor Display Name",
        "Kind",
        "Attention",
        "Country",
        "Address Line 1",
        "Address Line 2",
        "City",
        "State",
        "Pin Code",
        "Phone",
        "Fax",
        "Default",
      ]),
      ...addresses.map((a) =>
        csvLine([
          a.contact.displayName,
          a.kind,
          a.attention,
          a.country,
          a.addressLine1,
          a.addressLine2,
          a.city,
          a.state,
          a.zipCode,
          a.phone,
          a.fax,
          a.isDefault ? "Yes" : "No",
        ])
      ),
    ];
    rowCount = addresses.length;
    filename = "vendor-addresses.csv";
  }

  // `EXPORT` isn't in the AuditAction union — reuse `UPDATE` with a
  // descriptive entityType so the trail stays searchable. The actual
  // export shape is captured in the `after` payload.
  await writeAuditLog({
    organizationId: organization.id,
    userId: user.id,
    action: "UPDATE",
    entityType: "VendorExport",
    entityId: `export-${Date.now()}`,
    after: { mode: input.mode, scope: input.scope, rowCount },
  });

  return { csv: lines.join("\n"), rowCount, filename };
}
