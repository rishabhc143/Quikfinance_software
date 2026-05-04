"""Batch-write Reminders, Workflow Rules/Actions/Logs/Schedules, Reporting Tags, Web Tabs."""
from pathlib import Path

ROOT = Path(r"C:\Users\user\Quikfinance\app\(dashboard)\settings")
FILES: dict[str, str] = {}

# Helper components reused across pages
LIST_HEADER_PAGE = '''import {{ db }} from "@/lib/db";
import {{ requireOrganization }} from "@/lib/auth-helpers";
import {{ Card, CardContent }} from "@/components/ui/card";
import {{ SettingsShell }} from "@/components/shared/settings-shell";
import {{ {form_name} }} from "./manager";

export const metadata = {{ title: "{title}" }};

export default async function Page() {{
  const {{ organization }} = await requireOrganization();
  const rows = await db.{model}.findMany({{
    where: {{ organizationId: organization.id }},
    orderBy: {{ {orderBy} }},
  }});
  return (
    <SettingsShell title="{title}" description="{description}">
      <Card><CardContent className="pt-6"><{form_name} initial={{rows.map((r) => ({mapper}))}} /></CardContent></Card>
    </SettingsShell>
  );
}}
'''

# ───────── Reminders ─────────
FILES["reminders/page.tsx"] = '''import { db } from "@/lib/db";
import { requireOrganization } from "@/lib/auth-helpers";
import { Card, CardContent } from "@/components/ui/card";
import { SettingsShell } from "@/components/shared/settings-shell";
import { RemindersManager } from "./manager";

export const metadata = { title: "Reminders" };

export default async function RemindersPage() {
  const { organization } = await requireOrganization();
  const rows = await db.reminder.findMany({ where: { organizationId: organization.id }, orderBy: { name: "asc" } });
  return (
    <SettingsShell title="Reminders" description="Automated reminders for unpaid invoices and overdue bills.">
      <Card><CardContent className="pt-6">
        <RemindersManager initial={rows.map((r) => ({ id: r.id, name: r.name, appliesTo: r.appliesTo, daysBefore: r.daysBefore, daysAfter: r.daysAfter, isActive: r.isActive, template: r.template ?? "" }))} />
      </CardContent></Card>
    </SettingsShell>
  );
}
'''
FILES["reminders/actions.ts"] = '''"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireOrganization } from "@/lib/auth-helpers";
import { writeAuditLog } from "@/lib/audit";

const schema = z.object({
  name: z.string().min(1).max(120),
  appliesTo: z.enum(["invoice", "bill", "estimate"]),
  daysBefore: z.coerce.number().int().min(0).max(365).default(0),
  daysAfter: z.coerce.number().int().min(0).max(365).default(0),
  template: z.string().max(2000).optional().nullable(),
});

export async function createReminderAction(formData: FormData) {
  const { user, organization } = await requireOrganization();
  const data = schema.parse({
    name: formData.get("name"),
    appliesTo: formData.get("appliesTo"),
    daysBefore: formData.get("daysBefore") || 0,
    daysAfter: formData.get("daysAfter") || 0,
    template: formData.get("template") || null,
  });
  const created = await db.reminder.create({ data: { organizationId: organization.id, ...data, template: data.template ?? null } });
  await writeAuditLog({ organizationId: organization.id, userId: user.id, action: "CREATE", entityType: "Reminder", entityId: created.id, after: { name: data.name } });
  revalidatePath("/settings/reminders");
}

export async function setReminderActiveAction(id: string, isActive: boolean) {
  const { user, organization } = await requireOrganization();
  await db.reminder.update({ where: { id }, data: { isActive } });
  await writeAuditLog({ organizationId: organization.id, userId: user.id, action: "UPDATE", entityType: "Reminder", entityId: id, after: { isActive } });
  revalidatePath("/settings/reminders");
}

export async function deleteReminderAction(id: string) {
  const { user, organization } = await requireOrganization();
  await db.reminder.delete({ where: { id } });
  await writeAuditLog({ organizationId: organization.id, userId: user.id, action: "DELETE", entityType: "Reminder", entityId: id });
  revalidatePath("/settings/reminders");
}
'''
FILES["reminders/manager.tsx"] = '''"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { createReminderAction, setReminderActiveAction, deleteReminderAction } from "./actions";
import { toast } from "sonner";

type Reminder = { id: string; name: string; appliesTo: string; daysBefore: number; daysAfter: number; isActive: boolean; template: string };

export function RemindersManager({ initial }: { initial: Reminder[] }) {
  const router = useRouter();
  const [showForm, setShowForm] = React.useState(false);
  const [busy, setBusy] = React.useState(false);

  async function create(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    try { await createReminderAction(new FormData(e.currentTarget)); toast.success("Reminder created"); setShowForm(false); router.refresh(); }
    catch (err) { toast.error(err instanceof Error ? err.message : "Save failed"); }
    finally { setBusy(false); }
  }
  async function toggle(id: string, v: boolean) { await setReminderActiveAction(id, v); router.refresh(); }
  async function remove(id: string) { if (!confirm("Delete this reminder?")) return; await deleteReminderAction(id); router.refresh(); }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">{initial.length} reminder{initial.length === 1 ? "" : "s"}</p>
        <Button size="sm" onClick={() => setShowForm((s) => !s)} variant={showForm ? "outline" : "default"}>
          {showForm ? "Cancel" : <><Plus className="h-3.5 w-3.5 mr-1" /> New reminder</>}
        </Button>
      </div>
      {showForm && (
        <form onSubmit={create} className="rounded-md border p-4 space-y-3 bg-muted/20">
          <div><Label>Name</Label><Input name="name" required maxLength={120} placeholder="3 days before due" /></div>
          <div className="grid gap-3 md:grid-cols-3">
            <div>
              <Label>Applies to</Label>
              <select name="appliesTo" required className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm">
                <option value="invoice">Invoice</option><option value="bill">Bill</option><option value="estimate">Estimate</option>
              </select>
            </div>
            <div><Label>Days before due</Label><Input type="number" name="daysBefore" defaultValue={0} min={0} max={365} /></div>
            <div><Label>Days after due</Label><Input type="number" name="daysAfter" defaultValue={0} min={0} max={365} /></div>
          </div>
          <div><Label>Email template</Label><Textarea name="template" rows={3} placeholder="Hi {customer}, your invoice {number} is due in {days} days." /></div>
          <div className="flex justify-end"><Button type="submit" disabled={busy}>{busy && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}Create</Button></div>
        </form>
      )}
      <div className="rounded-md border divide-y">
        {initial.length === 0 ? (
          <div className="p-6 text-sm text-center text-muted-foreground">No reminders yet.</div>
        ) : initial.map((r) => (
          <div key={r.id} className="p-3 flex items-center gap-3 text-sm">
            <Switch checked={r.isActive} onCheckedChange={(v) => toggle(r.id, v)} />
            <div className="flex-1 min-w-0">
              <div className="font-medium">{r.name}</div>
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Badge variant="outline">{r.appliesTo}</Badge>
                {r.daysBefore > 0 && <span>{r.daysBefore}d before</span>}
                {r.daysAfter > 0 && <span>{r.daysAfter}d after</span>}
              </div>
            </div>
            <Button variant="ghost" size="icon" onClick={() => remove(r.id)} aria-label="Delete"><Trash2 className="h-4 w-4 text-destructive" /></Button>
          </div>
        ))}
      </div>
      <p className="text-xs text-muted-foreground">A daily worker will dispatch reminders matching due-date offsets. Worker process is queued for a future release; rules are recorded today.</p>
    </div>
  );
}
'''

