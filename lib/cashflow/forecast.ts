import "server-only";

/**
 * CF-1 — Deterministic 12-week cashflow forecast.
 *
 * Combines four sources of FUTURE cash movement:
 *   1. Open invoices (status SENT / PARTIALLY_PAID / OVERDUE) — projected
 *      as inflow on max(dueDate, today). Past-due invoices land on day 0.
 *   2. Open bills — same, but as outflow.
 *   3. Recurring invoice / bill / expense profiles — projected forward
 *      using `projectOccurrences` (see ./recurring-projection.ts).
 *   4. Starting balance = sum of (BankAccount.openingBalance + Σ all
 *      BankTransaction rows before forecast start, signed by type).
 *
 * Performance budget: < 500ms for an org with 10K open invoices + 100
 * recurring profiles. Achieved via:
 *   • One Prisma query per source, all in Promise.all
 *   • Date math in memory; no per-row DB roundtrip
 *   • Day bucketing into a Map for O(1) placement
 *
 * NOT included in this pure-deterministic v1:
 *   • Per-customer payment-delay learning (CF-2 / Phase 2)
 *   • Confidence intervals (CF-2)
 *   • Scenario overlays (CF-2 — comes via overrides param)
 *   • Multi-currency conversion (assumes single org currency)
 *
 * Status transitions handled correctly:
 *   • DRAFT invoices/bills excluded (not yet committed)
 *   • PAID invoices/bills excluded (already cleared)
 *   • VOID / WRITTEN_OFF excluded
 *   • PAUSED / STOPPED / EXPIRED recurring profiles excluded (filtered
 *     inside projectOccurrences)
 */

import { addDays, format, startOfDay } from "date-fns";
import { db } from "@/lib/db";
import { projectOccurrences } from "./recurring-projection";
import type {
  CashflowForecast,
  ForecastDay,
  ForecastItem,
  ForecastWeek,
} from "./types";

const DEFAULT_HORIZON_DAYS = 84; // 12 weeks

