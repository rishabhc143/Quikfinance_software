import { db } from "@/lib/db";

export async function nextDocumentNumber(organizationId: string, module: string) {
  const series = await db.numberSeries.upsert({
    where: { organizationId_module: { organizationId, module } },
    update: { nextValue: { increment: 1 } },
    create: { organizationId, module, prefix: defaultPrefix(module), nextValue: 2, padding: 5 },
  });
  const value = series.nextValue - 1;
  return `${series.prefix}${String(value).padStart(series.padding, "0")}`;
}

function defaultPrefix(module: string) {
  switch (module) {
    case "invoice": return "INV-";
    case "bill": return "BILL-";
    case "quote": return "QT-";
    case "salesOrder": return "SO-";
    case "purchaseOrder": return "PO-";
    case "creditNote": return "CN-";
    case "vendorCredit": return "VC-";
    case "paymentReceived": return "RCV-";
    case "paymentMade": return "PAY-";
    case "manualJournal": return "MJ-";
    case "deliveryChallan": return "DC-";
    default: return module.toUpperCase().slice(0, 4) + "-";
  }
}
