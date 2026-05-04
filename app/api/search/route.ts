import { NextResponse } from "next/server";
import { requireOrganization } from "@/lib/auth-helpers";
import { db } from "@/lib/db";

export async function GET(req: Request) {
  const { organization } = await requireOrganization();
  const q = new URL(req.url).searchParams.get("q")?.trim() ?? "";
  if (q.length < 2) return NextResponse.json([]);

  const [items, contacts, invoices, bills] = await Promise.all([
    db.item.findMany({
      where: { organizationId: organization.id, deletedAt: null, name: { contains: q, mode: "insensitive" } },
      take: 5,
      select: { id: true, name: true },
    }),
    db.contact.findMany({
      where: { organizationId: organization.id, deletedAt: null, displayName: { contains: q, mode: "insensitive" } },
      take: 5,
      select: { id: true, displayName: true },
    }),
    db.invoice.findMany({
      where: { organizationId: organization.id, deletedAt: null, number: { contains: q, mode: "insensitive" } },
      take: 5,
      select: { id: true, number: true },
    }),
    db.bill.findMany({
      where: { organizationId: organization.id, deletedAt: null, number: { contains: q, mode: "insensitive" } },
      take: 5,
      select: { id: true, number: true },
    }),
  ]);

  const results = [
    ...items.map((x) => ({ group: "items", id: x.id, label: x.name, href: `/items/${x.id}` })),
    ...contacts.map((x) => ({ group: "contacts", id: x.id, label: x.displayName, href: `/contacts/${x.id}` })),
    ...invoices.map((x) => ({ group: "invoices", id: x.id, label: x.number, href: `/sales/invoices/${x.id}` })),
    ...bills.map((x) => ({ group: "bills", id: x.id, label: x.number, href: `/purchases/bills/${x.id}` })),
  ];
  return NextResponse.json(results);
}
