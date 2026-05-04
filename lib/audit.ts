import { db } from "@/lib/db";

type AuditAction = "CREATE" | "UPDATE" | "DELETE" | "RESTORE";

export async function writeAuditLog(args: {
  organizationId: string;
  userId: string | null;
  action: AuditAction;
  entityType: string;
  entityId: string;
  before?: unknown;
  after?: unknown;
}) {
  await db.auditLog.create({
    data: {
      organizationId: args.organizationId,
      userId: args.userId,
      action: args.action,
      entityType: args.entityType,
      entityId: args.entityId,
      before: args.before === undefined ? undefined : (args.before as object),
      after: args.after === undefined ? undefined : (args.after as object),
    },
  });
}
