"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { saveBrandingAction } from "./actions";
import { toast } from "sonner";

export function BrandingForm({
  initial,
}: { initial: { brandColor: string; logoUrl: string | null } }) {
  const router = useRouter();
  const [busy, setBusy] = React.useState(false);
  const [color, setColor] = React.useState(initial.brandColor);
  const [logoUrl, setLogoUrl] = React.useState(initial.logoUrl ?? "");

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    try {
      await saveBrandingAction({ brandColor: color, logoUrl: logoUrl || null });
      toast.success("Branding saved");
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Save failed");
    } finally { setBusy(false); }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-5">
      <div>
        <Label>Logo URL</Label>
        <Input value={logoUrl} onChange={(e) => setLogoUrl(e.target.value)} placeholder="https://…/logo.png" type="url" />
        <p className="text-xs text-muted-foreground mt-1">Direct upload arrives with the UploadThing/S3 wiring in Phase 4.</p>
        {logoUrl && (
          <div className="mt-3 inline-flex items-center gap-3 px-3 py-2 rounded border bg-muted/30">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={logoUrl} alt="Preview" className="h-10 max-w-[160px] object-contain" />
            <span className="text-xs text-muted-foreground">Preview</span>
          </div>
        )}
      </div>

      <div>
        <Label>Brand color</Label>
        <div className="flex items-center gap-2">
          <input
            type="color"
            value={color}
            onChange={(e) => setColor(e.target.value)}
            className="h-10 w-16 rounded border border-input cursor-pointer"
            aria-label="Pick brand color"
          />
          <Input value={color} onChange={(e) => setColor(e.target.value)} className="font-mono w-32" maxLength={7} />
        </div>
        <p className="text-xs text-muted-foreground mt-1">Used on invoice PDFs and email templates.</p>
      </div>

      <div className="flex justify-end pt-2 border-t">
        <Button type="submit" disabled={busy}>
          {busy && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
          Save branding
        </Button>
      </div>
    </form>
  );
}
