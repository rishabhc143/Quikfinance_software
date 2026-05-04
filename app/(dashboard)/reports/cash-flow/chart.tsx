"use client";

import { ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { formatMoney } from "@/lib/money";

type Datum = { month: string; inflow: number; outflow: number; net: number };

export function CashFlowChart({ data, currency }: { data: Datum[]; currency: string }) {
  return (
    <div className="h-72">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={data} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
          <XAxis dataKey="month" tickLine={false} axisLine={false} fontSize={12} />
          <YAxis tickLine={false} axisLine={false} fontSize={12} tickFormatter={(v) => Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 }).format(Number(v))} />
          <Tooltip
            formatter={(v: unknown) => formatMoney(Number(v), currency)}
            contentStyle={{ background: "hsl(var(--popover))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }}
          />
          <Bar dataKey="inflow" fill="#10b981" name="Inflow" radius={[4, 4, 0, 0]} />
          <Bar dataKey="outflow" fill="#ef4444" name="Outflow" radius={[4, 4, 0, 0]} />
          <Line type="monotone" dataKey="net" stroke="#1d4ed8" strokeWidth={2} name="Net" dot={{ r: 3 }} />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
