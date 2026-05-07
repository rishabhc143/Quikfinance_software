"use client";

import * as React from "react";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from "recharts";

export type MonthlyPoint = {
  month: string; // "2026-05" or "May 26"
  income: number;
  payments: number;
};

/**
 * Customer Overview chart — last 12 months of invoice income vs. payments.
 * Per <customers_spec> Overview tab. Recharts is already a dependency.
 */
export function CustomerOverviewChart({ data }: { data: MonthlyPoint[] }) {
  if (data.length === 0) {
    return (
      <div className="text-sm text-muted-foreground py-8 text-center">
        No financial activity in the last 12 months.
      </div>
    );
  }
  return (
    <div
      className="h-64 w-full"
      role="img"
      aria-label="Last 12 months of invoice income and payments received"
    >
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 8 }}>
          <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
          <XAxis dataKey="month" tick={{ fontSize: 11 }} />
          <YAxis tick={{ fontSize: 11 }} />
          <Tooltip />
          <Bar dataKey="income" fill="hsl(var(--primary))" name="Invoiced" />
          <Bar dataKey="payments" fill="#16a34a" name="Paid" />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
