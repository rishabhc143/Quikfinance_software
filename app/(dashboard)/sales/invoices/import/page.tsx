"use client";

import * as React from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SalesImportWizard } from "@/components/shared/sales-import-wizard";
import { importInvoicesAction } from "./actions";

const SAMPLE_CSV = `invoiceNumber,referenceNumber,customerName,issueDate,dueDate,total,currency,customerNotes
INV-00001,REF-001,Acme Holdings,2026-05-01,2026-05-31,12000,INR,Q1 retainer
,REF-002,Demo Co,2026-05-05,2026-06-04,3500,INR,Reorder
`;

const PAGE_TIPS = [
  "Import data with the details of GST Treatment by referring to the accepted formats.",
  "You can download the sample CSV file to get detailed information about the data fields used while importing.",
  "If you have files in other formats, you can convert them to an accepted file format using any online/offline converter.",
  "You can configure your import settings and save them for future imports too.",
];

export default function ImportInvoicesPage() {
  // M17f: 3 invoice-specific checkboxes per Invoices Refinement Patch
  const [autoGenerateNumbers, setAutoGenerateNumbers] = React.useState(false);
  const [linkSalesOrders, setLinkSalesOrders] = React.useState(false);
  const [mapAddresses, setMapAddresses] = React.useState(false);

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
        action={async ({ csvText, dupHandling }) =>
          importInvoicesAction({
            csvText,
            dupHandling,
            autoGenerateNumbers,
            linkSalesOrders,
            mapAddresses,
          })
        }
        extraOptions={
          <fieldset className="space-y-2">
            <legend className="text-sm font-medium">Import options</legend>
            <label className="flex items-start gap-2 text-sm">
              <input
                type="checkbox"
                checked={autoGenerateNumbers}
                onChange={(e) => setAutoGenerateNumbers(e.target.checked)}
                className="mt-1"
              />
              <div>
                <div>Auto-Generate Invoice Numbers</div>
                <div className="text-xs text-muted-foreground">
                  Invoice numbers will be generated automatically according to
                  your settings. Any Invoice numbers in the import file will be
                  ignored.
                </div>
              </div>
            </label>
            <label className="flex items-start gap-2 text-sm">
              <input
                type="checkbox"
                checked={linkSalesOrders}
                onChange={(e) => setLinkSalesOrders(e.target.checked)}
                className="mt-1"
              />
              <div>
                <div>Link Invoices to corresponding Sales Orders</div>
                <div className="text-xs text-muted-foreground">
                  If enabled, you must map the Sales Order field to the column
                  containing Sales Order numbers in the next step.
                </div>
              </div>
            </label>
            <label className="flex items-start gap-2 text-sm">
              <input
                type="checkbox"
                checked={mapAddresses}
                onChange={(e) => setMapAddresses(e.target.checked)}
                className="mt-1"
              />
              <div>
                <div>Map customers&apos; addresses to their records</div>
                <div className="text-xs text-muted-foreground">
                  Customer names from the import file will be matched against
                  existing customers in Quikfinance. Addresses will be mapped
                  to the matched customer record; if no match exists a new
                  customer is created.
                </div>
              </div>
            </label>
          </fieldset>
        }
        pageTips={PAGE_TIPS}
      />
    </div>
  );
}
