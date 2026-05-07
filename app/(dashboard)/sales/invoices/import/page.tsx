import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SalesImportWizard } from "@/components/shared/sales-import-wizard";
import { importInvoicesAction } from "./actions";

export const metadata = { title: "Import Invoices" };

const SAMPLE_CSV = `invoiceNumber,referenceNumber,customerName,issueDate,dueDate,total,currency,customerNotes
INV-00001,REF-001,Acme Holdings,2026-05-01,2026-05-31,12000,INR,Q1 retainer
,REF-002,Demo Co,2026-05-05,2026-06-04,3500,INR,Reorder
`;

export default function ImportInvoicesPage() {
  return (
    <div className="p-6 max-w-4xl mx-auto space-y-4">
      <div className="flex items-center gap-2">
        <Button asChild variant="ghost" size="icon" aria-label="Back">
          <Link href="/sales/invoices">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <h1 className="text-xl font-semibold">Import Invoices</h1>
      </div>
      <SalesImportWizard
        entityLabel="Invoices"
        sampleCsv={SAMPLE_CSV}
        sampleFilename="quikfinance-invoices-sample.csv"
        redirectAfter="/sales/invoices"
        action={importInvoicesAction}
      />
    </div>
  );
}
