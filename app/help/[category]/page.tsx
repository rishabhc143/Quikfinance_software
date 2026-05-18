import Link from "next/link";
import { notFound } from "next/navigation";
import {
  HelpCircle,
  ChevronRight,
  ChevronLeft,
  ChevronDown,
} from "lucide-react";
import { HELP_CATEGORIES, findCategory } from "@/lib/help/faqs";
import { HashOpener } from "./hash-opener";

export const dynamic = "force-static";

export function generateStaticParams() {
  return HELP_CATEGORIES.map((c) => ({ category: c.slug }));
}

export function generateMetadata({
  params,
}: {
  params: { category: string };
}) {
  const cat = findCategory(params.category);
  return {
    title: cat
      ? `${cat.title} · Help · Quikfinance`
      : "Help · Quikfinance",
  };
}

/**
 * Quikfinance Help — per-category Q&A page.
 *
 * Server-rendered. Uses native <details>/<summary> for the
 * accordion behaviour so we don't need a client component or JS
 * — keeps the page bulletproof and SEO-friendly.
 *
 * Each FAQ has a stable id matching its anchor (e.g.
 * /help/fiscal-year-end-tasks#modify-invoice-number).
 */
export default function HelpCategoryPage({
  params,
}: {
  params: { category: string };
}) {
  const category = findCategory(params.category);
  if (!category) notFound();

  return (
    <div className="min-h-screen bg-background">
      {/* ── Brand nav bar ────────────────────────────────────── */}
      <header className="border-b bg-background">
        <div className="max-w-6xl mx-auto px-6 py-3 flex items-center justify-between">
          <Link
            href="/"
            className="text-base font-semibold hover:text-primary"
          >
            Quikfinance
          </Link>
          <Link
            href="/"
            className="text-sm text-primary hover:underline"
          >
            ← Back to app
          </Link>
        </div>
      </header>

      {/* ── Top header ─────────────────────────────────────────── */}
      <div className="border-b bg-gradient-to-b from-muted/30 to-background">
        <div className="max-w-4xl mx-auto px-6 py-8">
          {/* Breadcrumb */}
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-4">
            <Link
              href="/help"
              className="hover:text-primary inline-flex items-center gap-1"
            >
              <ChevronLeft className="h-3 w-3" />
              Help Center
            </Link>
            <ChevronRight className="h-3 w-3" />
            <span>{category.title}</span>
          </div>

          <div className="flex items-center gap-3">
            <div className="h-12 w-12 rounded-md bg-blue-50 dark:bg-blue-950/40 flex items-center justify-center">
              <HelpCircle className="h-6 w-6 text-blue-600" />
            </div>
            <div>
              <h1 className="text-2xl font-semibold">
                {category.title}
              </h1>
              <p className="text-sm text-muted-foreground">
                {category.description}
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-6 py-6">
        {/* Auto-opens whichever <details> matches the URL hash. */}
        <HashOpener />

        {/* ── Q&A accordions ─────────────────────────────────── */}
        <div className="space-y-2">
          {category.faqs.map((faq) => (
            <details
              key={faq.id}
              id={faq.id}
              className="group border rounded-lg bg-background open:shadow-sm"
            >
              <summary className="cursor-pointer list-none flex items-start gap-3 px-5 py-4 hover:bg-muted/30 transition rounded-lg group-open:bg-muted/20">
                <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5 transition-transform group-open:rotate-0 -rotate-90" />
                <span className="font-medium text-sm leading-tight flex-1">
                  {faq.q}
                </span>
              </summary>
              <div className="px-5 pb-5 pt-1 pl-12 space-y-2 text-foreground">
                {faq.a}
              </div>
            </details>
          ))}
        </div>

        {/* ── Other categories ─────────────────────────────── */}
        <div className="mt-10 pt-6 border-t space-y-3">
          <h2 className="text-sm font-semibold text-muted-foreground">
            Other topics
          </h2>
          <div className="flex flex-wrap gap-2">
            {HELP_CATEGORIES.filter((c) => c.slug !== category.slug).map(
              (c) => (
                <Link
                  key={c.slug}
                  href={`/help/${c.slug}`}
                  className="text-xs rounded-full border px-3 py-1.5 hover:bg-muted/50 transition"
                >
                  {c.title}
                </Link>
              )
            )}
          </div>
        </div>

        {/* ── Support footer ───────────────────────────────── */}
        <div className="mt-8 rounded-lg border bg-blue-50/40 dark:bg-blue-950/10 p-5 flex items-start gap-4">
          <div className="h-10 w-10 rounded-md bg-blue-100 dark:bg-blue-900/40 flex items-center justify-center shrink-0">
            <HelpCircle className="h-5 w-5 text-blue-600" />
          </div>
          <div className="flex-1 space-y-1">
            <h2 className="text-base font-semibold">
              Didn&apos;t find your answer?
            </h2>
            <p className="text-sm text-muted-foreground">
              Email our support team and we&apos;ll get back within
              one business day.
            </p>
            <div className="flex items-center gap-4 text-sm pt-1">
              <a
                href="mailto:support@quikfinance.in"
                className="text-primary hover:underline"
              >
                support@quikfinance.in
              </a>
              <span className="text-muted-foreground">
                Helpline: 18003093036
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
