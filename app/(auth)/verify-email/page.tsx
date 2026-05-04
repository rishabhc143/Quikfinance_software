import Link from "next/link";

export const metadata = { title: "Verify your email" };

export default function VerifyEmailPage({ searchParams }: { searchParams: Record<string, string> }) {
  const status = searchParams.status ?? "sent";
  return (
    <div className="space-y-4 text-center">
      <h1 className="text-2xl font-semibold">Verify your email</h1>
      {status === "sent" && (
        <p className="text-sm text-muted-foreground">We sent a verification link to the email you signed up with. The link expires in 24 hours.</p>
      )}
      {status === "expired" && (
        <p className="text-sm text-destructive">That link has expired. <Link href="/login" className="underline">Sign in</Link> to resend.</p>
      )}
      {status === "missing" && (
        <p className="text-sm text-destructive">No verification token in this URL.</p>
      )}
      <p className="text-xs text-muted-foreground">In development, the link is logged to your server console if no email provider is configured.</p>
      <Link href="/login" className="text-sm text-primary hover:underline">Back to sign in</Link>
    </div>
  );
}
