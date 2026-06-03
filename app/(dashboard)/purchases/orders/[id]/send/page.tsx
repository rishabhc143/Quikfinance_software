import Link from "next/link";
import { BackLink } from "@/components/shared/dirty-form-nav";
import { notFound } from "next/navigation";
import { ArrowLeft, Send } from "lucide-react";
import { format } from "date-fns";
import { db } from "@/lib/db";
import { requireOrganization } from "@/lib/auth-helpers";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { sendPurchaseOrderAction } from "../../actions";
import { SendComposer } from "./composer";

export const metadata = { title: "Send Purchase Order" };

export default async function SendPurchaseOrderPage({
  params,
}: {
  params: { id: string };
}) {
  const { organization } = await requireOrganization();
  const po = await db.purchaseOrder.findFirst({
    where: {
      id: params.id,
      organizationId: organization.id,
      deletedAt: null,
    },
    include: {
      contact: { select: { id: true, displayName: true, email: true } },
    },
  });
  if (!po) notFound();

  if (po.status === "CLOSED" || po.status === "CANCELLED") notFound();

  const defaultSubject = `Purchase Order ${po.number} from ${organization.name}`;
  const defaultBody = `Hello,

Please find attached our Purchase Order ${po.number} dated ${format(
    po.orderDate,
    "dd MMM yyyy"
  )}${
    po.deliveryDate
      ? ` with an expected delivery on ${format(po.deliveryDate, "dd MMM yyyy")}`
      : ""
  }.

If you have any questions about the order, please reply to this email.

Thanks,
${organization.name}`;

  const action = sendPurchaseOrderAction.bind(null, po.id);

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-4">
      <nav aria-label="Breadcrumb" className="text-xs text-muted-foreground">
        <Link href="/purchases/orders" className="hover:underline">
          Purchase orders
        </Link>
        <span className="mx-1">/</span>
        <Link
          href={`/purchases/orders/${po.id}`}
          className="hover:underline"
        >
          {po.number}
        </Link>
        <span className="mx-1">/</span>
        <span aria-current="page">Send</span>
      </nav>
      <div className="flex items-center gap-2">
        <Button asChild variant="ghost" size="icon" aria-label="Back">
          <BackLink href={`/purchases/orders/${po.id}`}><ArrowLeft className="h-4 w-4" /></BackLink>
        </Button>
        <Send className="h-5 w-5 text-muted-foreground" />
        <h1 className="text-2xl font-semibold tracking-tight">
          Send {po.number}
        </h1>
      </div>

      <Card>
        <CardContent className="pt-6 space-y-4">
          <SendComposer
            action={action}
            defaultTo={po.contact.email ?? ""}
            vendorName={po.contact.displayName}
            defaultSubject={defaultSubject}
            defaultBody={defaultBody}
            poId={po.id}
          />
        </CardContent>
      </Card>
    </div>
  );
}
