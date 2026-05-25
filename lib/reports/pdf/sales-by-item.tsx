/**
 * RPT-SBI — Sales by Item PDF renderer (A4 portrait).
 * Columns match Zoho: Item Name / Quantity Sold / Amount / Average Price.
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
import type { SalesByItemRow } from "@/lib/reports/sales-by-item";

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
  cellRight: { flex: 1, textAlign: "right" },
});

interface RenderProps {
  orgName: string;
  rangeLabel: string;
  currency: string;
  rows: SalesByItemRow[];
  totalQuantity: number;
  totalAmount: number;
  averagePrice: number;
}

export async function renderSalesByItemPdf(
  props: RenderProps,
): Promise<Buffer> {
  const fmt = (n: number) => formatMoney(n, props.currency);
  return renderToBuffer(
    <Document>
      <Page size="A4" style={styles.page}>
        <View style={styles.header}>
          <Text style={styles.orgName}>{props.orgName}</Text>
          <Text style={styles.reportTitle}>Sales by Item</Text>
          <Text style={styles.rangeText}>{props.rangeLabel}</Text>
        </View>

        <View style={styles.thead}>
          <Text style={styles.cellLeft}>Item Name</Text>
          <Text style={styles.cellRight}>Quantity Sold</Text>
          <Text style={styles.cellRight}>Amount</Text>
          <Text style={styles.cellRight}>Average Price</Text>
        </View>

        {props.rows.map((r) => (
          <View style={styles.row} key={r.itemKey}>
            <Text style={styles.cellLeft}>{r.itemName}</Text>
            <Text style={styles.cellRight}>{r.quantitySold}</Text>
            <Text style={styles.cellRight}>{fmt(r.amount)}</Text>
            <Text style={styles.cellRight}>{fmt(r.averagePrice)}</Text>
          </View>
        ))}

        <View style={styles.total}>
          <Text style={styles.cellLeft}>Total</Text>
          <Text style={styles.cellRight}>{props.totalQuantity}</Text>
          <Text style={styles.cellRight}>{fmt(props.totalAmount)}</Text>
          <Text style={styles.cellRight}>{fmt(props.averagePrice)}</Text>
        </View>
      </Page>
    </Document>,
  );
}
