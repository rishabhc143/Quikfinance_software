"use server";

import { revalidatePath } from "next/cache";
import { parse } from "csv-parse/sync";
import { db } from "@/lib/db";
import { requireOrganization } from "@/lib/auth-helpers";
import { writeAuditLog } from "@/lib/audit";
import { getNextDocumentNumber } from "@/lib/sales/numbering";

export type DupHandling = "skip" | "overwrite";

export type ImportResult = {
  parsed: number;
  created: number;
  updated: number;
  skipped: number;
  errors: { row: number; message: string }[];
};

const HEADER_ALIASES: Record<string, string> = {
  "invoice number": "invoiceNumber",
  "invoice#": "invoiceNumber",
  "number": "invoiceNumber",
  "reference number": "referenceNumber",
  "reference#": "referenceNumber",
  "customer name": "customerName",
  "customer": "customerName",
  "issue date": "issueDate",
  "invoice date": "issueDate",
  "date": "issueDate",
  "due date": "dueDate",
  "amount": "total",
  "total": "total",
  "currency": "currency",
  "status": "status",
  "notes": "customerNotes",
  // M28: Sales Order linking
  "sales order number": "salesOrderNumber",
  "sales order#": "salesOrderNumber",
  "so#": "salesOrderNumber",
  "so number": "salesOrderNumber",
  // M28: address mapping (billing)
  "billing address line 1": "billingAddressLine1",
  "billing address line1": "billingAddressLine1",
  "billing address1": "billingAddressLine1",
  "billing address line 2": "billingAddressLine2",
  "billing address line2": "billingAddressLine2",
  "billing address2": "billingAddressLine2",
  "billing city": "billingCity",
  "billing state": "billingState",
  "billing zip": "billingZipCode",
  "billing zipcode": "billingZipCode",
  "billing zip code": "billingZipCode",
  "billing postcode": "billingZipCode",
  "billing country": "billingCountry",
  // M28: address mapping (shipping)
  "shipping address line 1": "shippingAddressLine1",
  "shipping address line1": "shippingAddressLine1",
  "shipping address1": "shippingAddressLine1",
  "shipping address line 2": "shippingAddressLine2",
  "shipping address line2": "shippingAddressLine2",
  "shipping address2": "shippingAddressLine2",
  "shipping city": "shippingCity",
  "shipping state": "shippingState",
  "shipping zip": "shippingZipCode",
  "shipping zipcode": "shippingZipCode",
  "shipping zip code": "shippingZipCode",
  "shipping postcode": "shippingZipCode",
  "shipping country": "shippingCountry",
};

function normalizeHeader(h: string): string {
  return (HEADER_ALIASES[h.trim().toLowerCase()] ?? h.trim()).slice(0, 80);
}

