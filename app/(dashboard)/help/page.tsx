import Link from "next/link";
import {
  HelpCircle,
  ChevronRight,
  CalendarClock,
  Sparkles,
  ShoppingCart,
  Receipt,
  Landmark,
  FileBadge,
  BarChart3,
} from "lucide-react";
import { HELP_CATEGORIES, allFaqCount } from "@/lib/help/faqs";

export const metadata = { title: "Help · Quikfinance" };
export const dynamic = "force-static";

const CATEGORY_ICONS: Record<
  string,
  React.ComponentType<{ className?: string }>
> = {
  "fiscal-year-end-tasks": CalendarClock,
  "getting-started": Sparkles,
  "sales-and-invoicing": ShoppingCart,
  "purchases-and-bills": Receipt,
  banking: Landmark,
  "taxes-and-gst": FileBadge,
  reports: BarChart3,
};

/**
 * Quikfinance Help index — Zoho-style category grid.
 *
 * Server-only render. Each category card links to
 * `/help/{slug}` which renders the per-category Q&A page.
 */
export default function HelpIndexPage() {
  const totalFaqs = allFaqCount();

  return (
    <div className="min-h-screen">
      {/* ── Top banner ────────────────────────────────────────── */}
      <div className="border-b bg-gradient-to-b from-muted/30 to-background">
        <div className="max-w-6xl mx-auto px-6 py-8">
          <div className="flex items-center gap-3">
            <div className="h-12 w-12 rounded-md bg-blue-50 dark:bg-blue-950/40 flex items-center justify-center">
              <HelpCircle className="h-6 w-6 text-blue-600" />
            </div>
            <div>
              <h1 className="text-2xl font-semibold">Help Center</h1>
              <p className="text-sm text-muted-foreground">
                Browse {totalFaqs} answers across{" "}
                {HELP_CATEGORIES.length} topics. Can&apos;t find what
                you need?{" "}
                <Link
                  href="mailto:support@quikfinance.in"
                  className="text-primary hover:underline"
                >
                  Email support
                </Link>
                .
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-6 py-6 space-y-6">
        {/* ── Category grid ──────────────────────────────────── */}
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
          {HELP_CATEGORIES.map((cat) => {
            const Icon = CATEGORY_ICONS[cat.slug] ?? HelpCircle;
            return (
              <Link
                key={cat.slug}
                href={`/help/${cat.slug}`}
                className="rounded-lg border bg-background p-5 hover:shadow-md hover:border-primary/30 transition flex flex-col gap-3"
              >
                <div className="flex items-start gap-3">
                  <div className="h-10 w-10 rounded-full bg-blue-50 dark:bg-blue-950/40 flex items-center justify-center shrink-0">
                    <Icon className="h-5 w-5 text-blue-600" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h2 className="font-semibold text-base leading-tight">
                      {cat.title}
                    </h2>
                    <p className="text-xs text-muted-foreground">
                      {cat.faqs.length} article
                      {cat.faqs.length === 1 ? "" : "s"}
                    </p>
                  </div>
                </div>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  {cat.description}
                </p>
                <span className="inline-flex items-center gap-1 text-sm text-primary mt-auto">
                  Browse
                  <ChevronRight className="h-3.5 w-3.5" />
                </span>
              </Link>
            );
          })}
        </div>

        {/* ── Footer help banner ─────────────────────────────── */}
        <div className="rounded-lg border bg-blue-50/40 dark:bg-blue-950/10 p-5 flex items-start gap-4">
          <div className="h-10 w-10 rounded-md bg-blue-100 dark:bg-blue-900/40 flex items-center justify-center shrink-0">
            <HelpCircle className="h-5 w-5 text-blue-600" />
          </div>
          <div className="flex-1 space-y-1">
            <h2 className="text-base font-semibold">Still stuck?</h2>
            <p className="text-sm text-muted-foreground">
              Reach out to our support team — we&apos;ll get back
              within one business day.
            </p>
            <div className="flex items-center gap-4 text-sm pt-1">
              <a
                href="mailto:support@quikfinance.in"
                className="text-primary hover:underline"
              >
                support@quikfinance.in
              </a>
              <span className="text-muted-foreground">
                Helpline: 18003093036 · Mon-Fri 9 AM - 7 PM
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