export async function computeForecast(
  organizationId: string,
  startDate: Date,
  horizonDays: number = DEFAULT_HORIZON_DAYS,
  options?: {
    currency?: string;
  }
): Promise<CashflowForecast> {
  const start = startOfDay(startDate);
  const end = startOfDay(addDays(start, horizonDays - 1));

  const [
    bankAccounts,
    bankTransactions,
    openInvoices,
    openBills,
    recurringInvoices,
    recurringBills,
    recurringExpenses,
  ] = await Promise.all([
    db.bankAccount.findMany({
      where: { organizationId, isActive: true },
      select: { id: true, name: true, openingBalance: true },
    }),
    // Reconciled-and-unreconciled both contribute to cash position —
    // any txn that actually exists in our books represents a real
    // movement. `excluded: false` strips out duplicates flagged during
    // CSV import.
    db.bankTransaction.findMany({
      where: {
        organizationId,
        excluded: false,
        date: { lt: start },
      },
      select: { amount: true, type: true },
    }),
    db.invoice.findMany({
      where: {
        organizationId,
        deletedAt: null,
        status: { in: ["SENT", "PARTIALLY_PAID", "OVERDUE"] },
      },
      select: {
        id: true,
        number: true,
        dueDate: true,
        total: true,
        amountPaid: true,
        contact: { select: { displayName: true } },
      },
    }),
    db.bill.findMany({
      where: {
        organizationId,
        deletedAt: null,
        // BillStatus uses OPEN (not SENT). PARTIALLY_PAID + OVERDUE
        // also have unpaid balance; PAID and VOID are excluded.
        status: { in: ["OPEN", "PARTIALLY_PAID", "OVERDUE"] },
      },
      select: {
        id: true,
        number: true,
        dueDate: true,
        total: true,
        amountPaid: true,
        contact: { select: { displayName: true } },
      },
    }),
    db.recurringInvoice.findMany({
      where: { organizationId, deletedAt: null, status: "ACTIVE" },
      select: {
        id: true,
        profileName: true,
        frequency: true,
        intervalN: true,
        startDate: true,
        endDate: true,
        neverExpires: true,
        nextOccurrenceDate: true,
        nextRunAt: true,
        status: true,
        amount: true,
      },
    }),
    db.recurringBill.findMany({
      where: { organizationId, deletedAt: null, status: "ACTIVE" },
      select: {
        id: true,
        profileName: true,
        frequency: true,
        intervalN: true,
        startDate: true,
        endDate: true,
        neverExpires: true,
        nextOccurrenceDate: true,
        nextRunAt: true,
        status: true,
        amount: true,
      },
    }),
    db.recurringExpense.findMany({
      where: { organizationId, deletedAt: null, status: "ACTIVE" },
      select: {
        id: true,
        profileName: true,
        frequency: true,
        intervalN: true,
        startDate: true,
        endDate: true,
        neverExpires: true,
        nextOccurrenceDate: true,
        nextRunAt: true,
        status: true,
        amount: true,
      },
    }),
  ]);

  // ── Starting balance ───────────────────────────────────────────────────
  let startingBalance = 0;
  for (const ba of bankAccounts) {
    startingBalance += Number(ba.openingBalance);
  }
  for (const txn of bankTransactions) {
    const amt = Math.abs(Number(txn.amount));
    startingBalance += txn.type === "CREDIT" ? amt : -amt;
  }

  // ── Build empty day grid ──────────────────────────────────────────────
  const dayMap = new Map<string, ForecastDay>();
  for (let i = 0; i < horizonDays; i++) {
    const d = addDays(start, i);
    const key = format(d, "yyyy-MM-dd");
    dayMap.set(key, {
      date: key,
      inflows: [],
      outflows: [],
      totalIn: 0,
      totalOut: 0,
      net: 0,
      runningBalance: 0, // filled below once we know totals
    });
  }

  const placeOn = (
    rawDate: Date,
    item: ForecastItem,
    direction: "in" | "out"
  ): void => {
    const dueDate = startOfDay(rawDate);
    // Past-due flows land on day 0 (they're owed/owing NOW).
    const effDate = dueDate < start ? start : dueDate;
    const key = format(effDate, "yyyy-MM-dd");
    const day = dayMap.get(key);
    if (!day) return; // past the horizon
    if (direction === "in") {
      day.inflows.push(item);
      day.totalIn += item.amount;
    } else {
      day.outflows.push(item);
      day.totalOut += item.amount;
    }
  };

  // ── Open invoices ─────────────────────────────────────────────────────
  for (const inv of openInvoices) {
    const remaining = Number(inv.total) - Number(inv.amountPaid);
    if (remaining <= 0) continue;
    placeOn(
      inv.dueDate,
      {
        source: "invoice",
        refId: inv.id,
        label: `Invoice ${inv.number} — ${inv.contact.displayName}`,
        amount: remaining,
      },
      "in"
    );
  }

  // ── Open bills ────────────────────────────────────────────────────────
  for (const bill of openBills) {
    const remaining = Number(bill.total) - Number(bill.amountPaid);
    if (remaining <= 0) continue;
    placeOn(
      bill.dueDate,
      {
        source: "bill",
        refId: bill.id,
        label: `Bill ${bill.number} — ${bill.contact?.displayName ?? "Vendor"}`,
        amount: remaining,
      },
      "out"
    );
  }

  // ── Recurring invoices ────────────────────────────────────────────────
  for (const ri of recurringInvoices) {
    const occurrences = projectOccurrences(
      {
        frequency: ri.frequency,
        intervalN: ri.intervalN,
        startDate: ri.startDate ?? null,
        endDate: ri.endDate ?? null,
        neverExpires: ri.neverExpires,
        nextOccurrenceDate: ri.nextOccurrenceDate ?? null,
        nextRunAt: ri.nextRunAt,
        status: ri.status,
        amount: Number(ri.amount),
      },
      start,
      end
    );
    const amt = Number(ri.amount);
    for (const occ of occurrences) {
      placeOn(
        occ,
        {
          source: "recurring-invoice",
          refId: ri.id,
          label: `Recurring invoice: ${ri.profileName}`,
          amount: amt,
        },
        "in"
      );
    }
  }

  // ── Recurring bills ───────────────────────────────────────────────────
  for (const rb of recurringBills) {
    const occurrences = projectOccurrences(
      {
        frequency: rb.frequency,
        intervalN: rb.intervalN,
        startDate: rb.startDate ?? null,
        endDate: rb.endDate ?? null,
        neverExpires: rb.neverExpires,
        nextOccurrenceDate: rb.nextOccurrenceDate ?? null,
        nextRunAt: rb.nextRunAt,
        status: rb.status,
        amount: Number(rb.amount),
      },
      start,
      end
    );
    const amt = Number(rb.amount);
    for (const occ of occurrences) {
      placeOn(
        occ,
        {
          source: "recurring-bill",
          refId: rb.id,
          label: `Recurring bill: ${rb.profileName}`,
          amount: amt,
        },
        "out"
      );
    }
  }

  // ── Recurring expenses ────────────────────────────────────────────────
  for (const re of recurringExpenses) {
    const occurrences = projectOccurrences(
      {
        frequency: re.frequency,
        intervalN: re.intervalN,
        startDate: re.startDate ?? null,
        endDate: re.endDate ?? null,
        neverExpires: re.neverExpires,
        nextOccurrenceDate: re.nextOccurrenceDate ?? null,
        nextRunAt: re.nextRunAt,
        status: re.status,
        amount: Number(re.amount),
      },
      start,
      end
    );
    const amt = Number(re.amount);
    for (const occ of occurrences) {
      placeOn(
        occ,
        {
          source: "recurring-expense",
          refId: re.id,
          label: `Recurring expense: ${re.profileName}`,
          amount: amt,
        },
        "out"
      );
    }
  }

  // ── Running balance walk-through ──────────────────────────────────────
  let running = startingBalance;
  const days: ForecastDay[] = [];
  let minBalance = running;
  let minBalanceDate: string | null = null;
  let hasInsolvencyRisk = false;

  for (let i = 0; i < horizonDays; i++) {
    const d = addDays(start, i);
    const key = format(d, "yyyy-MM-dd");
    const day = dayMap.get(key)!;
    day.net = day.totalIn - day.totalOut;
    running += day.net;
    day.runningBalance = running;
    if (running < minBalance) {
      minBalance = running;
      minBalanceDate = key;
    }
    if (running < 0) hasInsolvencyRisk = true;
    days.push(day);
  }

  // ── Weekly buckets ────────────────────────────────────────────────────
  const weeks: ForecastWeek[] = [];
  let weeksWithDeficit = 0;
  for (let w = 0; w * 7 < horizonDays; w++) {
    let totalIn = 0;
    let totalOut = 0;
    let weekMin = Infinity;
    let endingBalance = 0;
    const weekStart = days[w * 7].date;
    let weekEnd = weekStart;
    for (let dd = 0; dd < 7; dd++) {
      const idx = w * 7 + dd;
      if (idx >= days.length) break;
      const day = days[idx];
      totalIn += day.totalIn;
      totalOut += day.totalOut;
      if (day.runningBalance < weekMin) weekMin = day.runningBalance;
      endingBalance = day.runningBalance;
      weekEnd = day.date;
    }
    const net = totalIn - totalOut;
    if (net < 0) weeksWithDeficit += 1;
    weeks.push({
      weekStart,
      weekEnd,
      totalIn,
      totalOut,
      net,
      endingBalance,
      minBalance: weekMin,
    });
  }

  const totalInflows = days.reduce((s, d) => s + d.totalIn, 0);
  const totalOutflows = days.reduce((s, d) => s + d.totalOut, 0);

  return {
    startDate: format(start, "yyyy-MM-dd"),
    endDate: format(end, "yyyy-MM-dd"),
    horizonDays,
    currency: options?.currency ?? "INR",
    days,
    weeks,
    summary: {
      startingBalance,
      endingBalance: running,
      totalInflows,
      totalOutflows,
      netCashflow: totalInflows - totalOutflows,
      minBalance,
      minBalanceDate,
      weeksWithDeficit,
      hasInsolvencyRisk,
    },
  };
}
