import Link from "next/link";
import { LoginForm } from "./form";

export const metadata = { title: "Sign in" };

export default function LoginPage({ searchParams }: { searchParams: Record<string, string> }) {
  const verified = searchParams.verified === "1";
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Welcome back</h1>
        <p className="text-sm text-muted-foreground">Sign in to continue to Quikfinance.</p>
      </div>
      {verified && (
        <div className="text-sm text-emerald-700 bg-emerald-50 dark:bg-emerald-950/30 dark:text-emerald-200 border border-emerald-200 dark:border-emerald-900 rounded-md px-3 py-2">
          Email verified — sign in to continue.
        </div>
      )}
      <LoginForm />
      <div className="text-sm text-center text-muted-foreground">
        New to Quikfinance? <Link href="/signup" className="text-primary hover:underline font-medium">Create an account</Link>
      </div>
    </div>
  );
}
