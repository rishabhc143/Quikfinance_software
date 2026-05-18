import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { z } from "zod";
import crypto from "node:crypto";
import { db } from "@/lib/db";
import { generateReferralCode } from "@/lib/utils";
import { sendEmail, verificationEmail } from "@/lib/email";

const schema = z.object({
  name: z.string().min(2),
  email: z.string().email(),
  password: z.string().min(8),
  country: z.string().default("IN"),
  currency: z.string().default("INR"),
  // Optional: present when the user is accepting an invite from
  // the Settings → Users → "Send invitation" flow.
  inviteToken: z.string().optional(),
});

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: "Invalid input" },
      { status: 400 }
    );
  }
  const { name, email, password, inviteToken } = parsed.data;

  // ────────────────────────────────────────────────────────────────
  // Path A: Invitation acceptance
  // ────────────────────────────────────────────────────────────────
  if (inviteToken) {
    const tokenRow = await db.emailVerificationToken.findUnique({
      where: { token: inviteToken },
      include: { user: true },
    });

    if (!tokenRow || tokenRow.expires < new Date()) {
      return NextResponse.json(
        { ok: false, error: "Invitation link is invalid or expired." },
        { status: 400 }
      );
    }

    if (tokenRow.user.email !== email) {
      // Defense in depth — UI prefills + readonly the email, but
      // someone could still craft a request with a mismatched email.
      return NextResponse.json(
        {
          ok: false,
          error:
            "The email on the form doesn't match the invitation.",
        },
        { status: 400 }
      );
    }

    if (tokenRow.user.passwordHash !== null) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "This invitation has already been accepted. Try signing in instead.",
        },
        { status: 409 }
      );
    }

    // Activate the placeholder user.
    const passwordHash = await bcrypt.hash(password, 10);
    await db.user.update({
      where: { id: tokenRow.userId },
      data: {
        name,
        passwordHash,
        emailVerified: new Date(),
        referralCode: generateReferralCode(),
      },
    });
    // Consume the token so the link can't be reused.
    await db.emailVerificationToken.delete({
      where: { token: inviteToken },
    });

    return NextResponse.json({ ok: true, invited: true });
  }

  // ────────────────────────────────────────────────────────────────
  // Path B: Standard self-signup
  // ────────────────────────────────────────────────────────────────
  const existing = await db.user.findUnique({ where: { email } });
  if (existing) {
    return NextResponse.json(
      { ok: false, error: "Email already in use" },
      { status: 409 }
    );
  }
  const passwordHash = await bcrypt.hash(password, 10);
  const user = await db.user.create({
    data: {
      name,
      email,
      passwordHash,
      referralCode: generateReferralCode(),
    },
  });

  const token = crypto.randomBytes(32).toString("hex");
  await db.emailVerificationToken.create({
    data: {
      userId: user.id,
      token,
      expires: new Date(Date.now() + 24 * 60 * 60 * 1000),
    },
  });

  const link = `${process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"}/verify-email?token=${token}`;
  await sendEmail({
    to: email,
    subject: "Verify your Quikfinance email",
    html: verificationEmail(link),
  });

  return NextResponse.json({ ok: true });
}