# ───────── Workflow Rules ─────────
FILES["workflow-rules/page.tsx"] = '''import { db } from "@/lib/db";
import { requireOrganization } from "@/lib/auth-helpers";
import { Card, CardContent } from "@/components/ui/card";
import { SettingsShell } from "@/components/shared/settings-shell";
import { WorkflowRulesManager } from "./manager";

export const metadata = { title: "Workflow Rules" };

export default async function WorkflowRulesPage() {
  const { organization } = await requireOrganization();
  const rows = await db.workflowRule.findMany({ where: { organizationId: organization.id }, orderBy: { name: "asc" } });
  return (
    <SettingsShell title="Workflow Rules" description="Trigger actions when records change.">
      <Card><CardContent className="pt-6">
        <WorkflowRulesManager initial={rows.map((r) => ({ id: r.id, name: r.name, module: r.module, trigger: r.trigger, isActive: r.isActive }))} />
      </CardContent></Card>
    </SettingsShell>
  );
}
'''
FILES["workflow-rules/actions.ts"] = '''"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireOrganization } from "@/lib/auth-helpers";
import { writeAuditLog } from "@/lib/audit";

const schema = z.object({
  name: z.string().min(1).max(120),
  module: z.string().min(1).max(40),
  trigger: z.string().min(1).max(40),
});

export async function createWorkflowRuleAction(formData: FormData) {
  const { user, organization } = await requireOrganization();
  const data = schema.parse({ name: formData.get("name"), module: formData.get("module"), trigger: formData.get("trigger") });
  const created = await db.workflowRule.create({ data: { organizationId: organization.id, ...data, conditions: {}, actions: {} } });
  await writeAuditLog({ organizationId: organization.id, userId: user.id, action: "CREATE", entityType: "WorkflowRule", entityId: created.id, after: data });
  revalidatePath("/settings/workflow-rules");
}

export async function setWorkflowRuleActiveAction(id: string, isActive: boolean) {
  const { user, organization } = await requireOrganization();
  await db.workflowRule.update({ where: { id }, data: { isActive } });
  await writeAuditLog({ organizationId: organization.id, userId: user.id, action: "UPDATE", entityType: "WorkflowRule", entityId: id, after: { isActive } });
  revalidatePath("/settings/workflow-rules");
}

export async function deleteWorkflowRuleAction(id: string) {
  const { user, organization } = await requireOrganization();
  await db.workflowRule.delete({ where: { id } });
  await writeAuditLog({ organizationId: organization.id, userId: user.id, action: "DELETE", entityType: "WorkflowRule", entityId: id });
  revalidatePath("/settings/workflow-rules");
}
'''
FILES["workflow-rules/manager.tsx"] = '''"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { createWorkflowRuleAction, setWorkflowRuleActiveAction, deleteWorkflowRuleAction } from "./actions";
import { toast } from "sonner";

type Rule = { id: string; name: string; module: string; trigger: string; isActive: boolean };

export function WorkflowRulesManager({ initial }: { initial: Rule[] }) {
  const router = useRouter();
  const [showForm, setShowForm] = React.useState(false);
  const [busy, setBusy] = React.useState(false);

  async function create(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    try { await createWorkflowRuleAction(new FormData(e.currentTarget)); toast.success("Rule created"); setShowForm(false); router.refresh(); }
    catch (err) { toast.error(err instanceof Error ? err.message : "Save failed"); }
    finally { setBusy(false); }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">{initial.length} rule{initial.length === 1 ? "" : "s"}</p>
        <Button size="sm" onClick={() => setShowForm((s) => !s)} variant={showForm ? "outline" : "default"}>
          {showForm ? "Cancel" : <><Plus className="h-3.5 w-3.5 mr-1" /> New rule</>}
        </Button>
      </div>
      {showForm && (
        <form onSubmit={create} className="rounded-md border p-4 space-y-3 bg-muted/20">
          <div><Label>Name</Label><Input name="name" required maxLength={120} /></div>
          <div className="grid gap-3 md:grid-cols-2">
            <div>
              <Label>Module</Label>
              <select name="module" required className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm">
                <option>invoice</option><option>bill</option><option>contact</option><option>item</option><option>payment</option>
              </select>
            </div>
            <div>
              <Label>Trigger</Label>
              <select name="trigger" required className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm">
                <option value="created">On create</option><option value="updated">On update</option><option value="status_changed">On status change</option><option value="deleted">On delete</option>
              </select>
            </div>
          </div>
          <p className="text-xs text-muted-foreground">Conditions and action chain UI ship in a future release; rules saved today fire when their module/trigger pair matches.</p>
          <div className="flex justify-end"><Button type="submit" disabled={busy}>{busy && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}Create</Button></div>
        </form>
      )}
      <div className="rounded-md border divide-y">
        {initial.length === 0 ? (
          <div className="p-6 text-sm text-center text-muted-foreground">No rules yet.</div>
        ) : initial.map((r) => (
          <div key={r.id} className="p-3 flex items-center gap-3 text-sm">
            <Switch checked={r.isActive} onCheckedChange={async (v) => { await setWorkflowRuleActiveAction(r.id, v); router.refresh(); }} />
            <div className="flex-1 min-w-0">
              <div className="font-medium">{r.name}</div>
              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                <Badge variant="outline">{r.module}</Badge> <span>on</span> <Badge variant="outline">{r.trigger}</Badge>
              </div>
            </div>
            <Button variant="ghost" size="icon" onClick={async () => { if (confirm("Delete?")) { await deleteWorkflowRuleAction(r.id); router.refresh(); } }} aria-label="Delete"><Trash2 className="h-4 w-4 text-destructive" /></Button>
          </div>
        ))}
      </div>
    </div>
  );
}
'''

