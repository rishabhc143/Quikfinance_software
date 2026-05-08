import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requireOrganization } from "@/lib/auth-helpers";
import { SettingsShell } from "@/components/shared/settings-shell";
import { Card, CardContent } from "@/components/ui/card";
import {
  URL_TO_ENTITY_TYPE,
  type CustomFieldDataType,
} from "@/lib/sales/custom-fields";
import { CustomFieldsEditor } from "./editor";

export const metadata = { title: "Custom Fields" };

const ENTITY_LABEL: Record<string, string> = {
  INVOICE: "Invoices",
  QUOTE: "Quotes",
  SALES_ORDER: "Sales Orders",
  CUSTOMER: "Customers",
  DELIVERY_CHALLAN: "Delivery Challans",
  DEBIT_NOTE: "Debit Notes",
  CREDIT_NOTE: "Credit Notes",
};

export default async function CustomFieldsPage({
  params,
}: {
  params: { entityType: string };
}) {
  const { organization } = await requireOrganization();
  const entityType = URL_TO_ENTITY_TYPE[params.entityType];
  if (!entityType) notFound();

  const definitions = await db.customFieldDefinition.findMany({
    where: {
      organizationId: organization.id,
      entityType,
      deletedAt: null,
    },
    orderBy: [{ position: "asc" }, { createdAt: "asc" }],
  });

  return (
    <SettingsShell
      title={`${ENTITY_LABEL[entityType] ?? entityType} — Custom Fields`}
      description="Add custom fields to capture extra information on this document type. Fields show up on the form, and optionally on the PDF and customer portal."
    >
      <Card>
        <CardContent className="pt-6">
          <CustomFieldsEditor
            entityType={entityType}
            definitions={definitions.map((d) => ({
              id: d.id,
              fieldKey: d.fieldKey,
              label: d.label,
              dataType: d.dataType as CustomFieldDataType,
              options: (d.options as { label: string; value: string }[] | null) ?? null,
              isRequired: d.isRequired,
              showOnPdf: d.showOnPdf,
              showOnPortal: d.showOnPortal,
              position: d.position,
            }))}
          />
        </CardContent>
      </Card>
    </SettingsShell>
  );
}
