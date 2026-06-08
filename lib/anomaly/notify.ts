import "server-only";

/**
 * AD-v2 — Email push for HIGH-severity alerts.
 *
 * When the nightly cron inserts new HIGH-severity alerts, this
 * sends a digest email to the org owner. Wired in
 * app/api/cron/anomaly-detect/route.ts after the per-org detector
 * pass completes.
 *
 * Why a separate file:
 *   - Keeps runAnomalyDetectors pure (no side effects beyond DB
 *     writes). Email failures shouldn't poison the next detection.
 *   - Easy to mock in tests.
 *
 * Why HIGH-only:
 *   - MEDIUM/LOW shouldn't ping the inbox — they live in the in-app
 *     alerts list. Email is reserved for "you should look at this
 *     before tomorrow" findings.
 *   - HIGH-severity false-positive cost is low; missed-true-positive
 *     cost is high. Erring on the side of more notifications is
 *     correct for this severity.
 *
 * Idempotency:
 *   - Caller passes only NEWLY inserted alerts (i.e. the ones the
 *     matcher just created). Re-running the cron on the same day
 *     never produces "newly inserted" alerts for already-OPEN
 *     fingerprints, so we never double-email.
 */

import { db } from "@/lib/db";
import { sendEmail } from "@/lib/email";

export type NewAlert = {
  id: string;
  detectorKey: string;
  severity: string;
  title: string;
  description: string;
};

export type NotifyResult = {
  /** Number of emails sent (one per org). */
  emailsSent: number;
  /** Alerts that were eligible (severity=high in the input). */
  highAlertsConsidered: number;
};

/** Email the org's primary owner about HIGH-severity new alerts.
 *
 *  Owner = the User whose membership.role === "OWNER" (or earliest
 *  member if no OWNER tag exists). Single email digest, max 10
 *  alerts inline + "...and N more" if over the cap.
 *
 *  Returns counts; never throws — email failures are logged with
 *  `[anomaly/notify]` prefix and swallowed so they don't break
 *  the cron. */
export async function notifyHighSeverity(args: {
  organizationId: string;
  organizationName: string;
  newAlerts: NewAlert[];
  /** Optional override for tests / local dev. */
  recipient?: string;
}): Promise<NotifyResult> {
  const high = args.newAlerts.filter((a) => a.severity === "high");
  if (high.length === 0) {
    return { emailsSent: 0, highAlertsConsidered: 0 };
  }

  // Find recipient.
  let recipient = args.recipient;
  if (!recipient) {
    const membership = await db.organizationMembership.findFirst({
      where: { organizationId: args.organizationId },
      orderBy: [{ role: "asc" }, { createdAt: "asc" }],
      select: { user: { select: { email: true } } },
    });
    recipient = membership?.user.email ?? undefined;
  }
  if (!recipient) {
    console.warn(
      `[anomaly/notify] no recipient email found for org ${args.organizationId}`
    );
    return { emailsSent: 0, highAlertsConsidered: high.length };
  }

  const subject =
    high.length === 1
      ? `[Quikfinance] ${high[0].title}`
      : `[Quikfinance] ${high.length} high-severity alerts overnight`;

  const shown = high.slice(0, 10);
  const overflow = high.length - shown.length;

  const html = renderDigestHtml({
    orgName: args.organizationName,
    alerts: shown,
    overflow,
  });

  try {
    await sendEmail({ to: recipient, subject, html });
    return { emailsSent: 1, highAlertsConsidered: high.length };
  } catch (e) {
    console.warn("[anomaly/notify] send failed", e);
    return { emailsSent: 0, highAlertsConsidered: high.length };
  }
}

function renderDigestHtml(args: {
  orgName: string;
  alerts: NewAlert[];
  overflow: number;
}): string {
  const items = args.alerts
    .map(
      (a) => `
    <tr>
      <td style="padding:12px 14px;border-bottom:1px solid #e5e7eb">
        <div style="font-weight:600;color:#111;font-size:14px;margin-bottom:4px">
          ${escapeHtml(a.title)}
        </div>
        <div style="color:#555;font-size:13px;line-height:1.5">
          ${escapeHtml(a.description)}
        </div>
      </td>
    </tr>`
    )
    .join("");

  return `<!doctype html><html><body style="margin:0;font-family:-apple-system,Segoe UI,sans-serif;background:#f9fafb;padding:20px">
  <div style="max-width:560px;margin:0 auto;background:#fff;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden">
    <div style="background:#dc2626;color:#fff;padding:14px 18px">
      <div style="font-size:12px;opacity:0.85">${escapeHtml(args.orgName)}</div>
      <div style="font-size:18px;font-weight:600;margin-top:2px">High-severity anomaly alerts</div>
    </div>
    <table style="width:100%;border-collapse:collapse">
      ${items}
    </table>
    ${
      args.overflow > 0
        ? `<div style="padding:12px 14px;border-top:1px solid #e5e7eb;color:#666;font-size:13px;font-style:italic">
            ...and ${args.overflow} more. See all at <a href="https://quikfinance-software.vercel.app/cashflow/alerts">/cashflow/alerts</a>.
          </div>`
        : ""
    }
    <div style="padding:14px;background:#f9fafb;border-top:1px solid #e5e7eb;text-align:center">
      <a href="https://quikfinance-software.vercel.app/cashflow/alerts"
         style="display:inline-block;background:#111;color:#fff;padding:10px 18px;border-radius:6px;text-decoration:none;font-size:14px;font-weight:500">
        Review in Quikfinance
      </a>
    </div>
    <div style="padding:10px 14px;color:#999;font-size:11px;text-align:center">
      Sent by the Quikfinance anomaly detector. Only HIGH-severity findings trigger email; medium/low live in-app only.
    </div>
  </div>
</body></html>`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
