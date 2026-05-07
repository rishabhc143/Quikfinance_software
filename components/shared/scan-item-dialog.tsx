"use client";

import * as React from "react";
import { Camera, Loader2, ScanBarcode } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

/**
 * M17e: Scan Item modal. Opens a webcam barcode reader using
 * @zxing/browser. When a code is decoded, calls the parent's
 * onResolve(sku) — typically a server action that maps SKU → Item.
 * If the camera permission is denied, falls back to manual SKU input.
 *
 * Manual entry (Enter / Submit) is always available as the no-camera
 * path; the parent component handles "not found" feedback.
 */

export type ScanResult = {
  id: string;
  name: string;
  sku: string | null;
  rate: string;
  description: string | null;
  unit: string | null;
};

export function ScanItemDialog({
  onResolve,
  onAdd,
  trigger,
}: {
  /** Server action: SKU → resolved Item or null. */
  onResolve: (input: { sku: string }) => Promise<ScanResult | null>;
  /** Called when an item is successfully resolved; closes the dialog. */
  onAdd: (item: ScanResult) => void;
  trigger?: React.ReactNode;
}) {
  const [open, setOpen] = React.useState(false);
  const [manualSku, setManualSku] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [cameraDenied, setCameraDenied] = React.useState(false);
  const [scanning, setScanning] = React.useState(false);
  const videoRef = React.useRef<HTMLVideoElement | null>(null);
  const controlsRef = React.useRef<{ stop: () => void } | null>(null);

  // Start scanning when dialog opens
  React.useEffect(() => {
    if (!open) return;
    setManualSku("");
    setCameraDenied(false);

    let cancelled = false;

    (async () => {
      try {
        // Lazy-load zxing only client-side and only when the dialog opens
        const { BrowserMultiFormatReader } = await import("@zxing/browser");
        const reader = new BrowserMultiFormatReader();
        if (cancelled) return;
        setScanning(true);
        const controls = await reader.decodeFromVideoDevice(
          undefined,
          videoRef.current!,
          (result, _err, ctrl) => {
            if (cancelled) return;
            if (result) {
              const sku = result.getText();
              ctrl.stop();
              setScanning(false);
              void resolveAndAdd(sku);
            }
          }
        );
        controlsRef.current = controls;
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Camera unavailable";
        // eslint-disable-next-line no-console
        console.warn("[scan-item] camera init failed", msg);
        if (!cancelled) {
          setCameraDenied(true);
          setScanning(false);
        }
      }
    })();

    return () => {
      cancelled = true;
      try {
        controlsRef.current?.stop();
      } catch {}
      controlsRef.current = null;
      setScanning(false);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  async function resolveAndAdd(sku: string) {
    if (!sku.trim()) return;
    setBusy(true);
    try {
      const r = await onResolve({ sku });
      if (!r) {
        toast.error(`No item with SKU "${sku}"`);
        return;
      }
      onAdd(r);
      setOpen(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Lookup failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger ?? (
          <Button type="button" variant="outline" size="sm" className="gap-1">
            <ScanBarcode className="h-4 w-4" /> Scan Item
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Scan Item</DialogTitle>
          <DialogDescription>
            Point your camera at a barcode, or enter the SKU manually.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          {!cameraDenied ? (
            <div className="aspect-video rounded-md border bg-black overflow-hidden relative">
              <video
                ref={videoRef}
                className="h-full w-full object-cover"
                muted
                playsInline
              />
              {scanning ? (
                <div className="absolute bottom-2 left-2 inline-flex items-center gap-1 rounded bg-black/60 px-2 py-1 text-xs text-white">
                  <Camera className="h-3 w-3" /> Scanning…
                </div>
              ) : null}
            </div>
          ) : (
            <div className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
              Camera unavailable. Enter the SKU below.
            </div>
          )}

          <form
            onSubmit={(e) => {
              e.preventDefault();
              void resolveAndAdd(manualSku);
            }}
            className="flex gap-2"
          >
            <Input
              value={manualSku}
              onChange={(e) => setManualSku(e.target.value)}
              placeholder="Enter SKU manually…"
              autoFocus={cameraDenied}
            />
            <Button type="submit" disabled={busy || !manualSku.trim()}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Find"}
            </Button>
          </form>
        </div>

        <DialogFooter>
          <DialogClose asChild>
            <Button variant="ghost" type="button">
              Close
            </Button>
          </DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
