import { NextResponse } from "next/server";
import { z } from "zod";
import crypto from "node:crypto";
import { db } from "@/lib/db";
import { sendEmail, passwordResetEmail } from "@/lib/email";

const schema = z.object({ email: z.string().email() });

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ ok: false }, { status: 400 });

  const user = await db.user.findUnique({ where: { email: parsed.data.email } });
  // Respond ok regardless to avoid account enumeration.
  if (user) {
    const token = crypto.randomBytes(32).toString("hex");
    await db.passwordResetToken.create({
      data: { userId: user.id, token, expires: new Date(Date.now() + 30 * 60 * 1000) },
    });
    const link = `${process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"}/reset-password?token=${token}`;
    await sendEmail({ to: user.email, subject: "Reset your Quikfinance password", html: passwordResetEmail(link) });
  }
  return NextResponse.json({ ok: true });
}
