/* eslint-disable @typescript-eslint/no-explicit-any */
import * as React from "react";
import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
  renderToBuffer,
} from "@react-pdf/renderer";
import { format } from "date-fns";

/**
 * Customer Statement renderer — PDF version of "all transactions for this
 * customer in the chosen date range, with running balance".
 *
 * Per <customers_spec> Statements tab:
 *   "date-range picker, generate statement PDF, email statement"
 */

export type StatementInput = {
  organization: { name: string };
  customer: { displayName: string; email?: string | null };
  rangeFrom: Date;
  rangeTo: Date;
  openingBalance: number;
  closingBalance: number;
  currency: string;
  rows: StatementRow[];
};

export type StatementRow = {
  date: Date;
  type: "Invoice" | "Payment" | "Credit Note" | "Refund";
  number: string;
  description?: string | null;
  /** Positive = invoice/charge; negative = payment/credit/refund. */
  amount: number;
  balance: number;
};

const styles = StyleSheet.create({
  page: { padding: 40, fontSize: 10, fontFamily: "Helvetica", color: "#111" },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 16,
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: "#e5e5e5",
    borderBottomStyle: "solid",
  },
  title: { fontSize: 18, fontFamily: "Helvetica-Bold" },
  meta: { color: "#555" },
  section: { marginBottom: 12 },
  thRow: {
    flexDirection: "row",
    backgroundColor: "#f7f7f7",
    paddingVertical: 6,
    paddingHorizontal: 6,
    borderBottomWidth: 1,
    borderBottomColor: "#e5e5e5",
    borderBottomStyle: "solid",
  },
  th: { fontSize: 8, color: "#666", textTransform: "uppercase", letterSpacing: 1 },
  tr: {
    flexDirection: "row",
    paddingVertical: 5,
    paddingHorizontal: 6,
    borderBottomWidth: 1,
    borderBottomColor: "#f0f0f0",
    borderBottomStyle: "solid",
  },
  td: { fontSize: 9 },
  cDate: { width: "12%" },
  cType: { width: "14%" },
  cNumber: { width: "16%" },
  cDesc: { width: "30%" },
  cAmt: { width: "14%", textAlign: "right" },
  cBal: { width: "14%", textAlign: "right" },
  totalsRow: {
    flexDirection: "row",
    justifyContent: "flex-end",
    paddingVertical: 4,
    fontSize: 11,
    fontFamily: "Helvetica-Bold",
    marginTop: 8,
  },
  totalsLabel: { marginRight: 8, color: "#444" },
});

function fmt(n: number) {
  return (n < 0 ? "-" : "") + Math.abs(n).toFixed(2);
}

function StatementPdf({ input }: { input: StatementInput }): React.ReactElement<unknown> {
  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <View style={styles.header}>
          <View>
            <Text style={styles.title}>Statement of Account</Text>
            <Text style={styles.meta}>{input.organization.name}</Text>
          </View>
          <View style={{ alignItems: "flex-end" }}>
            <Text style={{ fontFamily: "Helvetica-Bold" }}>{input.customer.displayName}</Text>
            {input.customer.email ? <Text style={styles.meta}>{input.customer.email}</Text> : null}
            <Text style={styles.meta}>
              {format(input.rangeFrom, "dd MMM yyyy")} — {format(input.rangeTo, "dd MMM yyyy")}
            </Text>
          </View>
        </View>

        <View style={styles.section}>
          <View style={styles.thRow}>
            <Text style={[styles.th, styles.cDate]}>Date</Text>
            <Text style={[styles.th, styles.cType]}>Type</Text>
            <Text style={[styles.th, styles.cNumber]}>Number</Text>
            <Text style={[styles.th, styles.cDesc]}>Description</Text>
            <Text style={[styles.th, styles.cAmt]}>Amount</Text>
            <Text style={[styles.th, styles.cBal]}>Balance</Text>
          </View>

          <View style={styles.tr}>
            <Text style={[styles.td, styles.cDate]}>{format(input.rangeFrom, "dd MMM yyyy")}</Text>
            <Text style={[styles.td, styles.cType]}>Opening</Text>
            <Text style={[styles.td, styles.cNumber]}> </Text>
            <Text style={[styles.td, styles.cDesc]}>Opening balance</Text>
            <Text style={[styles.td, styles.cAmt]}> </Text>
            <Text style={[styles.td, styles.cBal]}>{fmt(input.openingBalance)}</Text>
          </View>

          {input.rows.map((r, i) => (
            <View key={i} style={styles.tr} wrap={false}>
              <Text style={[styles.td, styles.cDate]}>{format(r.date, "dd MMM yyyy")}</Text>
              <Text style={[styles.td, styles.cType]}>{r.type}</Text>
              <Text style={[styles.td, styles.cNumber]}>{r.number}</Text>
              <Text style={[styles.td, styles.cDesc]}>{r.description ?? ""}</Text>
              <Text style={[styles.td, styles.cAmt]}>{fmt(r.amount)}</Text>
              <Text style={[styles.td, styles.cBal]}>{fmt(r.balance)}</Text>
            </View>
          ))}
        </View>

        <View style={styles.totalsRow}>
          <Text style={styles.totalsLabel}>Closing balance:</Text>
          <Text>
            {input.currency} {fmt(input.closingBalance)}
          </Text>
        </View>
      </Page>
    </Document>
  );
}

export async function renderCustomerStatementPdf(input: StatementInput): Promise<Buffer> {
  return renderToBuffer(<StatementPdf input={input} /> as any);
}
