import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ImportWizard } from "./wizard";

export const metadata = { title: "Import Items" };

export default function ImportItemsPage() {
  return (
    <div className="p-6 max-w-4xl mx-auto space-y-4">
      <div className="flex items-center gap-2">
        <Button asChild variant="ghost" size="icon"><Link href="/items"><ArrowLeft className="h-4 w-4" /></Link></Button>
        <h1 className="text-xl font-semibold">Import Items</h1>
      </div>
      <ImportWizard />
    </div>
  );
}