export async function importInvoicesAction(input: {
  csvText: string;
  dupHandling: DupHandling;
  // M28: Invoices Refinement Patch import options now functional.
  // - autoGenerateNumbers: when true, force getNextDocumentNumber to
  //   pick the number even if the CSV row supplies an invoiceNumber.
  //   Default behavior (flag off) honours the CSV value.
  // - linkSalesOrders: when true, the row's salesOrderNumber column
  //   is looked up and the matching SalesOrder.convertedInvoiceId is
  //   flipped to point at the new Invoice + status set to CLOSED.
  //   Missing/typo'd SO numbers add a non-fatal error to the result.
  // - mapAddresses: when true, billing/shipping address columns
  //   (billingAddressLine1, billingCity, billingState, billingZipCode,
  //   billingCountry, and shipping equivalents) are upserted onto a
  //   ContactAddress row for the customer (kind=billing/shipping).
  //   Existing rows of the same kind are replaced wholesale.
  autoGenerateNumbers?: boolean;
  linkSalesOrders?: boolean;
  mapAddresses?: boolean;
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
    const customerName = r.customerName?.trim();
    if (!customerName) {
      result.errors.push({ row: i + 2, message: "customerName missing" });
      continue;
    }
    const contact = await db.contact.findFirst({
      where: {
        organizationId: organization.id,
        displayName: customerName,
        deletedAt: null,
      },
      select: { id: true },
    });
    if (!contact) {
      result.errors.push({
        row: i + 2,
        message: `customer "${customerName}" not found`,
      });
      continue;
    }

    const total = Number((r.total ?? "0").trim());
    if (Number.isNaN(total)) {
      result.errors.push({ row: i + 2, message: "total is not a number" });
      continue;
    }
    const issueDate = r.issueDate?.trim() ? new Date(r.issueDate.trim()) : new Date();
    let dueDate: Date;
    if (r.dueDate?.trim()) {
      dueDate = new Date(r.dueDate.trim());
    } else {
      dueDate = new Date(issueDate);
      dueDate.setDate(dueDate.getDate() + 30);
    }
    const invoiceNumber = r.invoiceNumber?.trim() || null;

    try {
      let existing: { id: string; status: string } | null = null;
      if (invoiceNumber) {
        existing = await db.invoice.findFirst({
          where: {
            organizationId: organization.id,
            number: invoiceNumber,
            deletedAt: null,
          },
          select: { id: true, status: true },
        });
      }

      if (existing) {
        if (input.dupHandling === "skip") {
          result.skipped += 1;
        } else {
          if (
            existing.status === "PAID" ||
            existing.status === "PARTIALLY_PAID" ||
            existing.status === "VOID" ||
            existing.status === "WRITTEN_OFF"
          ) {
            result.errors.push({
              row: i + 2,
              message: `Invoice ${invoiceNumber} is ${existing.status}, cannot overwrite`,
            });
            continue;
          }
          await db.invoice.update({
            where: { id: existing.id },
            data: {
              referenceNumber: r.referenceNumber || null,
              contactId: contact.id,
              issueDate,
              dueDate,
              currency: r.currency?.trim() || organization.currency,
              subtotal: total,
              total,
              customerNotes: r.customerNotes || null,
            },
          });
          result.updated += 1;
        }
      } else {
        // M28: autoGenerateNumbers forces a fresh number even if the
        // CSV column had a value
        const number = input.autoGenerateNumbers
          ? await getNextDocumentNumber(organization.id, "INVOICE")
          : invoiceNumber ?? (await getNextDocumentNumber(organization.id, "INVOICE"));
        const created = await db.invoice.create({
          data: {
            organizationId: organization.id,
            number,
            referenceNumber: r.referenceNumber || null,
            contactId: contact.id,
            status: "DRAFT",
            issueDate,
            dueDate,
            currency: r.currency?.trim() || organization.currency,
            subtotal: total,
            total,
            amountPaid: 0,
            customerNotes: r.customerNotes || null,
            notes: r.customerNotes || null,
            lineItems: {
              create: [
                {
                  description: r.customerNotes?.slice(0, 200) || "Imported invoice",
                  quantity: 1,
                  rate: total,
                  amount: total,
                },
              ],
            },
          },
        });
        result.created += 1;

        // M28: Link to Sales Order — when the row carries a
        // salesOrderNumber and the option is on, find the SO by
        // (orgId, number) and flip its convertedInvoiceId so the SO
        // shows as Invoiced.
        if (input.linkSalesOrders) {
          const soNumber = r.salesOrderNumber?.trim();
          if (soNumber) {
            const so = await db.salesOrder.findFirst({
              where: {
                organizationId: organization.id,
                number: soNumber,
                deletedAt: null,
              },
              select: { id: true, convertedInvoiceId: true },
            });
            if (so && !so.convertedInvoiceId) {
              await db.salesOrder.update({
                where: { id: so.id },
                data: {
                  convertedInvoiceId: created.id,
                  status: "CLOSED",
                },
              });
            } else if (!so) {
              result.errors.push({
                row: i + 2,
                message: `Sales Order "${soNumber}" not found — invoice imported without SO link`,
              });
            }
          }
        }

        // M28: Map addresses — when the row carries any billing/
        // shipping address columns and the option is on, upsert a
        // ContactAddress row for the customer (kind=billing/shipping).
        // Existing rows of the same kind are replaced wholesale to
        // keep the relationship 1:1 per kind.
        if (input.mapAddresses) {
          const billingFields = {
            addressLine1: r.billingAddressLine1?.trim() || null,
            addressLine2: r.billingAddressLine2?.trim() || null,
            city: r.billingCity?.trim() || null,
            state: r.billingState?.trim() || null,
            zipCode: r.billingZipCode?.trim() || null,
            country: r.billingCountry?.trim() || "India",
          };
          const hasBilling = Object.entries(billingFields).some(
            ([k, v]) => k !== "country" && v
          );
          if (hasBilling) {
            await db.contactAddress.deleteMany({
              where: { contactId: contact.id, kind: "billing" },
            });
            await db.contactAddress.create({
              data: {
                contactId: contact.id,
                kind: "billing",
                isDefault: true,
                ...billingFields,
              },
            });
          }
          const shippingFields = {
            addressLine1: r.shippingAddressLine1?.trim() || null,
            addressLine2: r.shippingAddressLine2?.trim() || null,
            city: r.shippingCity?.trim() || null,
            state: r.shippingState?.trim() || null,
            zipCode: r.shippingZipCode?.trim() || null,
            country: r.shippingCountry?.trim() || "India",
          };
          const hasShipping = Object.entries(shippingFields).some(
            ([k, v]) => k !== "country" && v
          );
          if (hasShipping) {
            await db.contactAddress.deleteMany({
              where: { contactId: contact.id, kind: "shipping" },
            });
            await db.contactAddress.create({
              data: {
                contactId: contact.id,
                kind: "shipping",
                ...shippingFields,
              },
            });
          }
        }
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
    entityType: "InvoiceImport",
    entityId: `import-${Date.now()}`,
    after: {
      parsed: result.parsed,
      created: result.created,
      updated: result.updated,
      skipped: result.skipped,
      errors: result.errors.length,
      autoGenerateNumbers: !!input.autoGenerateNumbers,
      linkSalesOrders: !!input.linkSalesOrders,
      mapAddresses: !!input.mapAddresses,
    },
  });

  revalidatePath("/sales/invoices");
  return result;
}
