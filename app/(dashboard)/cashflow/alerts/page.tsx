import { AlertTriangle, Bell, ShieldCheck } from "lucide-react";
import { format } from "date-fns";
import { requireOrganization } from "@/lib/auth-helpers";
import { db } from "@/lib/db";
import { DismissButton } from "./dismiss-button";
import { AlertSourceLink } from "./alert-source-link";

export const metadata = { title: "Anomaly Alerts" };
export const dynamic = "force-dynamic"; // fresh fetch every page-load

/**
 * CF-7 — Anomaly-alert inbox.
 *
 * Lists OPEN alerts surfaced by the nightly anomaly detector, ranked
 * by severity (high → medium → low) then by detection date desc.
 *
 * We do NOT show dismissed alerts here. Dismissed history is one of
 * the deferred Phase-2 items.
 *
 * Why severity-coloured CARDS instead of a dense table: each anomaly
 * needs a one-glance explanation of what went wrong + what to do.
 * Tables compress that into truncated cells. The list is rarely
 * long (a healthy org sees < 5 open alerts at any time), so the
 * extra vertical space is fine.
 */
export default async function AnomalyAlertsPage() {
  const { organization } = await requireOrganization();

  const alerts = await db.anomalyAlert.findMany({
    where: { organizationId: organization.id, status: "open" },
    select: {
      id: true,
      detectorKey: true,
      severity: true,
      title: true,
      description: true,
      refType: true,
      refId: true,
      createdAt: true,
    },
    orderBy: { createdAt: "desc" }, // tie-break, severity handled below
    take: 200, // safety cap; UI breaks long before this anyway
  });

  // Sort by severity rank, then by recency.
  const sevRank: Record<string, number> = { high: 0, medium: 1, low: 2 };
  const sorted = alerts.slice().sort((a, b) => {
    const sa = sevRank[a.severity] ?? 3;
    const sb = sevRank[b.severity] ?? 3;
    if (sa !== sb) return sa - sb;
    return b.createdAt.getTime() - a.createdAt.getTime();
  });

  const counts = {
    high: sorted.filter((a) => a.severity === "high").length,
    medium: sorted.filter((a) => a.severity === "medium").length,
    low: sorted.filter((a) => a.severity === "low").length,
  };

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <div className="flex items-start gap-3">
        <Bell className="h-6 w-6 text-primary mt-1" />
        <div className="flex-1">
          <h1 className="text-2xl font-semibold tracking-tight">
            Anomaly Alerts
          </h1>
          <p className="text-sm text-muted-foreground mt-1 max-w-3xl">
            Proactive findings from the nightly anomaly detector — possible
            duplicate bills, stuck recurring profiles, and other issues worth
            your attention. Dismiss what isn&apos;t real; the detector will
            re-surface anything that re-emerges later.
          </p>
        </div>
      </div>

      {sorted.length === 0 ? (
        <div className="rounded-lg border bg-card p-8 text-center">
          <ShieldCheck className="h-10 w-10 text-emerald-600 mx-auto mb-3" />
          <h2 className="font-medium">No open alerts</h2>
          <p className="text-sm text-muted-foreground mt-1">
            The detector ran overnight and found nothing unusual. We&apos;ll
            check again in 24 hours.
          </p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-3 gap-3">
            <SeverityChip count={counts.high} label="High" tone="high" />
            <SeverityChip count={counts.medium} label="Medium" tone="medium" />
            <SeverityChip count={counts.low} label="Low" tone="low" />
          </div>

          <div className="space-y-3">
            {sorted.map((a) => (
              <AlertCard
                key={a.id}
                id={a.id}
                severity={a.severity}
                title={a.title}
                description={a.description}
                detectedAt={a.createdAt}
                detectorKey={a.detectorKey}
                refType={a.refType}
                refId={a.refId}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function SeverityChip({
  count,
  label,
  tone,
}: {
  count: number;
  label: string;
  tone: "high" | "medium" | "low";
}) {
  const colors: Record<typeof tone, string> = {
    high: "border-red-200 bg-red-50 text-red-900",
    medium: "border-amber-200 bg-amber-50 text-amber-900",
    low: "border-zinc-200 bg-zinc-50 text-zinc-900",
  };
  return (
    <div
      className={`rounded-lg border px-4 py-3 ${colors[tone]} flex items-baseline justify-between`}
    >
      <div className="text-xs uppercase tracking-wide font-medium">{label}</div>
      <div className="text-2xl font-semibold">{count}</div>
    </div>
  );
}

function AlertCard(props: {
  id: string;
  severity: string;
  title: string;
  description: string;
  detectedAt: Date;
  detectorKey: string;
  refType: string | null;
  refId: string | null;
}) {
  const sev = props.severity;
  const containerClass =
    sev === "high"
      ? "border-red-200 bg-red-50/50"
      : sev === "medium"
        ? "border-amber-200 bg-amber-50/50"
        : "border-zinc-200 bg-zinc-50/50";
  const iconColor =
    sev === "high"
      ? "text-red-600"
      : sev === "medium"
        ? "text-amber-600"
        : "text-zinc-500";
  const badgeColor =
    sev === "high"
      ? "bg-red-600"
      : sev === "medium"
        ? "bg-amber-500"
        : "bg-zinc-400";

  return (
    <div className={`rounded-lg border p-4 ${containerClass}`}>
      <div className="flex items-start gap-3">
        <AlertTriangle className={`h-5 w-5 mt-0.5 shrink-0 ${iconColor}`} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span
              className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] uppercase tracking-wide font-semibold text-white ${badgeColor}`}
            >
              {sev}
            </span>
            <span className="text-[11px] uppercase tracking-wide text-muted-foreground">
              {props.detectorKey.replace(/_/g, " ")}
            </span>
            <span className="text-[11px] text-muted-foreground">
              detected {format(props.detectedAt, "dd MMM yyyy")}
            </span>
          </div>
          <h3 className="font-medium mt-1.5">{props.title}</h3>
          <p className="text-sm text-muted-foreground mt-1 whitespace-pre-line">
            {props.description}
          </p>
          {props.refType && props.refId && (
            <div className="mt-2">
              <AlertSourceLink refType={props.refType} refId={props.refId} />
            </div>
          )}
        </div>
        <DismissButton id={props.id} />
      </div>
    </div>
  );
}
