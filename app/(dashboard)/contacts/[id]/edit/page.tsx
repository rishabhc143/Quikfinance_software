import { DirtyFormProvider, DirtyLink } from "@/components/shared/dirty-form-nav";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { db } from "@/lib/db";
import { requireOrganization } from "@/lib/auth-helpers";
import { Button } from "@/components/ui/button";
import { ContactForm, type ContactFormValues } from "../../contact-form";
import { updateContactAction } from "../../actions";

export default async function EditContactPage({ params }: { params: { id: string } }) {
  const { organization } = await requireOrganization();
  const c = await db.contact.findFirst({ where: { id: params.id, organizationId: organization.id, deletedAt: null } });
  if (!c) notFound();

  const initial: ContactFormValues = {
    type: c.type,
    displayName: c.displayName,
    companyName: c.companyName ?? "",
    email: c.email ?? "",
    phone: c.phone ?? "",
    billingAddress: c.billingAddress ?? "",
    shippingAddress: c.shippingAddress ?? "",
    taxId: c.taxId ?? "",
    currency: c.currency ?? "",
    notes: c.notes ?? "",
  };

  async function update(formData: FormData) {
    "use server";
    await updateContactAction(params.id, formData);
  }

  return (
    <DirtyFormProvider>
    <div className="p-6 max-w-4xl mx-auto space-y-4">
      <div className="flex items-center gap-2">
        <Button asChild variant="ghost" size="icon"><DirtyLink href={`/contacts/${c.id}`}><ArrowLeft className="h-4 w-4" /></DirtyLink></Button>
        <h1 className="text-xl font-semibold">Edit Contact</h1>
      </div>
      <ContactForm initial={initial} onSubmit={update} submitLabel="Update" />
    </div>
    </DirtyFormProvider>
  );
}
