"use client";
import * as React from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { ReportSideDrawer } from "./report-side-drawer";
import {
  DEFAULT_PRINT_PREFERENCES,
  loadPrintPreferences,
  savePrintPreferences,
  triggerPrint,
  type PrintPreferences,
} from "@/lib/reports/print";

/**
 * REPORTS — Print Preference drawer.
 *
 * Lets the user set orientation, page-numbers visibility, and the
 * running header/footer toggle before kicking off the system print
 * dialog. Preferences persist in localStorage so the next time the
 * user clicks Print directly (the dropdown menu item that bypasses
 * this drawer), their last choice applies.
 */

export type PrintPreferenceDrawerProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export function PrintPreferenceDrawer({
  open,
  onOpenChange,
}: PrintPreferenceDrawerProps) {
  const [prefs, setPrefs] = React.useState<PrintPreferences>(
    DEFAULT_PRINT_PREFERENCES
  );

  // Hydrate from localStorage when opened.
  React.useEffect(() => {
    if (!open) return;
    setPrefs(loadPrintPreferences());
  }, [open]);

  function saveOnly() {
    savePrintPreferences(prefs);
    onOpenChange(false);
  }
  function saveAndPrint() {
    savePrintPreferences(prefs);
    onOpenChange(false);
    // Allow the drawer's close animation to finish so the print
    // dialog doesn't capture the open drawer in its preview.
    setTimeout(() => triggerPrint(prefs), 250);
  }

  return (
    <ReportSideDrawer
      open={open}
      onOpenChange={onOpenChange}
      title="Print Preference"
      width="narrow"
      footer={
        <>
          <Button size="sm" onClick={saveAndPrint}>
            Save &amp; Print
          </Button>
          <Button size="sm" variant="outline" onClick={saveOnly}>
            Save
          </Button>
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="text-sm text-muted-foreground hover:text-foreground ml-auto px-2 py-1"
          >
            Cancel
          </button>
        </>
      }
    >
      <div className="p-5 space-y-5 text-sm">
        <div className="space-y-2">
          <Label>Orientation</Label>
          <div className="grid grid-cols-2 gap-2">
            {(["portrait", "landscape"] as const).map((o) => (
              <button
                key={o}
                type="button"
                onClick={() => setPrefs((p) => ({ ...p, orientation: o }))}
                className={
                  "rounded-md border px-3 py-2 text-sm capitalize " +
                  (prefs.orientation === o
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-input hover:bg-muted/50")
                }
              >
                {o}
              </button>
            ))}
          </div>
        </div>

        <label className="flex items-center gap-2 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={prefs.includePageNumbers}
            onChange={(e) =>
              setPrefs((p) => ({ ...p, includePageNumbers: e.target.checked }))
            }
            className="h-4 w-4 rounded border-input"
          />
          <span>Show page numbers</span>
        </label>

        <label className="flex items-center gap-2 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={prefs.includeHeaderFooter}
            onChange={(e) =>
              setPrefs((p) => ({ ...p, includeHeaderFooter: e.target.checked }))
            }
            className="h-4 w-4 rounded border-input"
          />
          <span>Include running header / footer</span>
        </label>

        <p className="pt-3 text-xs text-muted-foreground border-t">
          Your printer&apos;s native dialog will appear after Save &amp;
          Print. These preferences also apply when you click the
          plain Print item in the Export dropdown.
        </p>
      </div>
    </ReportSideDrawer>
  );
}
