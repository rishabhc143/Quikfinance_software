import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireOrganization } from "@/lib/auth-helpers";

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const { organization } = await requireOrganization();
  const bills = await db.bill.findMany({
    where: {
      organizationId: organization.id, contactId: params.id, deletedAt: null,
      status: { in: ["OPEN", "PARTIALLY_PAID", "OVERDUE"] },
    },
    orderBy: { dueDate: "asc" },
    select: { id: true, number: true, total: true, amountPaid: true, dueDate: true },
  });
  return NextResponse.json(bills.map((b) => ({
    id: b.id, number: b.number, dueDate: b.dueDate.toISOString(),
    total: Number(b.total), amountPaid: Number(b.amountPaid),
  })));
}
