/**
 * REPORTS-PDF — Profit and Loss.
 *
 * Renders the same 8-section layout as the on-screen
 * report (lib/reports/profit-loss.ts) but in a paginated PDF.
 */

import React from "react";
import {
  Document,
  Page,
  Text,
  View,
  renderToBuffer,
} from "@react-pdf/renderer";
import { styles, fmtMoney } from "./common";
import type { ProfitAndLoss, PnlSection } from "@/lib/reports/profit-loss";

export async function renderProfitLossPdf(args: {
  organizationName: string;
  dateRangeText: string;
  pnl: ProfitAndLoss;
  currency: string;
}): Promise<Buffer> {
  const doc = (
    <ProfitLossDocument
      organizationName={args.organizationName}
      dateRangeText={args.dateRangeText}
      pnl={args.pnl}
      currency={args.currency}
    />
  );
  return renderToBuffer(doc);
}

function ProfitLossDocument({
  organizationName,
  dateRangeText,
  pnl,
  currency,
}: {
  organizationName: string;
  dateRangeText: string;
  pnl: ProfitAndLoss;
  currency: string;
}) {
  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <Banner
          organizationName={organizationName}
          title="Profit and Loss"
          subtitle={`Basis: Accrual · ${dateRangeText}`}
        />
        <View style={styles.table}>
          <SectionRows section={pnl.operatingIncome} />
          <SectionRows section={pnl.costOfGoodsSold} />
          <SubtotalRow label="Gross Profit" amount={pnl.grossProfit} />
          <SectionRows section={pnl.operatingExpense} />
          <SubtotalRow label="Operating Profit" amount={pnl.operatingProfit} />
          <SectionRows section={pnl.nonOperatingIncome} />
          <SectionRows section={pnl.nonOperatingExpense} />
          <SubtotalRow label="Net Profit/Loss" amount={pnl.netProfitLoss} />
        </View>
        <Footer currency={currency} />
      </Page>
    </Document>
  );
}

function Banner(props: {
  organizationName: string;
  title: string;
  subtitle: string;
}) {
  return (
    <View style={styles.banner}>
      <Text style={styles.bannerOrgName}>{props.organizationName}</Text>
      <Text style={styles.bannerTitle}>{props.title}</Text>
      <Text style={styles.bannerSubtitle}>{props.subtitle}</Text>
    </View>
  );
}

function SectionRows({ section }: { section: PnlSection }) {
  return (
    <>
      <View style={styles.rowSection}>
        <Text style={styles.cellLabel}>{section.label}</Text>
        <Text style={styles.cellAmount}> </Text>
      </View>
      {section.accounts.map((a) => (
        <View key={a.accountId} style={[styles.rowAccount, styles.rowAccountIndent]}>
          <Text style={styles.cellLabel}>
            {a.accountCode ? `${a.accountCode}  ${a.accountName}` : a.accountName}
          </Text>
          <Text style={styles.cellAmount}>{fmtMoney(a.amount)}</Text>
        </View>
      ))}
      <View style={[styles.rowAccount, styles.rowAccountIndent]}>
        <Text style={[styles.cellLabel, { fontFamily: "Helvetica-Bold" }]}>
          Total for {section.label}
        </Text>
        <Text style={[styles.cellAmount, { fontFamily: "Helvetica-Bold" }]}>
          {fmtMoney(section.total)}
        </Text>
      </View>
    </>
  );
}

function SubtotalRow({ label, amount }: { label: string; amount: number }) {
  return (
    <View style={styles.rowSubtotal}>
      <Text style={styles.cellLabel}>{label}</Text>
      <Text style={styles.cellAmount}>{fmtMoney(amount)}</Text>
    </View>
  );
}

function Footer({ currency }: { currency: string }) {
  return (
    <View style={styles.footer} fixed>
      <Text>** Amount is in {currency}</Text>
      <Text
        render={({ pageNumber, totalPages }) =>
          `Page ${pageNumber} of ${totalPages}`
        }
      />
    </View>
  );
}
