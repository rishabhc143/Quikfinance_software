import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SalesImportWizard } from "@/components/shared/sales-import-wizard";
import { importDebitNotesAction } from "./actions";

export const metadata = { title: "Import Debit Notes" };

const SAMPLE_CSV = `debitNoteNumber,referenceNumber,customerName,debitNoteDate,total,currency,reason,customerNotes
DN-00001,REF-D1,Acme Holdings,2026-05-01,2500,INR,Late delivery surcharge,Per contract clause 8.2
,REF-D2,Demo Co,2026-05-05,500,INR,Restocking fee,
`;

const PAGE_TIPS = [
  "Each row must reference an existing customer by displayName (case-insensitive).",
  "Leave debitNoteNumber blank to auto-generate (DN-…) numbers.",
  "Total must be positive — debit notes increase the customer's receivable.",
  "Status defaults to OPEN; reason and customerNotes are optional.",
];

export default function ImportDebitNotesPage() {
  return (
    <div className="p-6 max-w-4xl mx-auto space-y-4">
      <div className="flex items-center gap-2">
        <Button asChild variant="ghost" size="icon" aria-label="Back">
          <Link href="/sales/debit-notes">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <h1 className="text-xl font-semibold">Import Debit Notes</h1>
      </div>
      <SalesImportWizard
        entityLabel="Debit Notes"
        sampleCsv={SAMPLE_CSV}
        sampleFilename="quikfinance-debit-notes-sample.csv"
        redirectAfter="/sales/debit-notes"
        action={importDebitNotesAction}
        pageTips={PAGE_TIPS}
      />
    </div>
  );
}
