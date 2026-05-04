"use client";

import {
  ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend,
} from "recharts";
import { formatMoney } from "@/lib/money";

const PIE_COLORS = ["#1d4ed8", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#06b6d4", "#ec4899"];

export function CashFlowMini({ data, currency }: { data: { month: string; inflow: number; outflow: number; net: number }[]; currency: string }) {
  return (
    <div className="h-56" role="img" aria-label="Cash flow chart over the last six months">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={data} margin={{ top: 5, right: 5, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
          <XAxis dataKey="month" tickLine={false} axisLine={false} fontSize={11} />
          <YAxis tickLine={false} axisLine={false} fontSize={11} tickFormatter={(v) => Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 }).format(Number(v))} />
          <Tooltip
            formatter={(v: unknown) => formatMoney(Number(v), currency)}
            contentStyle={{ background: "hsl(var(--popover))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }}
          />
          <Bar dataKey="inflow" fill="#10b981" name="In" radius={[3, 3, 0, 0]} />
          <Bar dataKey="outflow" fill="#ef4444" name="Out" radius={[3, 3, 0, 0]} />
          <Line type="monotone" dataKey="net" stroke="#1d4ed8" strokeWidth={2} name="Net" dot={false} />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

export function IncomeVsExpenseMini({ data, currency }: { data: { month: string; income: number; expense: number }[]; currency: string }) {
  return (
    <div className="h-56" role="img" aria-label="Income versus expenses chart over the last six months">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={data} margin={{ top: 5, right: 5, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
          <XAxis dataKey="month" tickLine={false} axisLine={false} fontSize={11} />
          <YAxis tickLine={false} axisLine={false} fontSize={11} tickFormatter={(v) => Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 }).format(Number(v))} />
          <Tooltip formatter={(v: unknown) => formatMoney(Number(v), currency)} contentStyle={{ background: "hsl(var(--popover))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }} />
          <Bar dataKey="income" fill="#10b981" name="Income" radius={[3, 3, 0, 0]} />
          <Bar dataKey="expense" fill="#ef4444" name="Expense" radius={[3, 3, 0, 0]} />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

export function TopExpensesPie({ data, currency }: { data: { name: string; value: number }[]; currency: string }) {
  if (data.length === 0) return <div className="h-56 grid place-items-center text-sm text-muted-foreground">No expenses recorded yet.</div>;
  const ariaLabel = `Pie chart of top expense categories: ${data.map((d) => `${d.name}: ${formatMoney(d.value, currency)}`).join(", ")}`;
  return (
    <div className="h-56" role="img" aria-label={ariaLabel}>
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie data={data} cx="50%" cy="50%" innerRadius={45} outerRadius={75} paddingAngle={2} dataKey="value" isAnimationActive={false}>
            {data.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
          </Pie>
          <Tooltip formatter={(v: unknown) => formatMoney(Number(v), currency)} contentStyle={{ background: "hsl(var(--popover))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }} />
          <Legend wrapperStyle={{ fontSize: 11 }} />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}
