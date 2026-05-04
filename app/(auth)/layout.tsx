import Link from "next/link";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen grid lg:grid-cols-2">
      <aside className="hidden lg:flex relative bg-gradient-to-br from-blue-600 via-blue-700 to-indigo-800 text-white p-12 flex-col justify-between overflow-hidden">
        <div className="relative z-10">
          <Link href="/" className="flex items-center gap-2">
            <div className="h-10 w-10 rounded-md bg-white/15 backdrop-blur grid place-items-center font-bold text-lg">Q</div>
            <span className="text-xl font-semibold tracking-tight">Quikfinance</span>
          </Link>
        </div>
        <div className="relative z-10 space-y-6">
          <h2 className="text-3xl font-semibold leading-tight max-w-md">
            Accounting that gets out of your way.
          </h2>
          <ul className="space-y-2 text-blue-100 text-sm max-w-md">
            <li>· GST-ready invoicing for Indian businesses, multi-currency for everyone else</li>
            <li>· Real-time cash flow, payables, receivables, and tax dashboards</li>
            <li>· Built-in AI assistant for everyday bookkeeping questions</li>
            <li>· Bank feeds, recurring billing, audit trail — without spreadsheets</li>
          </ul>
        </div>
        <div className="relative z-10 text-xs text-blue-200">© Quikfinance · all rights reserved</div>
        <div className="absolute -top-32 -right-32 h-96 w-96 rounded-full bg-white/10 blur-3xl" />
        <div className="absolute -bottom-32 -left-32 h-96 w-96 rounded-full bg-indigo-500/30 blur-3xl" />
      </aside>
      <main className="flex items-center justify-center p-8">
        <div className="w-full max-w-md">{children}</div>
      </main>
    </div>
  );
}