# ───────── Workflow Actions ─────────
FILES["workflow-actions/page.tsx"] = '''import { db } from "@/lib/db";
import { requireOrganization } from "@/lib/auth-helpers";
import { Card, CardContent } from "@/components/ui/card";
import { SettingsShell } from "@/components/shared/settings-shell";
import { WorkflowActionsManager } from "./manager";

export const metadata = { title: "Workflow Actions" };

export default async function WorkflowActionsPage() {
  const { organization } = await requireOrganization();
  const rows = await db.workflowAction.findMany({ where: { organizationId: organization.id }, orderBy: { name: "asc" } });
  return (
    <SettingsShell title="Workflow Actions" description="Reusable actions called by workflow rules.">
      <Card><CardContent className="pt-6">
        <WorkflowActionsManager initial={rows.map((r) => ({ id: r.id, name: r.name, kind: r.kind, isActive: r.isActive }))} />
      </CardContent></Card>
    </SettingsShell>
  );
}
'''
FILES["workflow-actions/actions.ts"] = '''"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireOrganization } from "@/lib/auth-helpers";
import { writeAuditLog } from "@/lib/audit";

const schema = z.object({
  name: z.string().min(1).max(120),
  kind: z.enum(["email", "webhook", "field-update", "create-task"]),
});

export async function createWorkflowActionAction(formData: FormData) {
  const { user, organization } = await requireOrganization();
  const data = schema.parse({ name: formData.get("name"), kind: formData.get("kind") });
  const created = await db.workflowAction.create({ data: { organizationId: organization.id, ...data, config: {} } });
  await writeAuditLog({ organizationId: organization.id, userId: user.id, action: "CREATE", entityType: "WorkflowAction", entityId: created.id, after: data });
  revalidatePath("/settings/workflow-actions");
}

export async function deleteWorkflowActionAction(id: string) {
  const { user, organization } = await requireOrganization();
  await db.workflowAction.delete({ where: { id } });
  await writeAuditLog({ organizationId: organization.id, userId: user.id, action: "DELETE", entityType: "WorkflowAction", entityId: id });
  revalidatePath("/settings/workflow-actions");
}
'''
FILES["workflow-actions/manager.tsx"] = '''"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { createWorkflowActionAction, deleteWorkflowActionAction } from "./actions";
import { toast } from "sonner";

type Action = { id: string; name: string; kind: string; isActive: boolean };

export function WorkflowActionsManager({ initial }: { initial: Action[] }) {
  const router = useRouter();
  const [showForm, setShowForm] = React.useState(false);
  const [busy, setBusy] = React.useState(false);

  async function create(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    try { await createWorkflowActionAction(new FormData(e.currentTarget)); toast.success("Action created"); setShowForm(false); router.refresh(); }
    catch (err) { toast.error(err instanceof Error ? err.message : "Save failed"); }
    finally { setBusy(false); }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">{initial.length} action{initial.length === 1 ? "" : "s"}</p>
        <Button size="sm" onClick={() => setShowForm((s) => !s)} variant={showForm ? "outline" : "default"}>
          {showForm ? "Cancel" : <><Plus className="h-3.5 w-3.5 mr-1" /> New action</>}
        </Button>
      </div>
      {showForm && (
        <form onSubmit={create} className="rounded-md border p-4 space-y-3 bg-muted/20">
          <div><Label>Name</Label><Input name="name" required maxLength={120} /></div>
          <div>
            <Label>Kind</Label>
            <select name="kind" required className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm">
              <option value="email">Send email</option><option value="webhook">POST webhook</option><option value="field-update">Update field</option><option value="create-task">Create task</option>
            </select>
          </div>
          <div className="flex justify-end"><Button type="submit" disabled={busy}>{busy && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}Create</Button></div>
        </form>
      )}
      <div className="rounded-md border divide-y">
        {initial.length === 0 ? (
          <div className="p-6 text-sm text-center text-muted-foreground">No actions yet.</div>
        ) : initial.map((a) => (
          <div key={a.id} className="p-3 flex items-center gap-3 text-sm">
            <div className="flex-1 min-w-0">
              <div className="font-medium">{a.name}</div>
              <Badge variant="outline" className="text-xs">{a.kind}</Badge>
            </div>
            <Button variant="ghost" size="icon" onClick={async () => { if (confirm("Delete?")) { await deleteWorkflowActionAction(a.id); router.refresh(); } }} aria-label="Delete"><Trash2 className="h-4 w-4 text-destructive" /></Button>
          </div>
        ))}
      </div>
    </div>
  );
}
'''

