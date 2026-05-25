/**
 * RPT-RECV — Receivables Summary PDF renderer (React-PDF).
 *
 * Renders an A4 portrait PDF with the report header + per-invoice
 * table + grand-total row. Used by `export/route.ts` when format=pdf.
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
import type { ReceivablesSummaryRow } from "@/lib/reports/receivables-summary";

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
  cellLeft: { flex: 1, textAlign: "left" },
  cellRight: { flex: 1, textAlign: "right" },
});

interface RenderProps {
  orgName: string;
  asOfDisplay: string;
  currency: string;
  rows: ReceivablesSummaryRow[];
  totalOutstanding: number;
}

export async function renderReceivablesSummaryPdf(
  props: RenderProps,
): Promise<Buffer> {
  const fmt = (n: number) => formatMoney(n, props.currency);
  return renderToBuffer(
    <Document>
      <Page size="A4" style={styles.page}>
        <View style={styles.header}>
          <Text style={styles.orgName}>{props.orgName}</Text>
          <Text style={styles.reportTitle}>Receivables Summary</Text>
          <Text style={styles.asOf}>As of {props.asOfDisplay}</Text>
        </View>

        <View style={styles.thead}>
          <Text style={styles.cellLeft}>Customer</Text>
          <Text style={styles.cellLeft}>Invoice #</Text>
          <Text style={styles.cellLeft}>Due Date</Text>
          <Text style={styles.cellRight}>Age</Text>
          <Text style={styles.cellRight}>Balance Due</Text>
        </View>

        {props.rows.map((r) => (
          <View style={styles.row} key={r.invoiceId}>
            <Text style={styles.cellLeft}>{r.customerName}</Text>
            <Text style={styles.cellLeft}>{r.invoiceNumber}</Text>
            <Text style={styles.cellLeft}>
              {format(r.dueDate, "dd/MM/yyyy")}
            </Text>
            <Text style={styles.cellRight}>{r.ageDays}</Text>
            <Text style={styles.cellRight}>{fmt(r.balanceDue)}</Text>
          </View>
        ))}

        <View style={styles.total}>
          <Text style={styles.cellLeft}>Total</Text>
          <Text style={styles.cellLeft}></Text>
          <Text style={styles.cellLeft}></Text>
          <Text style={styles.cellRight}></Text>
          <Text style={styles.cellRight}>{fmt(props.totalOutstanding)}</Text>
        </View>
      </Page>
    </Document>,
  );
}
