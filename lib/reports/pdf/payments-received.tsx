/**
 * RPT-PR — Payments Received PDF renderer.
 *
 * A4 portrait. Header + payment-list table + grand total. Used by
 * `payments-received/export/route.ts` when format=pdf.
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
import { format } from "date-fns";
import { formatMoney } from "@/lib/money";
import type { PaymentReceivedRow } from "@/lib/reports/payments-received";

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
  cellLeft: { flex: 1, textAlign: "left" },
  cellRight: { flex: 1, textAlign: "right" },
});

interface RenderProps {
  orgName: string;
  rangeLabel: string;
  currency: string;
  rows: PaymentReceivedRow[];
  totalAmount: number;
}

export async function renderPaymentsReceivedPdf(
  props: RenderProps,
): Promise<Buffer> {
  const fmt = (n: number) => formatMoney(n, props.currency);
  return renderToBuffer(
    <Document>
      <Page size="A4" style={styles.page}>
        <View style={styles.header}>
          <Text style={styles.orgName}>{props.orgName}</Text>
          <Text style={styles.reportTitle}>Payments Received</Text>
          <Text style={styles.rangeText}>{props.rangeLabel}</Text>
        </View>

        <View style={styles.thead}>
          <Text style={styles.cellLeft}>Date</Text>
          <Text style={styles.cellLeft}>Payment #</Text>
          <Text style={styles.cellLeft}>Customer</Text>
          <Text style={styles.cellLeft}>Mode</Text>
          <Text style={styles.cellRight}>Amount</Text>
        </View>

        {props.rows.map((r) => (
          <View style={styles.row} key={r.paymentId}>
            <Text style={styles.cellLeft}>
              {format(r.paymentDate, "dd/MM/yyyy")}
            </Text>
            <Text style={styles.cellLeft}>{r.paymentNumber}</Text>
            <Text style={styles.cellLeft}>{r.customerName}</Text>
            <Text style={styles.cellLeft}>{r.paymentMode}</Text>
            <Text style={styles.cellRight}>{fmt(r.amount)}</Text>
          </View>
        ))}

        <View style={styles.total}>
          <Text style={styles.cellLeft}>Total</Text>
          <Text style={styles.cellLeft}></Text>
          <Text style={styles.cellLeft}></Text>
          <Text style={styles.cellLeft}></Text>
          <Text style={styles.cellRight}>{fmt(props.totalAmount)}</Text>
        </View>
      </Page>
    </Document>,
  );
}