# ───────── Workflow Logs (read-only) ─────────
FILES["workflow-logs/page.tsx"] = '''import { format } from "date-fns";
import { db } from "@/lib/db";
import { requireOrganization } from "@/lib/auth-helpers";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { SettingsShell } from "@/components/shared/settings-shell";

export const metadata = { title: "Workflow Logs" };

export default async function WorkflowLogsPage() {
  const { organization } = await requireOrganization();
  const logs = await db.workflowLog.findMany({
    where: { organizationId: organization.id },
    orderBy: { createdAt: "desc" }, take: 100,
  });
  return (
    <SettingsShell title="Workflow Logs" description="Run history for every workflow execution. Last 100 entries.">
      <Card>
        <CardContent className="p-0">
          {logs.length === 0 ? (
            <div className="p-8 text-center text-sm text-muted-foreground">No workflow runs yet. Logs appear once the runner starts firing rules.</div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-muted/30 text-xs uppercase tracking-wider text-muted-foreground"><tr><th className="text-left p-3">When</th><th className="text-left p-3">Rule</th><th className="text-left p-3">Status</th><th className="text-left p-3">Message</th></tr></thead>
              <tbody className="divide-y">
                {logs.map((l) => (
                  <tr key={l.id}>
                    <td className="p-3 text-xs text-muted-foreground">{format(l.createdAt, "dd MMM yyyy HH:mm")}</td>
                    <td className="p-3 font-medium">{l.ruleName}</td>
                    <td className="p-3"><Badge variant={l.status === "success" ? "success" : l.status === "failed" ? "destructive" : "outline"}>{l.status}</Badge></td>
                    <td className="p-3 text-muted-foreground">{l.message ?? ""}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>
    </SettingsShell>
  );
}
'''

