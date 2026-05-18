import { Resend } from "resend";

const resend = process.env.RESEND_API_KEY
  ? new Resend(process.env.RESEND_API_KEY)
  : null;

// IMPORTANT: use `||` (not `??`) so an EMPTY-STRING env var also
// falls back. We hit this in production where EMAIL_FROM was set
// to "" and Resend silently rejected every send.
//
// Default is Resend's sandbox sender — it works out of the box
// without needing to verify a custom domain. Replace via Vercel
// env once your custom sending domain is verified in Resend.
const FROM =
  (process.env.EMAIL_FROM && process.env.EMAIL_FROM.trim()) ||
  "Quikfinance <onboarding@resend.dev>";

export class EmailSendError extends Error {
  constructor(
    message: string,
    public readonly resendError?: unknown
  ) {
    super(message);
    this.name = "EmailSendError";
  }
}

/**
 * Send a transactional email via Resend.
 *
 * Behaviour:
 *  - In dev (no RESEND_API_KEY): logs to console + returns
 *    `{ ok: true, dev: true }` so local dev flows don't break
 *  - In prod with API key: calls Resend; if Resend returns an
 *    error, this function **throws an EmailSendError** with the
 *    real Resend error message. Callers should try/catch and
 *    surface a clear failure UI rather than silently swallow
 *    the problem.
 */
export async function sendEmail(args: {
  to: string;
  subject: string;
  html: string;
}) {
  if (!resend) {
    console.log("[email:dev]", args.subject, "→", args.to);
    console.log(args.html);
    return { ok: true, dev: true } as const;
  }
  const r = await resend.emails.send({ from: FROM, ...args });
  if (r.error) {
    const detail =
      typeof r.error === "object" && r.error && "message" in r.error
        ? String((r.error as { message?: unknown }).message)
        : String(r.error);
    console.error("[email] Resend rejected send", {
      from: FROM,
      to: args.to,
      subject: args.subject,
      error: r.error,
    });
    throw new EmailSendError(`Email delivery failed: ${detail}`, r.error);
  }
  return { ok: true, dev: false, id: r.data?.id } as const;
}

export function verificationEmail(link: string) {
  return `<p>Welcome to Quikfinance.</p>
<p><a href="${link}">Verify your email</a> to finish setting up your account.</p>
<p>This link expires in 24 hours.</p>`;
}

export function passwordResetEmail(link: string) {
  return `<p>You asked to reset your Quikfinance password.</p>
<p><a href="${link}">Reset password</a> — this link expires in 30 minutes.</p>
<p>If you did not request this, ignore this email.</p>`;
}
