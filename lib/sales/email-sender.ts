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
    await db.emailJob.update({
      where: { id: job.id },
      data: {
        status: job.attempts + 1 >= 5 ? "FAILED" : "PENDING",
        attempts: { increment: 1 },
        lastError: message,
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
