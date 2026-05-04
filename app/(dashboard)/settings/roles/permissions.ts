export const PERMISSION_KEYS = [
  "items.read", "items.write", "items.delete",
  "contacts.read", "contacts.write", "contacts.delete",
  "invoices.read", "invoices.write", "invoices.delete",
  "bills.read", "bills.write", "bills.delete",
  "payments.read", "payments.write",
  "banking.read", "banking.write",
  "accountant.read", "accountant.write",
  "reports.read", "reports.export",
  "settings.read", "settings.write",
  "users.invite", "users.remove",
] as const;

export type PermissionKey = (typeof PERMISSION_KEYS)[number];