# ───────── Schedules ─────────
FILES["schedules/page.tsx"] = '''import { format } from "date-fns";
import { db } from "@/lib/db";
import { requireOrganization } from "@/lib/auth-helpers";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { SettingsShell } from "@/components/shared/settings-shell";
import { SchedulesManager } from "./manager";

export const metadata = { title: "Schedules" };

export default async function SchedulesPage() {
  const { organization } = await requireOrganization();
  const rows = await db.schedule.findMany({ where: { organizationId: organization.id }, orderBy: { name: "asc" } });
  return (
    <SettingsShell title="Schedules" description="Recurring jobs (book close, reminders dispatch, recurring invoices runner).">
      <Card><CardContent className="pt-6">
        <SchedulesManager initial={rows.map((s) => ({ id: s.id, name: s.name, cron: s.cron, taskKind: s.taskKind, isActive: s.isActive, lastRunAt: s.lastRunAt?.toISOString() ?? null }))} />
      </CardContent></Card>
    </SettingsShell>
  );
}
'''
FILES["schedules/actions.ts"] = '''"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireOrganization } from "@/lib/auth-helpers";
import { writeAuditLog } from "@/lib/audit";

const schema = z.object({
  name: z.string().min(1).max(120),
  cron: z.string().min(1).max(80),
  taskKind: z.string().min(1).max(40),
});

export async function createScheduleAction(formData: FormData) {
  const { user, organization } = await requireOrganization();
  const data = schema.parse({ name: formData.get("name"), cron: formData.get("cron"), taskKind: formData.get("taskKind") });
  const created = await db.schedule.create({ data: { organizationId: organization.id, ...data } });
  await writeAuditLog({ organizationId: organization.id, userId: user.id, action: "CREATE", entityType: "Schedule", entityId: created.id, after: data });
  revalidatePath("/settings/schedules");
}

export async function deleteScheduleAction(id: string) {
  const { user, organization } = await requireOrganization();
  await db.schedule.delete({ where: { id } });
  await writeAuditLog({ organizationId: organization.id, userId: user.id, action: "DELETE", entityType: "Schedule", entityId: id });
  revalidatePath("/settings/schedules");
}
'''
FILES["schedules/manager.tsx"] = '''"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { format } from "date-fns";
import { Plus, Trash2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { createScheduleAction, deleteScheduleAction } from "./actions";
import { toast } from "sonner";

type Sched = { id: string; name: string; cron: string; taskKind: string; isActive: boolean; lastRunAt: string | null };

export function SchedulesManager({ initial }: { initial: Sched[] }) {
  const router = useRouter();
  const [showForm, setShowForm] = React.useState(false);
  const [busy, setBusy] = React.useState(false);

  async function create(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    try { await createScheduleAction(new FormData(e.currentTarget)); toast.success("Schedule created"); setShowForm(false); router.refresh(); }
    catch (err) { toast.error(err instanceof Error ? err.message : "Save failed"); }
    finally { setBusy(false); }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">{initial.length} schedule{initial.length === 1 ? "" : "s"}</p>
        <Button size="sm" onClick={() => setShowForm((s) => !s)} variant={showForm ? "outline" : "default"}>{showForm ? "Cancel" : <><Plus className="h-3.5 w-3.5 mr-1" /> New schedule</>}</Button>
      </div>
      {showForm && (
        <form onSubmit={create} className="rounded-md border p-4 space-y-3 bg-muted/20">
          <div><Label>Name</Label><Input name="name" required maxLength={120} placeholder="Daily reminders" /></div>
          <div className="grid gap-3 md:grid-cols-2">
            <div><Label>Cron expression</Label><Input name="cron" required maxLength={80} placeholder="0 9 * * *" /></div>
            <div>
              <Label>Task</Label>
              <select name="taskKind" required className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm">
                <option value="reminders">Dispatch reminders</option><option value="recurring-invoices">Run recurring invoices</option><option value="recurring-bills">Run recurring bills</option><option value="close-books">Monthly book close</option>
              </select>
            </div>
          </div>
          <p className="text-xs text-muted-foreground">A cron worker invokes scheduled tasks. Worker process is queued for a future release.</p>
          <div className="flex justify-end"><Button type="submit" disabled={busy}>{busy && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}Create</Button></div>
        </form>
      )}
      <div className="rounded-md border divide-y">
        {initial.length === 0 ? (
          <div className="p-6 text-sm text-center text-muted-foreground">No schedules yet.</div>
        ) : initial.map((s) => (
          <div key={s.id} className="p-3 flex items-center gap-3 text-sm">
            <div className="flex-1 min-w-0">
              <div className="font-medium">{s.name}</div>
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Badge variant="outline">{s.taskKind}</Badge>
                <code className="font-mono">{s.cron}</code>
                {s.lastRunAt && <span>Last ran {format(new Date(s.lastRunAt), "dd MMM yyyy HH:mm")}</span>}
              </div>
            </div>
            <Button variant="ghost" size="icon" onClick={async () => { if (confirm("Delete?")) { await deleteScheduleAction(s.id); router.refresh(); } }} aria-label="Delete"><Trash2 className="h-4 w-4 text-destructive" /></Button>
          </div>
        ))}
      </div>
    </div>
  );
}
'''

