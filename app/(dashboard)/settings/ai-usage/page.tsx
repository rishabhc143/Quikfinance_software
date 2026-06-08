import { format, startOfDay, subDays } from "date-fns";
import { Sparkles, TrendingUp, AlertTriangle } from "lucide-react";
import { requireOrganization } from "@/lib/auth-helpers";
import { db } from "@/lib/db";
import { DEFAULTS } from "@/lib/llm/guardrails";

export const metadata = { title: "AI Usage" };
export const dynamic = "force-dynamic";

/**
 * Guardrail 3 — AI usage telemetry dashboard.
 *
 * Server component pulling the last 30 days of OrganizationAIUsage
 * + the last 50 assistant AiMessage rows for the active org.
 *
 * Surfaces:
 *   - Today's spend in INR (we report INR even though the underlying
 *     unit is USD cents — Indian SMBs think in rupees)
 *   - Today's tokens vs daily budget
 *   - 30-day spend trend (table for v1; chart in Phase 2)
 *   - Per-feature breakdown via the model field on AiMessage
 *   - Recent call latency p50/p95 — proxy for "is the API slow today"
 *
 * Cost framing: USD-cent stored, displayed as both USD and INR
 * (rough conversion at 83 = INR/USD; the actual billing rate is
 * whatever Anthropic charges to your card).
 */
const USD_TO_INR = 83;

