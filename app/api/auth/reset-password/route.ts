import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { db } from "@/lib/db";

const schema = z.object({ token: z.string().min(10), password: z.string().min(8) });

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ ok: false, error: "Invalid input" }, { status: 400 });

  const record = await db.passwordResetToken.findUnique({ where: { token: parsed.data.token } });
  if (!record || record.expires < new Date()) {
    return NextResponse.json({ ok: false, error: "Token invalid or expired" }, { status: 400 });
  }
  const passwordHash = await bcrypt.hash(parsed.data.password, 10);
  await db.user.update({ where: { id: record.userId }, data: { passwordHash } });
  await db.passwordResetToken.delete({ where: { token: parsed.data.token } });
  return NextResponse.json({ ok: true });
}
