"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2, Loader2, Save } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { addSeriesAction, updateSeriesAction, deleteSeriesAction } from "./actions";
import { toast } from "sonner";

type Series = { id: string; module: string; prefix: string; nextValue: number; padding: number };

const KNOWN_MODULES = [
  "invoice", "bill", "quote", "salesOrder", "purchaseOrder",
  "creditNote", "vendorCredit", "paymentReceived", "paymentMade",
  "manualJournal", "deliveryChallan", "expense",
];

export function NumberSeriesManager({ initial }: { initial: Series[] }) {
  const router = useRouter();
  const [moduleName, setModuleName] = React.useState(KNOWN_MODULES.find((m) => !initial.some((s) => s.module === m)) ?? "");
  const [prefix, setPrefix] = React.useState("");
  const [busy, setBusy] = React.useState(false);

  async function add(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    try {
      await addSeriesAction({ module: moduleName, prefix: prefix.trim() || moduleName.toUpperCase().slice(0, 4) + "-" });
      toast.success("Series added");
      setModuleName(""); setPrefix("");
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Add failed");
    } finally { setBusy(false); }
  }

  return (
    <div className="space-y-5">
      <form onSubmit={add} className="grid gap-3 md:grid-cols-3">
        <div>
          <Label>Module</Label>
          <select
            value={moduleName}
            onChange={(e) => setModuleName(e.target.value)}
            className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
            required
          >
            <option value="" disabled>Select…</option>
            {KNOWN_MODULES.filter((m) => !initial.some((s) => s.module === m)).map((m) => (
              <option key={m} value={m}>{m}</option>
            ))}
          </select>
        </div>
        <div>
          <Label>Prefix</Label>
          <Input value={prefix} onChange={(e) => setPrefix(e.target.value)} placeholder="INV-" maxLength={10} />
        </div>
        <div className="flex items-end">
          <Button type="submit" disabled={busy || !moduleName} className="w-full">
            {busy ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Plus className="h-4 w-4 mr-2" />}
            Add series
          </Button>
        </div>
      </form>

      <div className="rounded-md border overflow-hidden">
        {initial.length === 0 ? (
          <div className="p-6 text-sm text-center text-muted-foreground">No series yet.</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-muted/30 text-xs uppercase tracking-wider text-muted-foreground">
              <tr><th className="text-left p-3">Module</th><th className="text-left p-3">Prefix</th><th className="text-right p-3">Next Value</th><th className="text-right p-3">Padding</th><th className="text-left p-3">Preview</th><th /></tr>
            </thead>
            <tbody className="divide-y">
              {initial.map((s) => (
                <SeriesRow key={s.id} initial={s} onChange={() => router.refresh()} />
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

function SeriesRow({ initial, onChange }: { initial: Series; onChange: () => void }) {
  const [prefix, setPrefix] = React.useState(initial.prefix);
  const [nextValue, setNextValue] = React.useState(initial.nextValue);
  const [padding, setPadding] = React.useState(initial.padding);
  const [busy, setBusy] = React.useState(false);
  const dirty = prefix !== initial.prefix || nextValue !== initial.nextValue || padding !== initial.padding;

  async function save() {
    setBusy(true);
    try {
      await updateSeriesAction(initial.id, { prefix, nextValue, padding });
      toast.success("Saved");
      onChange();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Save failed");
    } finally { setBusy(false); }
  }

  async function remove() {
    if (!confirm(`Delete the ${initial.module} series? Existing transactions keep their numbers.`)) return;
    await deleteSeriesAction(initial.id);
    toast.success("Deleted");
    onChange();
  }

  return (
    <tr>
      <td className="p-3 capitalize">{initial.module.replace(/([A-Z])/g, " $1")}</td>
      <td className="p-3"><Input value={prefix} onChange={(e) => setPrefix(e.target.value)} className="h-8 max-w-[120px]" /></td>
      <td className="p-3 text-right"><Input type="number" min={1} value={nextValue} onChange={(e) => setNextValue(Number(e.target.value))} className="h-8 max-w-[100px] ml-auto text-right" /></td>
      <td className="p-3 text-right"><Input type="number" min={0} max={10} value={padding} onChange={(e) => setPadding(Number(e.target.value))} className="h-8 max-w-[60px] ml-auto text-right" /></td>
      <td className="p-3 font-mono text-xs">{prefix}{String(nextValue).padStart(padding, "0")}</td>
      <td className="p-3 text-right space-x-1">
        <Button variant="ghost" size="sm" onClick={save} disabled={!dirty || busy} aria-label="Save"><Save className="h-3.5 w-3.5" /></Button>
        <Button variant="ghost" size="sm" onClick={remove} aria-label="Delete"><Trash2 className="h-3.5 w-3.5 text-destructive" /></Button>
      </td>
    </tr>
  );
}
