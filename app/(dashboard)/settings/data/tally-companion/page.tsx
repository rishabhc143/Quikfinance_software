import { format } from "date-fns";
import { Database, FileSpreadsheet, CheckCircle2, AlertCircle, Clock } from "lucide-react";
import { requireOrganization } from "@/lib/auth-helpers";
import { db } from "@/lib/db";
import { TallyUploader } from "./tally-uploader";
import { RollbackButton } from "./rollback-button";

export const metadata = { title: "Tally Companion" };
export const dynamic = "force-dynamic";

/**
 * Tally Companion — landing page.
 *
 * Server component. Shows the upload widget + a history list of
 * past MigrationBatch rows for this org. Each row links to its
 * detail view (Phase 2) and shows status + counts + warnings.
 *
 * Discovery hooks (deferred to a follow-up PR):
 *   - Onboarding wizard step on signup
 *   - Empty-state CTAs on Customers / Vendors / Invoices / Bills
 *     list pages
 *   - Dashboard banner when org has zero records
 *
 * v1 just nails the core upload + history experience.
 */
export default async function TallyCompanionPage() {
  const { organization } = await requireOrganization();

  const batches = await db.migrationBatch.findMany({
    where: { organizationId: organization.id },
    select: {
      id: true,
      sourceFormat: true,
      sourceFilename: true,
      sourceFilesizeB: true,
      status: true,
      totalLedgers: true,
      totalVouchers: true,
      insertedLedgers: true,
      insertedVouchers: true,
      warnings: true,
      error: true,
      startedAt: true,
      completedAt: true,
      rollbackExpiresAt: true,
    },
    orderBy: { createdAt: "desc" },
    take: 50,
  });

  // Aggregate counts across all 'done' imports so the user has a
  // one-glance "we've brought in X invoices total" stat.
  const doneBatches = batches.filter((b) => b.status === "done");
  const totalLedgers = doneBatches.reduce((s, b) => s + b.insertedLedgers, 0);
  const totalVouchers = doneBatches.reduce((s, b) => s + b.insertedVouchers, 0);

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <div className="flex items-start gap-3">
        <Database className="h-6 w-6 text-primary mt-1" />
        <div className="flex-1">
          <h1 className="text-2xl font-semibold tracking-tight">
            Tally Companion
          </h1>
          <p className="text-sm text-muted-foreground mt-1 max-w-3xl">
            Bring your existing Tally data into Quikfinance &mdash; Tally
            stays as your source of truth, we add the AI layer on top
            (cashflow forecast, CFO Copilot, anomaly detector). Upload
            your Tally Prime XML export and we&apos;ll do the rest. Beta.
          </p>
        </div>
      </div>

      {/* Stat strip */}
      {doneBatches.length > 0 && (
        <div className="grid grid-cols-3 gap-3">
          <Stat label="Imports" value={String(doneBatches.length)} />
          <Stat label="Ledgers imported" value={totalLedgers.toLocaleString("en-IN")} />
          <Stat label="Vouchers imported" value={totalVouchers.toLocaleString("en-IN")} />
        </div>
      )}

      {/* Upload widget — client island */}
      <TallyUploader />

      {/* How-to */}
      <details className="rounded-lg border bg-card p-4">
        <summary className="cursor-pointer font-medium text-sm">
          How to export your Tally XML
        </summary>
        <ol className="mt-3 space-y-2 text-sm text-muted-foreground list-decimal pl-4">
          <li>
            Open Tally Prime &rarr; <strong>Gateway of Tally</strong>
          </li>
          <li>
            Go to <strong>Display More Reports</strong> &rarr;{" "}
            <strong>Day Book</strong>
          </li>
          <li>
            Press <strong>Alt + E</strong> (Export) and choose{" "}
            <strong>Format: XML</strong>
          </li>
          <li>
            Pick a date range (recommend the current fiscal year for the
            first import)
          </li>
          <li>
            Save the file and upload it above. Max 10 MB in v1; larger
            files with background processing are coming soon.
          </li>
        </ol>
      </details>

      {/* History list */}
      <div>
        <h2 className="font-medium text-sm mb-2">Import history</h2>
        {batches.length === 0 ? (
          <div className="rounded-lg border bg-card p-8 text-center text-sm text-muted-foreground">
            No imports yet. Upload a Tally XML above to get started.
          </div>
        ) : (
          <ul className="space-y-2">
            {batches.map((b) => (
              <BatchRow key={b.id} batch={b} />
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border bg-card px-4 py-3">
      <div className="text-xs uppercase tracking-wide text-muted-foreground">
        {label}
      </div>
      <div className="text-2xl font-semibold mt-1">{value}</div>
    </div>
  );
}

function BatchRow({
  batch,
}: {
  batch: {
    id: string;
    sourceFormat: string;
    sourceFilename: string;
    sourceFilesizeB: number;
    status: string;
    totalLedgers: number;
    totalVouchers: number;
    insertedLedgers: number;
    insertedVouchers: number;
    warnings: unknown;
    error: string | null;
    startedAt: Date;
    completedAt: Date | null;
    rollbackExpiresAt: Date | null;
  };
}) {
  const Icon =
    batch.status === "done"
      ? CheckCircle2
      : batch.status === "failed" || batch.status === "rolled_back"
        ? AlertCircle
        : Clock;
  const iconColor =
    batch.status === "done"
      ? "text-emerald-600"
      : batch.status === "failed"
        ? "text-red-600"
        : batch.status === "rolled_back"
          ? "text-zinc-500"
          : "text-amber-600";
  const warningsCount =
    Array.isArray(batch.warnings) ? batch.warnings.length : 0;

  return (
    <li className="rounded-lg border bg-card p-3 flex items-start gap-3">
      <Icon className={`h-5 w-5 mt-0.5 shrink-0 ${iconColor}`} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <FileSpreadsheet className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="font-medium text-sm truncate">
            {batch.sourceFilename}
          </span>
          <span className="text-[10px] uppercase tracking-wide rounded px-1.5 py-0.5 bg-muted">
            {batch.sourceFormat}
          </span>
          <span className="text-[10px] uppercase tracking-wide rounded px-1.5 py-0.5 bg-muted">
            {batch.status}
          </span>
        </div>
        <div className="text-xs text-muted-foreground mt-1">
          {batch.status === "done" && (
            <>
              {batch.insertedLedgers} ledgers &middot;{" "}
              {batch.insertedVouchers} vouchers
              {warningsCount > 0 && (
                <>
                  {" "}
                  &middot; <span className="text-amber-700">
                    {warningsCount} warning{warningsCount === 1 ? "" : "s"}
                  </span>
                </>
              )}
            </>
          )}
          {batch.status === "failed" && (
            <span className="text-red-700">
              Failed: {batch.error ?? "unknown error"}
            </span>
          )}
          {batch.status === "running" && "Importing..."}
          {batch.status === "rolled_back" && "Rolled back"}
        </div>
        <div className="text-[11px] text-muted-foreground mt-0.5">
          {format(batch.startedAt, "dd MMM yyyy, HH:mm")}
          {batch.completedAt && batch.status === "done" && (
            <>
              {" "}&middot; took{" "}
              {Math.round(
                (batch.completedAt.getTime() - batch.startedAt.getTime()) / 1000
              )}s
            </>
          )}
          {batch.rollbackExpiresAt && batch.status === "done" && (
            <>
              {" "}&middot; rollback available until{" "}
              {format(batch.rollbackExpiresAt, "dd MMM")}
            </>
          )}
        </div>
        {/* Sprint 4 — show Undo button on Done batches within
            their rollback window. */}
        {batch.status === "done" &&
          batch.rollbackExpiresAt &&
          batch.rollbackExpiresAt.getTime() > Date.now() && (
            <div className="mt-2">
              <RollbackButton batchId={batch.id} />
            </div>
          )}
      </div>
    </li>
  );
}
