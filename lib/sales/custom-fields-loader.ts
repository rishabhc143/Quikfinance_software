import { format } from "date-fns";
import { db } from "@/lib/db";

/**
 * M20: load custom fields visible on PDF or portal for a given entity.
 *
 * Returns rows of `{ label, value }` already stringified per dataType
 * — date values formatted as `dd MMM yyyy`, checkbox values as
 * "Yes" / "No", dropdown values resolved against their option label.
 * Null/empty values are filtered out.
 *
 * Used by:
 * - lib/sales/pdf-document.tsx (rendered as a small grid below totals)
 * - app/portal/invoices/[token]/page.tsx (rendered below customer notes)
 */

export type RenderableCustomField = { label: string; value: string };

type Surface = "pdf" | "portal";

export async function loadVisibleCustomFields(input: {
  organizationId: string;
  entityType: string; // "INVOICE", etc.
  entityId: string;
  surface: Surface;
}): Promise<RenderableCustomField[]> {
  const flag = input.surface === "pdf" ? "showOnPdf" : "showOnPortal";
  const definitions = await db.customFieldDefinition.findMany({
    where: {
      organizationId: input.organizationId,
      entityType: input.entityType,
      deletedAt: null,
      [flag]: true,
    },
    orderBy: [{ position: "asc" }, { createdAt: "asc" }],
  });
  if (definitions.length === 0) return [];

  const values = await db.customFieldValue.findMany({
    where: {
      organizationId: input.organizationId,
      entityType: input.entityType,
      entityId: input.entityId,
      fieldDefinitionId: { in: definitions.map((d) => d.id) },
    },
  });
  const valueByDefId = new Map(
    values.map((v) => [v.fieldDefinitionId, v.value])
  );

  const rows: RenderableCustomField[] = [];
  for (const def of definitions) {
    const raw = valueByDefId.get(def.id);
    const display = formatValue(def.dataType, raw, def.options);
    if (display === null || display === "") continue;
    rows.push({ label: def.label, value: display });
  }
  return rows;
}

function formatValue(
  dataType: string,
  raw: unknown,
  options: unknown
): string | null {
  if (raw === null || raw === undefined) return null;
  switch (dataType) {
    case "checkbox": {
      const v =
        raw === true ||
        raw === "true" ||
        raw === 1 ||
        raw === "1" ||
        raw === "yes";
      return v ? "Yes" : "No";
    }
    case "date": {
      try {
        const d = typeof raw === "string" || typeof raw === "number"
          ? new Date(raw)
          : null;
        if (!d || Number.isNaN(d.getTime())) return null;
        return format(d, "dd MMM yyyy");
      } catch {
        return null;
      }
    }
    case "dropdown": {
      const opts =
        Array.isArray(options)
          ? (options as { label: string; value: string }[])
          : [];
      const match = opts.find((o) => o.value === raw);
      return match ? match.label : String(raw);
    }
    default: {
      // text | number | email | url
      const s = String(raw).trim();
      return s.length > 0 ? s : null;
    }
  }
}
