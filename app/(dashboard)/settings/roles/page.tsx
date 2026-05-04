import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { SettingsShell } from "@/components/shared/settings-shell";
import { Check, Minus } from "lucide-react";
import { db } from "@/lib/db";
import { requireOrganization } from "@/lib/auth-helpers";
import { CustomRolesManager } from "./manager";
import { PERMISSION_KEYS } from "./permissions";

const BUILTIN_ROLES = ["ADMIN", "STAFF", "ACCOUNTANT", "VIEWER"] as const;

const PERMISSIONS = [
  { area: "Organization", checks: { ADMIN: true, STAFF: false, ACCOUNTANT: false, VIEWER: false } },
  { area: "Manage users & roles", checks: { ADMIN: true, STAFF: false, ACCOUNTANT: false, VIEWER: false } },
  { area: "Items / Contacts CRUD", checks: { ADMIN: true, STAFF: true, ACCOUNTANT: true, VIEWER: false } },
  { area: "Invoices / Bills CRUD", checks: { ADMIN: true, STAFF: true, ACCOUNTANT: true, VIEWER: false } },
  { area: "Payments record", checks: { ADMIN: true, STAFF: true, ACCOUNTANT: true, VIEWER: false } },
  { area: "Banking reconciliation", checks: { ADMIN: true, STAFF: false, ACCOUNTANT: true, VIEWER: false } },
  { area: "Journal entries", checks: { ADMIN: true, STAFF: false, ACCOUNTANT: true, VIEWER: false } },
  { area: "Reports — view", checks: { ADMIN: true, STAFF: true, ACCOUNTANT: true, VIEWER: true } },
  { area: "Reports — export", checks: { ADMIN: true, STAFF: true, ACCOUNTANT: true, VIEWER: false } },
  { area: "Settings", checks: { ADMIN: true, STAFF: false, ACCOUNTANT: false, VIEWER: false } },
] as const;

export const metadata = { title: "Roles" };

export default async function RolesPage() {
  const { organization } = await requireOrganization();
  const customRoles = await db.customRole.findMany({
    where: { organizationId: organization.id },
    orderBy: { name: "asc" },
  });

  return (
    <SettingsShell title="Roles" description="Built-in roles plus custom roles you define for fine-grained access.">
      <Card>
        <CardHeader><CardTitle className="text-base">Built-in roles</CardTitle></CardHeader>
        <CardContent className="p-0">
          <table className="w-full text-sm">
            <thead className="bg-muted/30 text-xs uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="text-left p-3">Area</th>
                {BUILTIN_ROLES.map((r) => <th key={r} className="text-center p-3">{prettyRole(r)}</th>)}
              </tr>
            </thead>
            <tbody className="divide-y">
              {PERMISSIONS.map((p) => (
                <tr key={p.area}>
                  <td className="p-3">{p.area}</td>
                  {BUILTIN_ROLES.map((r) => (
                    <td key={r} className="p-3 text-center">
                      {p.checks[r]
                        ? <Check className="h-4 w-4 text-emerald-600 mx-auto" />
                        : <Minus className="h-4 w-4 text-muted-foreground mx-auto" />}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>

      <div className="grid gap-3 md:grid-cols-2">
        {BUILTIN_ROLES.map((r) => (
          <Card key={r}>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                {prettyRole(r)}
                <Badge variant="outline">Built-in</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="text-xs text-muted-foreground">
              {r === "ADMIN" && "Full access to everything in the organization, including users, settings, and billing."}
              {r === "STAFF" && "Day-to-day operators. Can manage items, contacts, sales, purchases, and payments. No settings."}
              {r === "ACCOUNTANT" && "Financial controllers. All STAFF permissions plus banking reconciliation and journal entries."}
              {r === "VIEWER" && "Read-only access to reports and lists. Cannot mutate any data."}
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">Custom roles</CardTitle></CardHeader>
        <CardContent>
          <CustomRolesManager
            allPermissions={[...PERMISSION_KEYS]}
            initial={customRoles.map((r) => ({
              id: r.id,
              name: r.name,
              description: r.description ?? "",
              permissions: Array.isArray(r.permissions) ? (r.permissions as string[]) : [],
            }))}
          />
        </CardContent>
      </Card>
    </SettingsShell>
  );
}

function prettyRole(r: string) {
  return r.charAt(0) + r.slice(1).toLowerCase();
}
