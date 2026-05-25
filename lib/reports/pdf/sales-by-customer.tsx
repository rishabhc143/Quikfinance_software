/**
 * RPT-SBC — Sales by Customer PDF renderer (A4 portrait).
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
import type { SalesByCustomerRow } from "@/lib/reports/sales-by-customer";

const styles = StyleSheet.create({
  page: { padding: 32, fontSize: 9, fontFamily: "Helvetica" },
  header: { textAlign: "center", marginBottom: 16 },
  orgName: { fontSize: 11, color: "#555" },
  reportTitle: { fontSize: 16, fontWeight: 700, marginVertical: 4 },
  rangeText: { fontSize: 9, color: "#666" },
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
  cellRightSmall: { flex: 1, textAlign: "right" },
  cellRight: { flex: 1.5, textAlign: "right" },
});

interface RenderProps {
  orgName: string;
  rangeLabel: string;
  currency: string;
  rows: SalesByCustomerRow[];
  totalGross: number;
  totalPaid: number;
  totalBalance: number;
}

export async function renderSalesByCustomerPdf(
  props: RenderProps,
): Promise<Buffer> {
  const fmt = (n: number) => formatMoney(n, props.currency);
  return renderToBuffer(
    <Document>
      <Page size="A4" style={styles.page}>
        <View style={styles.header}>
          <Text style={styles.orgName}>{props.orgName}</Text>
          <Text style={styles.reportTitle}>Sales by Customer</Text>
          <Text style={styles.rangeText}>{props.rangeLabel}</Text>
        </View>

        <View style={styles.thead}>
          <Text style={styles.cellLeft}>Customer</Text>
          <Text style={styles.cellRightSmall}>Invoices</Text>
          <Text style={styles.cellRight}>Gross Sales</Text>
          <Text style={styles.cellRight}>Amount Paid</Text>
          <Text style={styles.cellRight}>Balance Due</Text>
        </View>

        {props.rows.map((r) => (
          <View style={styles.row} key={r.customerId}>
            <Text style={styles.cellLeft}>{r.customerName}</Text>
            <Text style={styles.cellRightSmall}>{r.invoiceCount}</Text>
            <Text style={styles.cellRight}>{fmt(r.grossSales)}</Text>
            <Text style={styles.cellRight}>{fmt(r.amountPaid)}</Text>
            <Text style={styles.cellRight}>{fmt(r.balanceDue)}</Text>
          </View>
        ))}

        <View style={styles.total}>
          <Text style={styles.cellLeft}>Total</Text>
          <Text style={styles.cellRightSmall}></Text>
          <Text style={styles.cellRight}>{fmt(props.totalGross)}</Text>
          <Text style={styles.cellRight}>{fmt(props.totalPaid)}</Text>
          <Text style={styles.cellRight}>{fmt(props.totalBalance)}</Text>
        </View>
      </Page>
    </Document>,
  );
}
