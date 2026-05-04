"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2, Loader2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { addTaxAction, deleteTaxAction, setTaxActiveAction } from "./actions";
import { toast } from "sonner";

type Tax = {
  id: string;
  name: string;
  rate: number;
  type: string;
  isCompound: boolean;
  isActive: boolean;
};

export function TaxesManager({ initial }: { initial: Tax[] }) {
  const router = useRouter();
  const [name, setName] = React.useState("");
  const [rate, setRate] = React.useState("");
  const [type, setType] = React.useState("standard");
  const [isCompound, setIsCompound] = React.useState(false);
  const [busy, setBusy] = React.useState(false);

  async function add(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!name.trim() || !rate) return;
    setBusy(true);
    try {
      await addTaxAction({ name: name.trim(), rate: Number(rate), type, isCompound });
      toast.success("Tax added");
      setName(""); setRate(""); setType("standard"); setIsCompound(false);
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Add failed");
    } finally { setBusy(false); }
  }

  async function remove(id: string) {
    if (!confirm("Delete this tax? Existing transactions keep their values.")) return;
    await deleteTaxAction(id);
    toast.success("Deleted");
    router.refresh();
  }

  async function toggle(id: string, active: boolean) {
    await setTaxActiveAction(id, active);
    toast.success(active ? "Activated" : "Deactivated");
    router.refresh();
  }

  return (
    <div className="space-y-5">
      <form onSubmit={add} className="grid gap-3 md:grid-cols-5">
        <div className="md:col-span-2">
          <Label htmlFor="tax-name">Name</Label>
          <Input id="tax-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="GST 18%" required />
        </div>
        <div>
          <Label htmlFor="tax-rate">Rate (%)</Label>
          <Input id="tax-rate" type="number" step="0.01" min="0" max="100" value={rate} onChange={(e) => setRate(e.target.value)} required />
        </div>
        <div>
          <Label htmlFor="tax-type">Type</Label>
          <select
            id="tax-type"
            value={type}
            onChange={(e) => setType(e.target.value)}
            className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
          >
            <option value="standard">Standard</option>
            <option value="reverse_charge">Reverse charge</option>
            <option value="zero_rated">Zero rated</option>
            <option value="exempt">Exempt</option>
          </select>
        </div>
        <div className="flex items-end">
          <Button type="submit" disabled={busy} className="w-full">
            {busy ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Plus className="h-4 w-4 mr-2" />}
            Add tax
          </Button>
        </div>
        <label className="md:col-span-5 flex items-center gap-2 text-xs text-muted-foreground">
          <input type="checkbox" checked={isCompound} onChange={(e) => setIsCompound(e.target.checked)} />
          Compound tax (calculated on top of other taxes)
        </label>
      </form>

      <div className="rounded-md border overflow-hidden">
        {initial.length === 0 ? (
          <div className="p-6 text-sm text-center text-muted-foreground">No taxes yet — add one above.</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-muted/30 text-xs uppercase tracking-wider text-muted-foreground">
              <tr><th className="text-left p-3">Name</th><th className="text-right p-3">Rate</th><th className="text-left p-3">Type</th><th className="text-center p-3">Active</th><th /></tr>
            </thead>
            <tbody className="divide-y">
              {initial.map((t) => (
                <tr key={t.id} className={t.isActive ? "" : "opacity-60"}>
                  <td className="p-3 font-medium">
                    {t.name}
                    {t.isCompound && <Badge variant="outline" className="ml-2">Compound</Badge>}
                  </td>
                  <td className="p-3 text-right tabular-nums">{t.rate.toFixed(2)}%</td>
                  <td className="p-3 capitalize">{t.type.replace("_", " ")}</td>
                  <td className="p-3 text-center">
                    <Switch checked={t.isActive} onCheckedChange={(v) => toggle(t.id, v)} />
                  </td>
                  <td className="p-3 text-right">
                    <Button variant="ghost" size="sm" onClick={() => remove(t.id)} aria-label="Delete">
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