function centsToUsd(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}
function centsToInr(cents: number): string {
  const inr = (cents / 100) * USD_TO_INR;
  return `₹${inr.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
}

function median(nums: number[]): number {
  if (nums.length === 0) return 0;
  const sorted = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? Math.round((sorted[mid - 1] + sorted[mid]) / 2) : sorted[mid];
}
function p95(nums: number[]): number {
  if (nums.length === 0) return 0;
  const sorted = [...nums].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95))];
}

export default async function AiUsagePage() {
  const { organization } = await requireOrganization();

  const today = startOfDay(new Date());
  const thirtyDaysAgo = subDays(today, 30);

  const [daily, recentAssistantMessages, todayRow] = await Promise.all([
    db.organizationAIUsage.findMany({
      where: {
        organizationId: organization.id,
        day: { gte: thirtyDaysAgo },
      },
      orderBy: { day: "desc" },
    }),
    db.aiMessage.findMany({
      where: {
        conversation: { organizationId: organization.id },
        role: "assistant",
        latencyMs: { not: null },
      },
      orderBy: { createdAt: "desc" },
      take: 50,
      select: {
        id: true,
        tokensIn: true,
        tokensOut: true,
        latencyMs: true,
        model: true,
        stopReason: true,
        createdAt: true,
      },
    }),
    db.organizationAIUsage.findUnique({
      where: { organizationId_day: { organizationId: organization.id, day: today } },
    }),
  ]);

  const todayCost = todayRow?.costCents ?? 0;
  const todayTokensIn = todayRow?.tokensIn ?? 0;
  const todayTokensOut = todayRow?.tokensOut ?? 0;
  const todayCalls = todayRow?.callCount ?? 0;
  const monthCost = daily.reduce((s, d) => s + d.costCents, 0);
  const inBudgetPct = Math.min(100, Math.round((todayTokensIn / DEFAULTS.perOrgDailyTokensIn) * 100));
  const outBudgetPct = Math.min(100, Math.round((todayTokensOut / DEFAULTS.perOrgDailyTokensOut) * 100));

  const latencies = recentAssistantMessages
    .map((m) => m.latencyMs ?? 0)
    .filter((n) => n > 0);
  const p50 = median(latencies);
  const p95v = p95(latencies);

  // Per-model breakdown
  const byModel = new Map<string, { tokensIn: number; tokensOut: number; calls: number }>();
  for (const m of recentAssistantMessages) {
    const k = m.model ?? "unknown";
    const cur = byModel.get(k) ?? { tokensIn: 0, tokensOut: 0, calls: 0 };
    cur.tokensIn += m.tokensIn ?? 0;
    cur.tokensOut += m.tokensOut ?? 0;
    cur.calls += 1;
    byModel.set(k, cur);
  }

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <div className="flex items-start gap-3">
        <Sparkles className="h-6 w-6 text-primary mt-1" />
        <div className="flex-1">
          <h1 className="text-2xl font-semibold tracking-tight">AI Usage</h1>
          <p className="text-sm text-muted-foreground mt-1 max-w-3xl">
            Token consumption and cost for your organization&apos;s AI features
            (CFO Copilot, in-app assistant). Daily limits prevent runaway
            spend; this page is the source of truth for what was actually
            consumed.
          </p>
        </div>
      </div>

      {/* Today's stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Stat label="Today's cost (INR)" value={centsToInr(todayCost)} sub={centsToUsd(todayCost)} />
        <Stat label="Today's calls" value={todayCalls.toLocaleString("en-IN")} />
        <Stat label="Last 30d cost (INR)" value={centsToInr(monthCost)} sub={centsToUsd(monthCost)} />
        <Stat label="Median latency" value={p50 ? `${p50} ms` : "—"} sub={p95v ? `p95 ${p95v} ms` : undefined} />
      </div>

      {/* Budget bars */}
      <div className="rounded-lg border bg-card p-4 space-y-3">
        <div className="flex items-center gap-2 text-sm font-medium">
          <TrendingUp className="h-4 w-4 text-primary" />
          Today&apos;s budget consumption
        </div>
        <BudgetBar
          label="Input tokens"
          used={todayTokensIn}
          limit={DEFAULTS.perOrgDailyTokensIn}
          pct={inBudgetPct}
        />
        <BudgetBar
          label="Output tokens"
          used={todayTokensOut}
          limit={DEFAULTS.perOrgDailyTokensOut}
          pct={outBudgetPct}
        />
        {(inBudgetPct >= 80 || outBudgetPct >= 80) && (
          <div className="flex items-start gap-2 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded p-2">
            <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
            <span>
              Daily budget is over 80% consumed. New AI calls will be
              rejected with HTTP 429 once you hit 100%. Budget resets at
              midnight UTC.
            </span>
          </div>
        )}
      </div>

      {/* Per-model breakdown */}
      {byModel.size > 0 && (
        <div className="rounded-lg border bg-card p-4">
          <h2 className="text-sm font-medium mb-3">By model (last 50 assistant calls)</h2>
          <table className="w-full text-sm">
            <thead className="text-xs text-muted-foreground border-b">
              <tr>
                <th className="text-left py-1.5">Model</th>
                <th className="text-right">Calls</th>
                <th className="text-right">Tokens in</th>
                <th className="text-right">Tokens out</th>
              </tr>
            </thead>
            <tbody>
              {Array.from(byModel.entries()).map(([model, agg]) => (
                <tr key={model} className="border-b last:border-0">
                  <td className="py-1.5 font-mono text-xs">{model}</td>
                  <td className="text-right">{agg.calls}</td>
                  <td className="text-right">{agg.tokensIn.toLocaleString("en-IN")}</td>
                  <td className="text-right">{agg.tokensOut.toLocaleString("en-IN")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* 30-day daily breakdown */}
      <div className="rounded-lg border bg-card p-4">
        <h2 className="text-sm font-medium mb-3">Last 30 days</h2>
        {daily.length === 0 ? (
          <div className="text-sm text-muted-foreground italic py-8 text-center">
            No AI usage yet. Try asking the CFO Copilot a question.
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="text-xs text-muted-foreground border-b">
              <tr>
                <th className="text-left py-1.5">Day</th>
                <th className="text-right">Calls</th>
                <th className="text-right">Tokens in</th>
                <th className="text-right">Tokens out</th>
                <th className="text-right">Cost</th>
              </tr>
            </thead>
            <tbody>
              {daily.map((d) => (
                <tr key={d.id} className="border-b last:border-0">
                  <td className="py-1.5">{format(d.day, "dd MMM yyyy")}</td>
                  <td className="text-right">{d.callCount}</td>
                  <td className="text-right">{d.tokensIn.toLocaleString("en-IN")}</td>
                  <td className="text-right">{d.tokensOut.toLocaleString("en-IN")}</td>
                  <td className="text-right">
                    <span className="text-foreground">{centsToInr(d.costCents)}</span>
                    <span className="text-muted-foreground ml-1 text-[11px]">{centsToUsd(d.costCents)}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="text-xs text-muted-foreground">
        Costs computed at Anthropic Sonnet 4.5 list pricing (input $3 / 1M
        tokens, output $15 / 1M tokens), converted to INR at ₹83/USD. Your
        actual Anthropic invoice may differ slightly based on the exchange
        rate at billing time and any volume discounts.
      </div>
    </div>
  );
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-lg border bg-card px-4 py-3">
      <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="text-2xl font-semibold mt-1 tabular-nums">{value}</div>
      {sub && <div className="text-xs text-muted-foreground mt-0.5">{sub}</div>}
    </div>
  );
}

function BudgetBar({ label, used, limit, pct }: { label: string; used: number; limit: number; pct: number }) {
  const tone = pct >= 95 ? "bg-red-500" : pct >= 80 ? "bg-amber-500" : "bg-emerald-500";
  return (
    <div>
      <div className="flex justify-between text-xs mb-1">
        <span className="text-muted-foreground">{label}</span>
        <span className="tabular-nums">
          {used.toLocaleString("en-IN")} / {limit.toLocaleString("en-IN")} ({pct}%)
        </span>
      </div>
      <div className="h-2 rounded bg-muted overflow-hidden">
        <div className={`h-full ${tone} transition-all`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
