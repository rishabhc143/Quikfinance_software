import { Resend } from "resend";

const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;
const FROM = process.env.EMAIL_FROM ?? "Quikfinance <noreply@quikfinance.app>";

export async function sendEmail(args: { to: string; subject: string; html: string }) {
  if (!resend) {
    console.log("[email:dev]", args.subject, "→", args.to);
    console.log(args.html);
    return { ok: true, dev: true };
  }
  const r = await resend.emails.send({ from: FROM, ...args });
  return { ok: !r.error, dev: false, id: r.data?.id };
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
