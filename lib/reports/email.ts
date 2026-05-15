/**
 * REPORTS — Resend wrapper for scheduled-report email delivery.
 *
 * Why a thin wrapper:
 *  - Centralises the "from" address + Resend client construction
 *  - Lets the cron worker treat sending as a single async call
 *  - Gracefully degrades when RESEND_API_KEY isn't set (logs to
 *    console, returns a synthetic success) so local dev doesn't
 *    need a real API key
 */

import { Resend } from "resend";

const FROM_FALLBACK = "Quikfinance Reports <reports@resend.dev>";

type Attachment = {
  filename: string;
  content: Buffer | string;
};

export type SendReportEmailArgs = {
  to: string[];
  subject: string;
  reportTitle: string;
  organizationName: string;
  /** Pre-built body lines for the rendered HTML. */
  bodyLines?: string[];
  /** The attached file (PDF, XLSX, or CSV). */
  attachment: Attachment;
};

export type SendReportEmailResult =
  | { ok: true; id: string }
  | { ok: false; error: string };

/**
 * Send a scheduled-report email. Fail-open: if Resend errors,
 * caller still records a ScheduledReportRun with status=FAILED
 * and the error message. The cron worker continues to the next
 * scheduled report instead of crashing the run.
 */
export async function sendReportEmail(
  args: SendReportEmailArgs
): Promise<SendReportEmailResult> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM_EMAIL?.trim() || FROM_FALLBACK;

  // Graceful local-dev / staging mode: no API key configured.
  // Log the call and pretend it succeeded so the worker logic
  // still gets exercised end-to-end.
  if (!apiKey) {
    console.warn(
      "[reports/email] RESEND_API_KEY not configured — skipping real send",
      {
        to: args.to,
        subject: args.subject,
        attachment: args.attachment.filename,
      }
    );
    return { ok: true, id: "stub-no-resend-key" };
  }

  const resend = new Resend(apiKey);
  try {
    const html = buildHtml(args);
    const attachmentContent =
      args.attachment.content instanceof Buffer
        ? args.attachment.content
        : Buffer.from(args.attachment.content);

    // Resend's TS types vary by version — keep this as `unknown`
    // for the attachment shape so a minor patch upgrade doesn't
    // break the build.
    const result = await resend.emails.send({
      from,
      to: args.to,
      subject: args.subject,
      html,
      attachments: [
        {
          filename: args.attachment.filename,
          content: attachmentContent,
        },
      ],
    } as never);

    const id =
      (result as { data?: { id?: string }; id?: string }).data?.id ??
      (result as { id?: string }).id ??
      "unknown";

    return { ok: true, id };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[reports/email] Resend send failed", msg);
    return { ok: false, error: msg };
  }
}

function buildHtml(args: SendReportEmailArgs): string {
  const lines = args.bodyLines ?? [
    `Hi,`,
    `Your scheduled ${args.reportTitle} report for ${args.organizationName} is attached.`,
    `This email was sent automatically from Quikfinance.`,
  ];
  const body = lines
    .map((l) => `<p style="margin:0 0 12px 0;">${escapeHtml(l)}</p>`)
    .join("");
  return `<!doctype html>
<html>
  <body style="font-family: -apple-system, system-ui, sans-serif; color: #111; line-height: 1.5;">
    <div style="max-width: 560px; margin: 0 auto; padding: 24px;">
      <h1 style="font-size: 18px; margin: 0 0 16px 0;">${escapeHtml(args.reportTitle)}</h1>
      ${body}
      <p style="margin-top: 32px; font-size: 12px; color: #666;">
        Quikfinance · Scheduled Reports
      </p>
    </div>
  </body>
</html>`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
