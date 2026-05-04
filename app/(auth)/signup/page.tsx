import Link from "next/link";
import { SignupForm } from "./form";

export const metadata = { title: "Create your account" };

export default function SignupPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Create your Quikfinance account</h1>
        <p className="text-sm text-muted-foreground">Free 14-day trial · No credit card required</p>
      </div>
      <SignupForm />
      <div className="text-sm text-center text-muted-foreground">
        Already have an account? <Link href="/login" className="text-primary hover:underline font-medium">Sign in</Link>
      </div>
    </div>
  );
}
