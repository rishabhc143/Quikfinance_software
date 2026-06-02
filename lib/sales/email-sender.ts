import { db } from "@/lib/db";
import { sendEmail } from "@/lib/email";

/**
 * Enqueue an email job. The "Save and Send" flow always goes through this —
 * server actions return immediately, the cron retries failed sends.
 *
 * If RESEND_API_KEY is unset, sendEmail() falls back to console-logging in
 * dev; the EmailJob is still recorded so devs can inspect the queue.
 */
export async function enqueueEmail(args: {
  organizationId: string;
  toEmail: string;
  ccEmails?: string[];
  subject: string;
  bodyHtml: string;
  attachmentUrl?: string;
  documentType?: string;
  documentId?: string;
  scheduledFor?: Date;
}) {
  const job = await db.emailJob.create({
    data: {
      organizationId: args.organizationId,
      toEmail: args.toEmail,
      ccEmails: args.ccEmails ?? [],
      subject: args.subject,
      bodyHtml: args.bodyHtml,
      attachmentUrl: args.attachmentUrl,
      documentType: args.documentType,
      documentId: args.documentId,
      scheduledFor: args.scheduledFor ?? new Date(),
      status: "PENDING",
    },
  });
  return job;
}

/**
 * Audit r2 B.2: exponential backoff schedule for failed email jobs.
 * Indexed by the NEW `attempts` value after increment. Before this,
 * a failing job kept its original `scheduledFor` so every cron tick
 * burned through the same 50-row batch — when the email service was
 * down for a day, the queue thrashed.
 *
 *   attempt 1 → +1m, attempt 2 → +5m, attempt 3 → +30m,
 *   attempt 4 → +6h,  attempt 5+ → marked FAILED (no retry)
 *
 * Net retry window across attempts 1-4 ≈ 6h 36m, matching common
 * transactional-email retry curves (Resend, SendGrid, Stripe).
 */
const RETRY_BACKOFF_MS: Record<number, number> = {
  1: 60_000, // 1 minute
  2: 300_000, // 5 minutes
  3: 1_800_000, // 30 minutes
  4: 21_600_000, // 6 hours
};

/**
 * Process a single EmailJob. Used by the cron route. Idempotent on success
 * (status flip + sentAt). On failure, increments attempts and stores last
 * error; the next cron tick retries.
 */
export async function processEmailJob(jobId: string) {
  const job = await db.emailJob.findUnique({ where: { id: jobId } });
  if (!job) throw new Error(`EmailJob ${jobId} not found`);
  if (job.status === "SENT") return { ok: true, alreadySent: true };

  try {
    const r = await sendEmail({
      to: job.toEmail,
      subject: job.subject,
      html: job.bodyHtml,
    });
    if (!r.ok) throw new Error("send failed");
    await db.emailJob.update({
      where: { id: job.id },
      data: { status: "SENT", sentAt: new Date(), attempts: { increment: 1 } },
    });
    return { ok: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const nextAttempts = job.attempts + 1;
    const isFinalFailure = nextAttempts >= 5;
    const backoffMs = RETRY_BACKOFF_MS[nextAttempts];
    // When retrying, push scheduledFor forward so the next cron tick
    // doesn't immediately try this job again. drainPendingEmails
    // filters by `scheduledFor: { lte: now }`, so future-dated jobs
    // are skipped until the backoff elapses.
    await db.emailJob.update({
      where: { id: job.id },
      data: {
        status: isFinalFailure ? "FAILED" : "PENDING",
        attempts: { increment: 1 },
        lastError: message,
        ...(isFinalFailure || !backoffMs
          ? {}
          : { scheduledFor: new Date(Date.now() + backoffMs) }),
      },
    });
    return { ok: false, error: message };
  }
}

/**
 * Drain pending jobs whose scheduledFor has elapsed, up to a batch limit.
 * Called by /api/cron/email-job-retry.
 */
export async function drainPendingEmails(limit = 50) {
  const due = await db.emailJob.findMany({
    where: {
      status: "PENDING",
      scheduledFor: { lte: new Date() },
      attempts: { lt: 5 },
    },
    take: limit,
    orderBy: { scheduledFor: "asc" },
  });
  const results = [];
  for (const job of due) {
    results.push({ id: job.id, ...(await processEmailJob(job.id)) });
  }
  return { processed: results.length, results };
}
