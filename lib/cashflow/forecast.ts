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
import { projectCompanionVouchers } from "./companion-projection";
import {
  getCustomerPaymentDelays,
  getVendorPaymentDelays,
  type PaymentDelayPattern,
} from "./payment-patterns";
import { projectOccurrences } from "./recurring-projection";
import type {
  CashflowForecast,
  ForecastDay,
  ForecastItem,
  ForecastWeek,
} from "./types";

const DEFAULT_HORIZON_DAYS = 84; // 12 weeks
const MAX_STRESS_DAYS = 60;

export type ForecastOptions = {
  currency?: string;
  /**
   * CF-3 — stress-test scenario. Adds N days to every customer-side
   * pattern's avgDelayDays before placing open invoices. Used by the
   * UI's "Base / +7d / +14d / +30d" button group to let CFOs quickly
   * see the projection under a "collections slip by N days" hypothesis.
   *
   * Only affects INFLOWS (open invoices). Outflows are deterministic
   * from our own scheduled payments — we don't model "what if we pay
   * vendors late" because that's our choice, not a counterparty's.
   *
   * Clamped to [0, 60]. Recurring invoices unaffected (they're our
   * own scheduled bills, not customer-paid).
   */
  stressDays?: number;
  /**
   * Tally Companion Sprint 2 — when true, CompanionVoucher rows
   * (imported from Tally) project as inflows/outflows alongside
   * native Invoices/Bills. Default false to preserve existing
   * single-source-of-truth behaviour for orgs that haven't imported
   * Tally data (and to keep the "double-count Tally + native"
   * concern an explicit opt-in rather than a surprise).
   *
   * See lib/cashflow/companion-projection.ts for the v1 assumptions
   * (net-30 payment, 90-day age cutoff, no payment-delay learning
   * applied to imported data).
   */
  includeCompanion?: boolean;
};

export async function computeForecast(
  organizationId: string,
  startDate: Date,
  horizonDays: number = DEFAULT_HORIZON_DAYS,
  options?: ForecastOptions
): Promise<CashflowForecast> {
  const start = startOfDay(startDate);
  const end = startOfDay(addDays(start, horizonDays - 1));
  // CF-3 — clamp stress-days into the supported range; ignore negative
  // values (users can't model "early payments globally" — that's not a
  // realistic stress test).
  const stressDays = Math.max(
    0,
    Math.min(MAX_STRESS_DAYS, options?.stressDays ?? 0)
  );
  const includeCompanion = options?.includeCompanion === true;

  const [
    bankAccounts,
    bankTransactions,
    openInvoices,
    openBills,
    recurringInvoices,
    recurringBills,
    recurringExpenses,
    customerDelays,
    vendorDelays,
    companionResult,
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
        // CF-2 needs contactId to look up the learned payment-delay
        // pattern for this customer.
        contactId: true,
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
        // CF-2 needs contactId to look up the learned payment-delay
        // pattern for this vendor.
        contactId: true,
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
    // CF-2 — learned per-customer / per-vendor payment delays.
    // The engine applies these to open-invoice / open-bill projection
    // dates so the forecast reflects how counterparties ACTUALLY pay,
    // not just contractual due dates.
    getCustomerPaymentDelays(organizationId, start),
    getVendorPaymentDelays(organizationId, start),
    // Tally Companion Sprint 2 — only fetch CompanionVoucher rows
    // when the caller has opted in. Returns empty result when off
    // so the loop below is a no-op.
    includeCompanion
      ? projectCompanionVouchers(organizationId, start, end)
      : Promise.resolve({ projections: [], total: 0 }),
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

  // CF-2 — counter for items shifted by the learned-delay layer.
  // Reported in summary so the UI can surface "N items adjusted
  // for typical payment delay".
  let patternsApplied = 0;

  const placeOn = (
    rawDate: Date,
    item: ForecastItem,
    direction: "in" | "out",
    pattern?: PaymentDelayPattern | null
  ): void => {
    const dueDate = startOfDay(rawDate);
    let adjustedDate = dueDate;
    // CF-2 — when we have a learned pattern, shift the placement
    // date by the customer/vendor's average payment delay. Pattern
    // is only present when sample size ≥ 3 and within the lookback
    // window — see `aggregateDelays` for the rules.
    if (pattern && pattern.avgDelayDays !== 0) {
      adjustedDate = startOfDay(
        addDays(dueDate, pattern.avgDelayDays)
      );
    }
    // Past-due flows land on day 0 (they're owed/owing NOW).
    const effDate = adjustedDate < start ? start : adjustedDate;
    const key = format(effDate, "yyyy-MM-dd");
    const day = dayMap.get(key);
    if (!day) return; // past the horizon

    // Annotate the item with the original due date when a shift
    // was actually applied, so the UI can render both.
    if (pattern && pattern.avgDelayDays !== 0) {
      const originalKey = format(dueDate, "yyyy-MM-dd");
      if (originalKey !== key) {
        item.originalDate = originalKey;
        item.delayAppliedDays = pattern.avgDelayDays;
        patternsApplied += 1;
      }
    }

    if (direction === "in") {
      day.inflows.push(item);
      day.totalIn += item.amount;
    } else {
      day.outflows.push(item);
      day.totalOut += item.amount;
    }
  };

  // ── Open invoices ─────────────────────────────────────────────────────
  // CF-3: when stressDays > 0, layer it ON TOP of any learned customer
  // delay. A customer with avg +5d under +14d stress projects at +19d.
  // For customers with no learned pattern, the stress alone applies via
  // a synthetic pattern so the UI still shows the shift indicator.
  for (const inv of openInvoices) {
    const remaining = Number(inv.total) - Number(inv.amountPaid);
    if (remaining <= 0) continue;
    const basePattern = customerDelays.get(inv.contactId);
    const effectivePattern: PaymentDelayPattern | undefined = stressDays > 0
      ? {
          contactId: inv.contactId,
          avgDelayDays: (basePattern?.avgDelayDays ?? 0) + stressDays,
          sampleSize: basePattern?.sampleSize ?? 0,
        }
      : basePattern;
    placeOn(
      inv.dueDate,
      {
        source: "invoice",
        refId: inv.id,
        label: `Invoice ${inv.number} — ${inv.contact.displayName}`,
        amount: remaining,
      },
      "in",
      effectivePattern
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
      "out",
      bill.contactId ? vendorDelays.get(bill.contactId) : null
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

  // ── Companion vouchers (Tally Companion Sprint 2) ───────────────────
  // Each CompanionVoucher is placed via the same `placeOn` helper as
  // native data, with NO payment-delay pattern (Companion data lacks
  // the historical pair-matching needed for CF-2-style learning).
  // The placeOn helper still handles past-due → day-0 placement.
  for (const cp of companionResult.projections) {
    placeOn(cp.date, cp.item, cp.direction);
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
    stressDays,
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
      patternsApplied,
      companionItemsIncluded: companionResult.total,
    },
  };
}
