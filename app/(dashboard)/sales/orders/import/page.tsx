import { BackLink } from "@/components/shared/dirty-form-nav";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SalesImportWizard } from "@/components/shared/sales-import-wizard";
import { importSalesOrdersAction } from "./actions";

export const metadata = { title: "Import Sales Orders" };

const SAMPLE_CSV = `salesOrderNumber,referenceNumber,customerName,orderDate,expectedShipmentDate,total,currency,customerNotes
SO-00001,PO-A-100,Acme Holdings,2026-05-01,2026-05-15,18000,INR,Initial onboarding
,PO-B-200,Demo Co,2026-05-05,2026-05-20,4500,INR,Reorder
`;

export default function ImportSalesOrdersPage() {
  return (
    <div className="p-6 max-w-4xl mx-auto space-y-4">
      <div className="flex items-center gap-2">
        <Button asChild variant="ghost" size="icon" aria-label="Back">
          <BackLink href="/sales/orders"><ArrowLeft className="h-4 w-4" /></BackLink>
        </Button>
        <h1 className="text-xl font-semibold">Import Sales Orders</h1>
      </div>
      <SalesImportWizard
        entityLabel="Sales Orders"
        sampleCsv={SAMPLE_CSV}
        sampleFilename="quikfinance-sales-orders-sample.csv"
        redirectAfter="/sales/orders"
        action={importSalesOrdersAction}
      />
    </div>
  );
}
