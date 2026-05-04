import { NextResponse } from "next/server";
import { requireOrganization } from "@/lib/auth-helpers";
import { db } from "@/lib/db";

export async function GET() {
  const { organization } = await requireOrganization();
  const rows = await db.auditLog.findMany({
    where: { organizationId: organization.id },
    orderBy: { createdAt: "desc" },
    take: 20,
    select: { id: true, action: true, entityType: true, entityId: true, createdAt: true },
  });
  return NextResponse.json(rows);
}
