/**
 * RPT-CBS — Customer Balance Summary PDF renderer (A4 portrait).
 * Columns match Zoho: Customer Name / Invoiced Amount / Amount Received / Closing Balance.
 */
import * as React from "react";
import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
  renderToBuffer,
} from "@react-pdf/renderer";
import { formatMoney } from "@/lib/money";
import type { CustomerBalanceRow } from "@/lib/reports/customer-balance-summary";

const styles = StyleSheet.create({
  page: { padding: 32, fontSize: 9, fontFamily: "Helvetica" },
  header: { textAlign: "center", marginBottom: 16 },
  orgName: { fontSize: 11, color: "#555" },
  reportTitle: { fontSize: 16, fontWeight: 700, marginVertical: 4 },
  asOf: { fontSize: 9, color: "#666" },
  thead: {
    flexDirection: "row",
    backgroundColor: "#f5f5f5",
    paddingVertical: 4,
    paddingHorizontal: 4,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: "#ddd",
    fontWeight: 700,
    fontSize: 8,
    textTransform: "uppercase",
  },
  row: {
    flexDirection: "row",
    paddingVertical: 4,
    paddingHorizontal: 4,
    borderBottomWidth: 0.5,
    borderColor: "#eee",
  },
  total: {
    flexDirection: "row",
    paddingVertical: 6,
    paddingHorizontal: 4,
    borderTopWidth: 1,
    borderColor: "#bbb",
    fontWeight: 700,
    backgroundColor: "#fafafa",
  },
  cellLeft: { flex: 2, textAlign: "left" },
  cellRight: { flex: 1, textAlign: "right" },
});

interface RenderProps {
  orgName: string;
  asOfDisplay: string;
  currency: string;
  rows: CustomerBalanceRow[];
  totalInvoiced: number;
  totalReceived: number;
  totalBalance: number;
}

export async function renderCustomerBalanceSummaryPdf(
  props: RenderProps,
): Promise<Buffer> {
  const fmt = (n: number) => formatMoney(n, props.currency);
  return renderToBuffer(
    <Document>
      <Page size="A4" style={styles.page}>
        <View style={styles.header}>
          <Text style={styles.orgName}>{props.orgName}</Text>
          <Text style={styles.reportTitle}>Customer Balance Summary</Text>
          <Text style={styles.asOf}>As of {props.asOfDisplay}</Text>
        </View>

        <View style={styles.thead}>
          <Text style={styles.cellLeft}>Customer Name</Text>
          <Text style={styles.cellRight}>Invoiced Amount</Text>
          <Text style={styles.cellRight}>Amount Received</Text>
          <Text style={styles.cellRight}>Closing Balance</Text>
        </View>

        {props.rows.map((r) => (
          <View style={styles.row} key={r.customerId}>
            <Text style={styles.cellLeft}>{r.customerName}</Text>
            <Text style={styles.cellRight}>{fmt(r.invoicedAmount)}</Text>
            <Text style={styles.cellRight}>{fmt(r.amountReceived)}</Text>
            <Text style={styles.cellRight}>{fmt(r.closingBalance)}</Text>
          </View>
        ))}

        <View style={styles.total}>
          <Text style={styles.cellLeft}>Total</Text>
          <Text style={styles.cellRight}>{fmt(props.totalInvoiced)}</Text>
          <Text style={styles.cellRight}>{fmt(props.totalReceived)}</Text>
          <Text style={styles.cellRight}>{fmt(props.totalBalance)}</Text>
        </View>
      </Page>
    </Document>,
  );
}
