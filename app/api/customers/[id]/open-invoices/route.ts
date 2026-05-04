import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireOrganization } from "@/lib/auth-helpers";

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const { organization } = await requireOrganization();
  const invoices = await db.invoice.findMany({
    where: {
      organizationId: organization.id, contactId: params.id, deletedAt: null,
      status: { in: ["SENT", "PARTIALLY_PAID", "OVERDUE"] },
    },
    orderBy: { dueDate: "asc" },
    select: { id: true, number: true, total: true, amountPaid: true, dueDate: true },
  });
  return NextResponse.json(invoices.map((i) => ({
    id: i.id, number: i.number, dueDate: i.dueDate.toISOString(),
    total: Number(i.total), amountPaid: Number(i.amountPaid),
  })));
}