# ───────── Reporting Tags ─────────
FILES["reporting-tags/page.tsx"] = '''import { db } from "@/lib/db";
import { requireOrganization } from "@/lib/auth-helpers";
import { Card, CardContent } from "@/components/ui/card";
import { SettingsShell } from "@/components/shared/settings-shell";
import { ReportingTagsManager } from "./manager";

export const metadata = { title: "Reporting Tags" };

export default async function ReportingTagsPage() {
  const { organization } = await requireOrganization();
  const rows = await db.reportingTag.findMany({ where: { organizationId: organization.id }, orderBy: { name: "asc" } });
  return (
    <SettingsShell title="Reporting Tags" description="Tags used to slice reports across departments, projects, and regions.">
      <Card><CardContent className="pt-6">
        <ReportingTagsManager initial={rows.map((t) => ({ id: t.id, name: t.name, color: t.color }))} />
      </CardContent></Card>
    </SettingsShell>
  );
}
'''
FILES["reporting-tags/actions.ts"] = '''"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireOrganization } from "@/lib/auth-helpers";
import { writeAuditLog } from "@/lib/audit";

const schema = z.object({
  name: z.string().min(1).max(80),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).default("#1d4ed8"),
});

export async function createReportingTagAction(formData: FormData) {
  const { user, organization } = await requireOrganization();
  const data = schema.parse({ name: formData.get("name"), color: formData.get("color") || "#1d4ed8" });
  const exists = await db.reportingTag.findUnique({ where: { organizationId_name: { organizationId: organization.id, name: data.name } } });
  if (exists) throw new Error("That tag already exists.");
  const created = await db.reportingTag.create({ data: { organizationId: organization.id, ...data } });
  await writeAuditLog({ organizationId: organization.id, userId: user.id, action: "CREATE", entityType: "ReportingTag", entityId: created.id, after: data });
  revalidatePath("/settings/reporting-tags");
}

export async function deleteReportingTagAction(id: string) {
  const { user, organization } = await requireOrganization();
  await db.reportingTag.delete({ where: { id } });
  await writeAuditLog({ organizationId: organization.id, userId: user.id, action: "DELETE", entityType: "ReportingTag", entityId: id });
  revalidatePath("/settings/reporting-tags");
}
'''
FILES["reporting-tags/manager.tsx"] = '''"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createReportingTagAction, deleteReportingTagAction } from "./actions";
import { toast } from "sonner";

type Tag = { id: string; name: string; color: string };

export function ReportingTagsManager({ initial }: { initial: Tag[] }) {
  const router = useRouter();
  const [busy, setBusy] = React.useState(false);

  async function create(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    try { await createReportingTagAction(new FormData(e.currentTarget)); toast.success("Tag created"); (e.target as HTMLFormElement).reset(); router.refresh(); }
    catch (err) { toast.error(err instanceof Error ? err.message : "Save failed"); }
    finally { setBusy(false); }
  }

  return (
    <div className="space-y-4">
      <form onSubmit={create} className="grid gap-3 md:grid-cols-3">
        <div><Label>Name</Label><Input name="name" required maxLength={80} placeholder="Department, Project, Region…" /></div>
        <div>
          <Label>Color</Label>
          <Input name="color" type="color" defaultValue="#1d4ed8" className="h-10" />
        </div>
        <div className="flex items-end">
          <Button type="submit" disabled={busy} className="w-full">{busy ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Plus className="h-4 w-4 mr-2" />}Add tag</Button>
        </div>
      </form>
      <div className="rounded-md border divide-y">
        {initial.length === 0 ? (
          <div className="p-6 text-sm text-center text-muted-foreground">No tags yet.</div>
        ) : initial.map((t) => (
          <div key={t.id} className="p-3 flex items-center gap-3 text-sm">
            <span className="h-4 w-4 rounded-full inline-block" style={{ backgroundColor: t.color }} />
            <span className="flex-1 font-medium">{t.name}</span>
            <Button variant="ghost" size="icon" onClick={async () => { if (confirm("Delete?")) { await deleteReportingTagAction(t.id); router.refresh(); } }} aria-label="Delete"><Trash2 className="h-4 w-4 text-destructive" /></Button>
          </div>
        ))}
      </div>
    </div>
  );
}
'''

