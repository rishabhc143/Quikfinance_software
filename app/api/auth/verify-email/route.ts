import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const token = searchParams.get("token");
  if (!token) return NextResponse.redirect(new URL("/verify-email?status=missing", req.url));

  const record = await db.emailVerificationToken.findUnique({ where: { token } });
  if (!record || record.expires < new Date()) {
    return NextResponse.redirect(new URL("/verify-email?status=expired", req.url));
  }
  await db.user.update({ where: { id: record.userId }, data: { emailVerified: new Date() } });
  await db.emailVerificationToken.delete({ where: { token } });
  return NextResponse.redirect(new URL("/login?verified=1", req.url));
}
