"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { updatePreferenceAction } from "../_shared-actions";
import { toast } from "sonner";

const TEMPLATES = [
  { id: "default", name: "Default", desc: "Clean, minimalist layout — works for most businesses." },
  { id: "classic", name: "Classic", desc: "Traditional accounting style with a header band and serif body." },
  { id: "modern", name: "Modern", desc: "Bold typography with a brand color accent." },
];

export function PdfTemplateForm({ initial }: { initial: string }) {
  const router = useRouter();
  const [tpl, setTpl] = React.useState(initial);
  const [busy, setBusy] = React.useState(false);
  async function save(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    try { await updatePreferenceAction({ key: "pdfTemplate", value: tpl }); toast.success("Saved"); router.refresh(); }
    catch (err) { toast.error(err instanceof Error ? err.message : "Save failed"); }
    finally { setBusy(false); }
  }
  return (
    <form onSubmit={save} className="space-y-4">
      <div className="grid gap-3 md:grid-cols-3">
        {TEMPLATES.map((t) => (
          <Card key={t.id} className={tpl === t.id ? "border-primary cursor-pointer" : "cursor-pointer"} onClick={() => setTpl(t.id)}>
            <CardContent className="pt-6">
              <Label className="font-medium">{t.name}</Label>
              <p className="text-xs text-muted-foreground mt-1">{t.desc}</p>
              <p className="text-[10px] text-muted-foreground mt-2">{tpl === t.id ? "Selected" : "Click to select"}</p>
            </CardContent>
          </Card>
        ))}
      </div>
      <p className="text-xs text-muted-foreground">Selected template applies to invoices, quotes, and credit notes downloaded as PDF.</p>
      <div className="flex justify-end pt-2 border-t">
        <Button type="submit" disabled={busy}>{busy && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}Save</Button>
      </div>
    </form>
  );
}
