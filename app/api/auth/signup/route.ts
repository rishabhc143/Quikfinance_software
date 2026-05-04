import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { db } from "@/lib/db";
import { generateReferralCode } from "@/lib/utils";
import { sendEmail, verificationEmail } from "@/lib/email";
import crypto from "node:crypto";

const schema = z.object({
  name: z.string().min(2),
  email: z.string().email(),
  password: z.string().min(8),
  country: z.string().default("IN"),
  currency: z.string().default("INR"),
});

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "Invalid input" }, { status: 400 });
  }
  const { name, email, password } = parsed.data;
  const existing = await db.user.findUnique({ where: { email } });
  if (existing) {
    return NextResponse.json({ ok: false, error: "Email already in use" }, { status: 409 });
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
  await sendEmail({ to: email, subject: "Verify your Quikfinance email", html: verificationEmail(link) });

  return NextResponse.json({ ok: true });
}
