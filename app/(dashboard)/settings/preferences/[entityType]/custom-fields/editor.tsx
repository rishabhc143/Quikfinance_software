"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Loader2, Pencil, Plus, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  CUSTOM_FIELD_DATA_TYPES,
  DATA_TYPE_LABELS,
  deriveFieldKey,
  type CustomFieldDataType,
} from "@/lib/sales/custom-fields";
import {
  deleteCustomFieldDefinitionAction,
  upsertCustomFieldDefinitionAction,
} from "./actions";

export type CustomFieldDef = {
  id: string;
  fieldKey: string;
  label: string;
  dataType: CustomFieldDataType;
  options: { label: string; value: string }[] | null;
  isRequired: boolean;
  showOnPdf: boolean;
  showOnPortal: boolean;
  position: number;
};

export function CustomFieldsEditor({
  entityType,
  definitions,
}: {
  entityType: string;
  definitions: CustomFieldDef[];
}) {
  const router = useRouter();
  const [editing, setEditing] = React.useState<CustomFieldDef | null>(null);
  const [creating, setCreating] = React.useState(false);
  const [busy, setBusy] = React.useState<string | null>(null);

  async function onDelete(d: CustomFieldDef) {
    if (
      !window.confirm(
        `Delete custom field "${d.label}"? Existing values are preserved (soft delete).`
      )
    ) {
      return;
    }
    setBusy(d.id);
    try {
      const r = await deleteCustomFieldDefinitionAction({ id: d.id });
      if (!r.ok) {
        toast.error(r.error ?? "Delete failed");
        return;
      }
      toast.success(`Deleted "${d.label}"`);
      router.refresh();
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button size="sm" onClick={() => setCreating(true)} className="gap-1">
          <Plus className="h-4 w-4" /> New Custom Field
        </Button>
      </div>

      {definitions.length === 0 ? (
        <div className="rounded-md border border-dashed p-8 text-center text-sm text-muted-foreground">
          No custom fields yet. Click <strong>New Custom Field</strong> above to add one.
        </div>
      ) : (
        <div className="rounded-md border bg-background overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-xs uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="p-3 text-left">Label</th>
                <th className="p-3 text-left">Field Key</th>
                <th className="p-3 text-left">Type</th>
                <th className="p-3 text-center">Required</th>
                <th className="p-3 text-center">PDF</th>
                <th className="p-3 text-center">Portal</th>
                <th className="p-3 text-right">Position</th>
                <th className="p-3" />
              </tr>
            </thead>
            <tbody className="divide-y">
              {definitions.map((d) => (
                <tr key={d.id}>
                  <td className="p-3 font-medium">{d.label}</td>
                  <td className="p-3 font-mono text-xs">{d.fieldKey}</td>
                  <td className="p-3 capitalize">{d.dataType}</td>
                  <td className="p-3 text-center">{d.isRequired ? "✓" : "—"}</td>
                  <td className="p-3 text-center">{d.showOnPdf ? "✓" : "—"}</td>
                  <td className="p-3 text-center">{d.showOnPortal ? "✓" : "—"}</td>
                  <td className="p-3 text-right tabular-nums">{d.position}</td>
                  <td className="p-3">
                    <div className="flex justify-end gap-1">
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => setEditing(d)}
                        aria-label={`Edit ${d.label}`}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        disabled={busy === d.id}
                        onClick={() => onDelete(d)}
                        aria-label={`Delete ${d.label}`}
                      >
                        {busy === d.id ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Trash2 className="h-4 w-4 text-destructive" />
                        )}
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <CustomFieldDialog
        entityType={entityType}
        existing={editing}
        open={creating || !!editing}
        onOpenChange={(o) => {
          if (!o) {
            setCreating(false);
            setEditing(null);
          }
        }}
      />
    </div>
  );
}

function CustomFieldDialog({
  entityType,
  existing,
  open,
  onOpenChange,
}: {
  entityType: string;
  existing: CustomFieldDef | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const [label, setLabel] = React.useState("");
  const [fieldKey, setFieldKey] = React.useState("");
  const [keyTouched, setKeyTouched] = React.useState(false);
  const [dataType, setDataType] = React.useState<CustomFieldDataType>("text");
  const [options, setOptions] = React.useState<{ label: string; value: string }[]>([]);
  const [isRequired, setIsRequired] = React.useState(false);
  const [showOnPdf, setShowOnPdf] = React.useState(false);
  const [showOnPortal, setShowOnPortal] = React.useState(false);
  const [position, setPosition] = React.useState("0");
  const [busy, setBusy] = React.useState(false);

  // Reset form when dialog opens with a different existing
  React.useEffect(() => {
    if (!open) return;
    if (existing) {
      setLabel(existing.label);
      setFieldKey(existing.fieldKey);
      setKeyTouched(true);
      setDataType(existing.dataType);
      setOptions(existing.options ?? []);
      setIsRequired(existing.isRequired);
      setShowOnPdf(existing.showOnPdf);
      setShowOnPortal(existing.showOnPortal);
      setPosition(String(existing.position));
    } else {
      setLabel("");
      setFieldKey("");
      setKeyTouched(false);
      setDataType("text");
      setOptions([]);
      setIsRequired(false);
      setShowOnPdf(false);
      setShowOnPortal(false);
      setPosition("0");
    }
  }, [open, existing]);

  // Auto-derive field key from label until the user edits it manually
  React.useEffect(() => {
    if (!keyTouched && !existing) {
      setFieldKey(deriveFieldKey(label));
    }
  }, [label, keyTouched, existing]);

  function addOption() {
    setOptions((prev) => [...prev, { label: "", value: "" }]);
  }
  function updateOption(i: number, key: "label" | "value", v: string) {
    setOptions((prev) => prev.map((o, idx) => (idx === i ? { ...o, [key]: v } : o)));
  }
  function removeOption(i: number) {
    setOptions((prev) => prev.filter((_, idx) => idx !== i));
  }

  async function onSave() {
    setBusy(true);
    try {
      const r = await upsertCustomFieldDefinitionAction({
        id: existing?.id,
        entityType,
        fieldKey,
        label,
        dataType,
        options: dataType === "dropdown" ? options : undefined,
        isRequired,
        showOnPdf,
        showOnPortal,
        position: Number(position) || 0,
      });
      if (!r.ok) {
        toast.error(r.error ?? "Save failed");
        return;
      }
      toast.success(existing ? "Field updated" : "Field added");
      onOpenChange(false);
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Save failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {existing ? "Edit Custom Field" : "New Custom Field"}
          </DialogTitle>
          <DialogDescription>
            Fields appear on the {entityType.toLowerCase().replace("_", " ")}{" "}
            form. Optionally also on the PDF and customer portal.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 max-h-[60vh] overflow-y-auto pr-1">
          <div className="space-y-1">
            <Label htmlFor="cf-label">Label *</Label>
            <Input
              id="cf-label"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="Customer PO #"
            />
          </div>

          <div className="space-y-1">
            <Label htmlFor="cf-key">Field Key *</Label>
            <Input
              id="cf-key"
              value={fieldKey}
              onChange={(e) => {
                setKeyTouched(true);
                setFieldKey(e.target.value);
              }}
              className="font-mono text-xs"
              disabled={!!existing}
              placeholder="customer_po"
            />
            <p className="text-xs text-muted-foreground">
              Lowercase letters, digits, underscores only. Cannot change after save.
            </p>
          </div>

          <div className="space-y-1">
            <Label htmlFor="cf-type">Data Type *</Label>
            <select
              id="cf-type"
              value={dataType}
              onChange={(e) => setDataType(e.target.value as CustomFieldDataType)}
              className="h-10 w-full rounded border px-2 bg-background text-sm"
              disabled={!!existing}
            >
              {DATA_TYPE_LABELS.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
          </div>

          {dataType === "dropdown" ? (
            <div className="space-y-2 rounded-md border p-3">
              <div className="flex items-center justify-between">
                <Label className="text-sm font-medium">Options</Label>
                <Button
                  size="sm"
                  variant="outline"
                  type="button"
                  onClick={addOption}
                  className="gap-1"
                >
                  <Plus className="h-3 w-3" /> Add
                </Button>
              </div>
              {options.length === 0 ? (
                <p className="text-xs text-muted-foreground">
                  Add at least one option.
                </p>
              ) : (
                <div className="space-y-2">
                  {options.map((o, i) => (
                    <div key={i} className="flex gap-2">
                      <Input
                        value={o.label}
                        onChange={(e) => updateOption(i, "label", e.target.value)}
                        placeholder="Display label"
                        className="flex-1"
                      />
                      <Input
                        value={o.value}
                        onChange={(e) => updateOption(i, "value", e.target.value)}
                        placeholder="Stored value"
                        className="flex-1 font-mono text-xs"
                      />
                      <Button
                        size="icon"
                        variant="ghost"
                        type="button"
                        onClick={() => removeOption(i)}
                        aria-label="Remove option"
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : null}

          <div className="space-y-2">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={isRequired}
                onChange={(e) => setIsRequired(e.target.checked)}
              />
              Required
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={showOnPdf}
                onChange={(e) => setShowOnPdf(e.target.checked)}
              />
              Show on PDF
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={showOnPortal}
                onChange={(e) => setShowOnPortal(e.target.checked)}
              />
              Show on customer portal
            </label>
          </div>

          <div className="space-y-1">
            <Label htmlFor="cf-pos">Position</Label>
            <Input
              id="cf-pos"
              type="number"
              min={0}
              value={position}
              onChange={(e) => setPosition(e.target.value)}
              className="w-24"
            />
          </div>
        </div>

        <DialogFooter>
          <DialogClose asChild>
            <Button variant="ghost" type="button">
              Cancel
            </Button>
          </DialogClose>
          <Button
            type="button"
            onClick={onSave}
            disabled={
              busy ||
              !label.trim() ||
              !fieldKey.trim() ||
              (dataType === "dropdown" && options.length === 0)
            }
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

void CUSTOM_FIELD_DATA_TYPES; // re-export reachability
