"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Trash2, Plus, Search, Info, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createProjectAction } from "../actions";
import { BILLING_METHODS } from "../constants";
import { toast } from "sonner";

type CustomerOption = { id: string; displayName: string };
type MemberOption = { id: string; name: string; email: string };
type TaskRow = { id: string; name: string; description: string; billable: boolean };

let nextRowId = 0;
const rid = () => `t${++nextRowId}`;

export function NewProjectForm({
  customers,
  members,
  currentUser,
  currencySymbol,
}: {
  customers: CustomerOption[];
  members: MemberOption[];
  currentUser: { id: string; name: string; email: string };
  currencySymbol: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = React.useState(false);

  const [name, setName] = React.useState("");
  const [projectCode, setProjectCode] = React.useState("");
  const [customerId, setCustomerId] = React.useState("");
  const [billingMethod, setBillingMethod] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [costBudget, setCostBudget] = React.useState("");
  const [revenueBudget, setRevenueBudget] = React.useState("");

  // Users: current user is always included and undeletable.
  const [assignedUserIds, setAssignedUserIds] = React.useState<string[]>([]);
  const [showAddUser, setShowAddUser] = React.useState(false);

  // Tasks: at least one empty row visible initially.
  const [tasks, setTasks] = React.useState<TaskRow[]>([
    { id: rid(), name: "", description: "", billable: true },
  ]);

  const [addToWatchlist, setAddToWatchlist] = React.useState(true);

  const availableMembers = members.filter(
    (m) => m.id !== currentUser.id && !assignedUserIds.includes(m.id)
  );

  function addTaskRow() {
    setTasks((rows) => [...rows, { id: rid(), name: "", description: "", billable: true }]);
  }

  function updateTask(id: string, patch: Partial<TaskRow>) {
    setTasks((rows) => rows.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  }

  function removeTask(id: string) {
    setTasks((rows) => (rows.length === 1 ? rows : rows.filter((r) => r.id !== id)));
  }

  function addUser(userId: string) {
    setAssignedUserIds((ids) => (ids.includes(userId) ? ids : [...ids, userId]));
    setShowAddUser(false);
  }

  function removeUser(userId: string) {
    setAssignedUserIds((ids) => ids.filter((id) => id !== userId));
  }

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (busy) return;

    // Client-side validation summary.
    if (!name.trim()) {
      toast.error("Project Name is required");
      return;
    }
    if (!customerId) {
      toast.error("Customer Name is required");
      return;
    }
    if (!billingMethod) {
      toast.error("Billing Method is required");
      return;
    }
    const cleanTasks = tasks
      .filter((t) => t.name.trim().length > 0)
      .map((t) => ({
        name: t.name.trim(),
        description: t.description.trim(),
        billable: t.billable,
      }));

    setBusy(true);
    try {
      const fd = new FormData();
      fd.set("name", name.trim());
      fd.set("projectCode", projectCode.trim());
      fd.set("customerId", customerId);
      fd.set("billingMethod", billingMethod);
      fd.set("description", description.trim());
      fd.set("costBudget", costBudget);
      fd.set("revenueBudget", revenueBudget);
      fd.set("userIds", JSON.stringify(assignedUserIds));
      fd.set("tasks", JSON.stringify(cleanTasks));
      fd.set("addToWatchlist", addToWatchlist ? "true" : "false");
      await createProjectAction(fd);
    } catch (err) {
      // Server action redirects on success; errors land here.
      const msg = err instanceof Error ? err.message : "Failed to create project";
      // Next.js redirects throw a special error — ignore those.
      if (msg.includes("NEXT_REDIRECT")) return;
      toast.error(msg);
      setBusy(false);
    }
  }

  const assignedMembers = members.filter((m) => assignedUserIds.includes(m.id));

  return (
    <form onSubmit={onSubmit}>
      {/* Project Details section */}
      <Section>
        <FieldRow label="Project Name" required>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={160}
            autoFocus
            className={!name.trim() && busy ? "border-destructive ring-1 ring-destructive" : ""}
          />
        </FieldRow>
        <FieldRow label="Project Code">
          <Input
            value={projectCode}
            onChange={(e) => setProjectCode(e.target.value)}
            maxLength={60}
          />
        </FieldRow>
        <FieldRow label="Customer Name" required>
          <div className="flex gap-2">
            <select
              value={customerId}
              onChange={(e) => setCustomerId(e.target.value)}
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
            >
              <option value="">Select customer</option>
              {customers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.displayName}
                </option>
              ))}
            </select>
            <Button
              type="button"
              size="icon"
              className="shrink-0 bg-blue-600 hover:bg-blue-700"
              asChild
              title="Create a new customer"
            >
              <Link href="/sales/customers/new" target="_blank">
                <Search className="h-4 w-4" />
              </Link>
            </Button>
          </div>
        </FieldRow>
        <FieldRow label="Billing Method" required>
          <select
            value={billingMethod}
            onChange={(e) => setBillingMethod(e.target.value)}
            className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
          >
            <option value="">Select billing method</option>
            {BILLING_METHODS.map((b) => (
              <option key={b.value} value={b.value}>
                {b.label}
              </option>
            ))}
          </select>
        </FieldRow>
        <FieldRow label="Description">
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            maxLength={2000}
            rows={3}
            placeholder="Max. 2000 characters"
            className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          />
        </FieldRow>
      </Section>

      <Divider />

      {/* Budget section */}
      <SectionWithHeader title="Budget">
        <FieldRow label="Cost Budget" tooltip="Total cost you expect to incur on this project.">
          <CurrencyInput
            symbol={currencySymbol}
            value={costBudget}
            onChange={setCostBudget}
          />
        </FieldRow>
        <FieldRow label="Revenue Budget" tooltip="Total revenue you expect to earn from this project.">
          <CurrencyInput
            symbol={currencySymbol}
            value={revenueBudget}
            onChange={setRevenueBudget}
          />
        </FieldRow>
        <div className="md:col-start-2">
          <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
            Add budget for project hours.
            <span className="text-[10px] uppercase tracking-wider bg-muted px-1.5 py-0.5 rounded-sm">
              Soon
            </span>
          </span>
        </div>
      </SectionWithHeader>

      <Divider />

      {/* Users section */}
      <SectionWithHeader title="Users">
        <div className="md:col-span-2">
          <table className="w-full border text-sm">
            <thead className="bg-muted/30 text-xs uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="text-left p-2 w-12">S.NO</th>
                <th className="text-left p-2">USER</th>
                <th className="text-left p-2">EMAIL</th>
                <th className="w-12" />
              </tr>
            </thead>
            <tbody className="divide-y">
              <tr>
                <td className="p-2 text-muted-foreground">1</td>
                <td className="p-2 font-medium">{currentUser.name}</td>
                <td className="p-2 text-muted-foreground">{currentUser.email}</td>
                <td className="p-2 text-xs text-muted-foreground italic">you</td>
              </tr>
              {assignedMembers.map((m, i) => (
                <tr key={m.id}>
                  <td className="p-2 text-muted-foreground">{i + 2}</td>
                  <td className="p-2 font-medium">{m.name || m.email}</td>
                  <td className="p-2 text-muted-foreground">{m.email}</td>
                  <td className="p-2">
                    <button
                      type="button"
                      onClick={() => removeUser(m.id)}
                      className="text-destructive hover:text-destructive/80"
                      aria-label="Remove user"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className="mt-2 relative">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setShowAddUser((s) => !s)}
              disabled={availableMembers.length === 0}
              className="gap-1.5"
            >
              <Plus className="h-3.5 w-3.5 text-blue-600" />
              Add User
            </Button>
            {showAddUser && availableMembers.length > 0 && (
              <div className="absolute left-0 top-full mt-1 z-10 w-80 max-h-64 overflow-auto rounded-md border bg-popover shadow-md">
                {availableMembers.map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => addUser(m.id)}
                    className="block w-full text-left px-3 py-2 hover:bg-muted text-sm"
                  >
                    <div className="font-medium">{m.name || m.email}</div>
                    <div className="text-xs text-muted-foreground">{m.email}</div>
                  </button>
                ))}
              </div>
            )}
            {availableMembers.length === 0 && (
              <p className="text-xs text-muted-foreground mt-1">
                No more org members to add.{" "}
                <Link href="/settings/users/new" className="text-blue-600 hover:text-blue-700">
                  Invite a new user
                </Link>
                .
              </p>
            )}
          </div>
        </div>
      </SectionWithHeader>

      <Divider />

      {/* Project Tasks section */}
      <SectionWithHeader
        title="Project Tasks"
        headerRight={
          <span className="inline-flex items-center gap-1 text-xs text-muted-foreground cursor-not-allowed">
            <Download className="h-3.5 w-3.5" />
            Import project tasks from existing projects.
            <span className="text-[10px] uppercase tracking-wider bg-muted px-1.5 py-0.5 rounded-sm">
              Soon
            </span>
          </span>
        }
      >
        <div className="md:col-span-2">
          <table className="w-full border text-sm">
            <thead className="bg-muted/30 text-xs uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="text-left p-2 w-12">S.NO</th>
                <th className="text-left p-2 w-1/4">TASK NAME</th>
                <th className="text-left p-2">DESCRIPTION</th>
                <th className="text-center p-2 w-20">BILLABLE</th>
                <th className="w-12" />
              </tr>
            </thead>
            <tbody className="divide-y">
              {tasks.map((t, i) => (
                <tr key={t.id}>
                  <td className="p-2 text-muted-foreground">{i + 1}</td>
                  <td className="p-2">
                    <Input
                      value={t.name}
                      onChange={(e) => updateTask(t.id, { name: e.target.value })}
                      placeholder="Task Name"
                      maxLength={160}
                    />
                  </td>
                  <td className="p-2">
                    <textarea
                      value={t.description}
                      onChange={(e) => updateTask(t.id, { description: e.target.value })}
                      placeholder="Description"
                      maxLength={2000}
                      rows={1}
                      className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                    />
                  </td>
                  <td className="p-2 text-center">
                    <input
                      type="checkbox"
                      checked={t.billable}
                      onChange={(e) => updateTask(t.id, { billable: e.target.checked })}
                      className="h-4 w-4 rounded border-input text-blue-600 focus:ring-blue-500"
                    />
                  </td>
                  <td className="p-2 text-center">
                    {tasks.length > 1 && (
                      <button
                        type="button"
                        onClick={() => removeTask(t.id)}
                        className="text-destructive hover:text-destructive/80"
                        aria-label="Remove task"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={addTaskRow}
            className="gap-1.5 mt-2"
          >
            <Plus className="h-3.5 w-3.5 text-blue-600" />
            Add Project Task
          </Button>
        </div>
      </SectionWithHeader>

      <Divider />

      {/* Watchlist checkbox */}
      <div className="px-6 py-4">
        <label className="inline-flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={addToWatchlist}
            onChange={(e) => setAddToWatchlist(e.target.checked)}
            className="h-4 w-4 rounded border-input text-blue-600 focus:ring-blue-500"
          />
          <span className="text-sm">Add to the watchlist on my dashboard</span>
          <span
            title="Watchlist items are pinned to your home dashboard for quick access."
            className="text-muted-foreground"
          >
            <Info className="h-3.5 w-3.5" />
          </span>
        </label>
      </div>

      <Divider />

      {/* Footer */}
      <div className="px-6 py-4 flex items-center gap-3">
        <Button type="submit" disabled={busy} className="bg-blue-600 hover:bg-blue-700">
          {busy ? "Saving…" : "Save"}
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={() => router.push("/time/projects")}
          disabled={busy}
        >
          Cancel
        </Button>
      </div>
    </form>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Layout primitives
// ─────────────────────────────────────────────────────────────────────────

function Section({ children }: { children: React.ReactNode }) {
  return <div className="px-6 py-6 space-y-4 bg-muted/20">{children}</div>;
}

function SectionWithHeader({
  title,
  headerRight,
  children,
}: {
  title: string;
  headerRight?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="px-6 py-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-base font-semibold">{title}</h2>
        {headerRight}
      </div>
      <div className="grid md:grid-cols-[200px_1fr] gap-x-6 gap-y-4 items-start">{children}</div>
    </div>
  );
}

function Divider() {
  return <div className="border-t" />;
}

function FieldRow({
  label,
  required,
  tooltip,
  children,
}: {
  label: string;
  required?: boolean;
  tooltip?: string;
  children: React.ReactNode;
}) {
  return (
    <>
      <Label className="md:pt-2 inline-flex items-center gap-1">
        <span className={required ? "text-destructive" : ""}>
          {label}
          {required && <span className="text-destructive ml-0.5">*</span>}
        </span>
        {tooltip && (
          <span title={tooltip} className="text-muted-foreground">
            <Info className="h-3 w-3" />
          </span>
        )}
      </Label>
      <div>{children}</div>
    </>
  );
}

function CurrencyInput({
  symbol,
  value,
  onChange,
}: {
  symbol: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="flex">
      <span className="inline-flex items-center px-3 rounded-l-md border border-r-0 border-input bg-muted text-sm font-medium text-muted-foreground">
        {symbol}
      </span>
      <Input
        type="number"
        step="0.01"
        min="0"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="rounded-l-none"
      />
    </div>
  );
}

