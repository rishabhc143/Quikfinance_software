import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SalesImportWizard } from "@/components/shared/sales-import-wizard";
import { importQuotesAction } from "./actions";

export const metadata = { title: "Import Quotes" };

const SAMPLE_CSV = `quoteNumber,referenceNumber,customerName,issueDate,expiryDate,subject,total,currency,status
QT-00001,REF-001,Demo Co,2026-05-01,2026-05-31,Q1 retainer,12500,INR,DRAFT
,REF-002,Acme Holdings,2026-05-10,2026-06-09,Onboarding services,75000,INR,DRAFT
`;

export default function ImportQuotesPage() {
  return (
    <div className="p-6 max-w-4xl mx-auto space-y-4">
      <div className="flex items-center gap-2">
        <Button asChild variant="ghost" size="icon" aria-label="Back">
          <Link href="/sales/quotes">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <h1 className="text-xl font-semibold">Import Quotes</h1>
      </div>
      <SalesImportWizard
        entityLabel="Quotes"
        sampleCsv={SAMPLE_CSV}
        sampleFilename="quikfinance-quotes-sample.csv"
        redirectAfter="/sales/quotes"
        action={importQuotesAction}
      />
    </div>
  );
}
