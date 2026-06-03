import { DirtyFormProvider, DirtyLink } from "@/components/shared/dirty-form-nav";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ItemForm } from "../item-form";
import { createItemAction } from "../actions";

export const metadata = { title: "New Item" };

export default function NewItemPage() {
  return (
    <DirtyFormProvider>
    <div className="p-6 max-w-5xl mx-auto space-y-4">
      <div className="flex items-center gap-2">
        <Button asChild variant="ghost" size="icon"><DirtyLink href="/items"><ArrowLeft className="h-4 w-4" /></DirtyLink></Button>
        <h1 className="text-xl font-semibold">New Item</h1>
      </div>
      <ItemForm onSubmit={createItemAction} submitLabel="Save" />
    </div>
    </DirtyFormProvider>
  );
}