# ───────── Web Tabs ─────────
FILES["web-tabs/page.tsx"] = '''import { db } from "@/lib/db";
import { requireOrganization } from "@/lib/auth-helpers";
import { Card, CardContent } from "@/components/ui/card";
import { SettingsShell } from "@/components/shared/settings-shell";
import { WebTabsManager } from "./manager";

export const metadata = { title: "Web Tabs" };

export default async function WebTabsPage() {
  const { organization } = await requireOrganization();
  const rows = await db.webTab.findMany({ where: { organizationId: organization.id }, orderBy: { name: "asc" } });
  return (
    <SettingsShell title="Web Tabs" description="Embed external tools as tabs inside Quikfinance.">
      <Card><CardContent className="pt-6">
        <WebTabsManager initial={rows.map((w) => ({ id: w.id, name: w.name, url: w.url }))} />
      </CardContent></Card>
    </SettingsShell>
  );
}
'''
FILES["web-tabs/actions.ts"] = '''"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireOrganization } from "@/lib/auth-helpers";
import { writeAuditLog } from "@/lib/audit";

const schema = z.object({ name: z.string().min(1).max(120), url: z.string().url() });

export async function createWebTabAction(formData: FormData) {
  const { user, organization } = await requireOrganization();
  const data = schema.parse({ name: formData.get("name"), url: formData.get("url") });
  const created = await db.webTab.create({ data: { organizationId: organization.id, ...data } });
  await writeAuditLog({ organizationId: organization.id, userId: user.id, action: "CREATE", entityType: "WebTab", entityId: created.id, after: data });
  revalidatePath("/settings/web-tabs");
}

export async function deleteWebTabAction(id: string) {
  const { user, organization } = await requireOrganization();
  await db.webTab.delete({ where: { id } });
  await writeAuditLog({ organizationId: organization.id, userId: user.id, action: "DELETE", entityType: "WebTab", entityId: id });
  revalidatePath("/settings/web-tabs");
}
'''
FILES["web-tabs/manager.tsx"] = '''"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createWebTabAction, deleteWebTabAction } from "./actions";
import { toast } from "sonner";

type Tab = { id: string; name: string; url: string };

export function WebTabsManager({ initial }: { initial: Tab[] }) {
  const router = useRouter();
  const [busy, setBusy] = React.useState(false);

  async function create(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    try { await createWebTabAction(new FormData(e.currentTarget)); toast.success("Tab added"); (e.target as HTMLFormElement).reset(); router.refresh(); }
    catch (err) { toast.error(err instanceof Error ? err.message : "Save failed"); }
    finally { setBusy(false); }
  }

  return (
    <div className="space-y-4">
      <form onSubmit={create} className="grid gap-3 md:grid-cols-3">
        <div><Label>Name</Label><Input name="name" required maxLength={120} /></div>
        <div><Label>URL</Label><Input name="url" type="url" required placeholder="https://…" /></div>
        <div className="flex items-end">
          <Button type="submit" disabled={busy} className="w-full">{busy ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Plus className="h-4 w-4 mr-2" />}Add tab</Button>
        </div>
      </form>
      <div className="rounded-md border divide-y">
        {initial.length === 0 ? (
          <div className="p-6 text-sm text-center text-muted-foreground">No web tabs yet.</div>
        ) : initial.map((t) => (
          <div key={t.id} className="p-3 flex items-center gap-3 text-sm">
            <span className="flex-1">
              <span className="font-medium block">{t.name}</span>
              <a href={t.url} target="_blank" rel="noreferrer" className="text-xs text-primary hover:underline truncate inline-block max-w-[400px]">{t.url}</a>
            </span>
            <Button variant="ghost" size="icon" onClick={async () => { if (confirm("Delete?")) { await deleteWebTabAction(t.id); router.refresh(); } }} aria-label="Delete"><Trash2 className="h-4 w-4 text-destructive" /></Button>
          </div>
        ))}
      </div>
    </div>
  );
}
'''

for rel, content in FILES.items():
    path = ROOT / rel
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(content, encoding="utf-8")
    print(f"wrote {rel}")
print(f"\nTotal: {len(FILES)} files")
