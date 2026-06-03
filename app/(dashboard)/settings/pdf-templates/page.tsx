import { DirtyFormProvider } from "@/components/shared/dirty-form-nav";
import { db } from "@/lib/db";
import { requireOrganization } from "@/lib/auth-helpers";
import { Card, CardContent } from "@/components/ui/card";
import { SettingsShell } from "@/components/shared/settings-shell";
import { PdfTemplateForm } from "./form";

export const metadata = { title: "PDF Templates" };

export default async function PdfTemplatesPage() {
  const { organization } = await requireOrganization();
  const prefs = await db.organizationPreference.upsert({
    where: { organizationId: organization.id }, update: {},
    create: { organizationId: organization.id },
  });
  return (
    <DirtyFormProvider><SettingsShell title="PDF Templates" description="Customize the layout of invoices, quotes, and receipts.">
      <Card><CardContent className="pt-6"><PdfTemplateForm initial={prefs.pdfTemplate} /></CardContent></Card>
    </SettingsShell></DirtyFormProvider>
  );
}
