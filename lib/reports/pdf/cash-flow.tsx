/**
 * REPORTS-PDF — Cash Flow Statement (indirect method).
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
import type { CashFlowStatement } from "@/lib/reports/cash-flow";

export async function renderCashFlowPdf(args: {
  organizationName: string;
  dateRangeText: string;
  cf: CashFlowStatement;
  currency: string;
}): Promise<Buffer> {
  return renderToBuffer(
    <CashFlowDocument
      organizationName={args.organizationName}
      dateRangeText={args.dateRangeText}
      cf={args.cf}
      currency={args.currency}
    />
  );
}

function CashFlowDocument({
  organizationName,
  dateRangeText,
  cf,
  currency,
}: {
  organizationName: string;
  dateRangeText: string;
  cf: CashFlowStatement;
  currency: string;
}) {
  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <View style={styles.banner}>
          <Text style={styles.bannerOrgName}>{organizationName}</Text>
          <Text style={styles.bannerTitle}>Cash Flow Statement</Text>
          <Text style={styles.bannerSubtitle}>{`Indirect method · ${dateRangeText}`}</Text>
        </View>

        <View style={styles.table}>
          <Row label="Beginning Cash Balance" amount={cf.beginningCashBalance} />

          <SectionHeader label="Cash Flow from Operating Activities" />
          <Row label="Net Income" amount={cf.operating.netIncome} indent />
          {cf.operating.nonCashAdjustments.length > 0 ? (
            <>
              <View style={[styles.rowAccount, styles.rowAccountIndent]}>
                <Text style={styles.cellLabel}>Adjustments for non-cash items:</Text>
                <Text style={styles.cellAmount}> </Text>
              </View>
              {cf.operating.nonCashAdjustments.map((a, i) => (
                <View
                  key={i}
                  style={[styles.rowAccount, styles.rowAccountIndent2]}
                >
                  <Text style={styles.cellLabel}>{a.label}</Text>
                  <Text style={styles.cellAmount}>{fmtMoney(a.amount)}</Text>
                </View>
              ))}
            </>
          ) : null}
          <Subtotal
            label="Net Cash from Operating Activities"
            amount={cf.operating.netCashFromOperating}
          />

          <SectionHeader label="Cash Flow from Investing Activities" />
          {cf.investing.items.length === 0 ? (
            <View style={[styles.rowAccount, styles.rowAccountIndent]}>
              <Text style={styles.cellLabel}>No investing activity</Text>
              <Text style={styles.cellAmount}>0.00</Text>
            </View>
          ) : (
            cf.investing.items.map((a, i) => (
              <View key={i} style={[styles.rowAccount, styles.rowAccountIndent]}>
                <Text style={styles.cellLabel}>{a.label}</Text>
                <Text style={styles.cellAmount}>{fmtMoney(a.amount)}</Text>
              </View>
            ))
          )}
          <Subtotal
            label="Net Cash from Investing Activities"
            amount={cf.investing.netCashFromInvesting}
          />

          <SectionHeader label="Cash Flow from Financing Activities" />
          {cf.financing.items.length === 0 ? (
            <View style={[styles.rowAccount, styles.rowAccountIndent]}>
              <Text style={styles.cellLabel}>No financing activity</Text>
              <Text style={styles.cellAmount}>0.00</Text>
            </View>
          ) : (
            cf.financing.items.map((a, i) => (
              <View key={i} style={[styles.rowAccount, styles.rowAccountIndent]}>
                <Text style={styles.cellLabel}>{a.label}</Text>
                <Text style={styles.cellAmount}>{fmtMoney(a.amount)}</Text>
              </View>
            ))
          )}
          <Subtotal
            label="Net Cash from Financing Activities"
            amount={cf.financing.netCashFromFinancing}
          />

          <Subtotal label="Net Change in Cash" amount={cf.netChangeInCash} />
          <Subtotal label="Ending Cash Balance" amount={cf.endingCashBalance} />
        </View>

        <View style={styles.footer} fixed>
          <Text>** Amount is in {currency}</Text>
          <Text
            render={({ pageNumber, totalPages }) =>
              `Page ${pageNumber} of ${totalPages}`
            }
          />
        </View>
      </Page>
    </Document>
  );
}

function SectionHeader({ label }: { label: string }) {
  return (
    <View style={styles.rowSection}>
      <Text style={styles.cellLabel}>{label}</Text>
      <Text style={styles.cellAmount}> </Text>
    </View>
  );
}

function Row({
  label,
  amount,
  indent,
}: {
  label: string;
  amount: number;
  indent?: boolean;
}) {
  const rowStyle = indent
    ? [styles.rowAccount, styles.rowAccountIndent]
    : [styles.rowAccount];
  return (
    <View style={rowStyle}>
      <Text style={styles.cellLabel}>{label}</Text>
      <Text style={styles.cellAmount}>{fmtMoney(amount)}</Text>
    </View>
  );
}

function Subtotal({ label, amount }: { label: string; amount: number }) {
  return (
    <View style={styles.rowSubtotal}>
      <Text style={styles.cellLabel}>{label}</Text>
      <Text style={styles.cellAmount}>{fmtMoney(amount)}</Text>
    </View>
  );
}
