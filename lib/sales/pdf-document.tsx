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
import type { RenderableSalesDocument } from "./pdf-renderer";

/**
 * Real PDF rendering for Sales documents via @react-pdf/renderer.
 *
 * Phase M2 (D43-revised): swaps the HTML fallback for a proper PDF
 * document. The `RenderableSalesDocument` shape stays identical, so the
 * call sites in /[id]/pdf/route.ts files don't change beyond using the new
 * function. Existing HTML renderer stays as a fallback for emails (which
 * accept HTML natively).
 */

const styles = StyleSheet.create({
  page: {
    paddingTop: 40,
    paddingBottom: 40,
    paddingHorizontal: 40,
    fontSize: 10,
    fontFamily: "Helvetica",
    color: "#111",
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 20,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#e5e5e5",
    borderBottomStyle: "solid",
  },
  docTitle: { fontSize: 24, fontFamily: "Helvetica-Bold" },
  docNumber: { color: "#555", fontSize: 11, marginTop: 2 },
  orgName: { fontSize: 12, fontFamily: "Helvetica-Bold" },
  orgSub: { color: "#555", fontSize: 9, marginTop: 2 },
  meta: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 16,
  },
  metaLabel: {
    color: "#777",
    fontSize: 8,
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  metaValue: { fontSize: 10, marginTop: 2 },
  customerCol: { width: "55%" },
  metaCol: { width: "40%", textAlign: "right" },
  table: { marginTop: 8, marginBottom: 16 },
  thRow: {
    flexDirection: "row",
    backgroundColor: "#f5f5f5",
    paddingVertical: 6,
    paddingHorizontal: 8,
    borderBottomWidth: 1,
    borderBottomColor: "#e5e5e5",
    borderBottomStyle: "solid",
  },
  th: {
    fontSize: 8,
    color: "#666",
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  tdRow: {
    flexDirection: "row",
    paddingVertical: 6,
    paddingHorizontal: 8,
    borderBottomWidth: 1,
    borderBottomColor: "#f0f0f0",
    borderBottomStyle: "solid",
  },
  td: { fontSize: 10 },
  colItem: { width: "55%" },
  colQty: { width: "10%", textAlign: "right" },
  colRate: { width: "15%", textAlign: "right" },
  colAmt: { width: "20%", textAlign: "right" },
  itemName: { fontSize: 10, fontFamily: "Helvetica-Bold" },
  itemDesc: { fontSize: 9, color: "#666", marginTop: 2 },
  totals: { alignSelf: "flex-end", width: "45%", marginTop: 12 },
  totalsRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 3 },
  totalsLabel: { color: "#666", fontSize: 10 },
  totalsValue: { fontSize: 10 },
  totalsGrand: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 6,
    borderTopWidth: 1,
    borderTopColor: "#111",
    borderTopStyle: "solid",
    marginTop: 4,
  },
  totalsGrandText: { fontSize: 12, fontFamily: "Helvetica-Bold" },
  notesSection: { marginTop: 20 },
  notesHeader: {
    fontSize: 8,
    color: "#666",
    textTransform: "uppercase",
    letterSpacing: 1,
    marginBottom: 4,
  },
  notesBody: { fontSize: 10, lineHeight: 1.4 },
  status: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 3,
    fontSize: 9,
    fontFamily: "Helvetica-Bold",
    backgroundColor: "#eef2ff",
    color: "#1e40af",
    marginTop: 4,
    alignSelf: "flex-start",
  },
});

const TYPE_LABEL: Record<RenderableSalesDocument["type"], string> = {
  QUOTE: "Quote",
  SALES_ORDER: "Sales Order",
  INVOICE: "Invoice",
  CREDIT_NOTE: "Credit Note",
  DELIVERY_CHALLAN: "Delivery Challan",
  DEBIT_NOTE: "Debit Note",
  PURCHASE_ORDER: "Purchase Order",
  BILL: "Bill",
  VENDOR_CREDIT: "Credit Note",
};

function SalesDocumentPdf({ doc }: { doc: RenderableSalesDocument }): React.ReactElement<unknown> {
  const label = TYPE_LABEL[doc.type];
  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <View style={styles.header}>
          <View>
            <Text style={styles.docTitle}>{label}</Text>
            <Text style={styles.docNumber}>{doc.document.number}</Text>
            {doc.document.status ? (
              <Text style={styles.status}>{doc.document.status}</Text>
            ) : null}
          </View>
          <View style={{ alignItems: "flex-end" }}>
            <Text style={styles.orgName}>{doc.organization.name}</Text>
            {doc.organization.address ? (
              <Text style={styles.orgSub}>{doc.organization.address}</Text>
            ) : null}
          </View>
        </View>

        <View style={styles.meta}>
          <View style={styles.customerCol}>
            <Text style={styles.metaLabel}>
              {doc.type === "PURCHASE_ORDER" ||
              doc.type === "BILL" ||
              doc.type === "VENDOR_CREDIT"
                ? "Vendor"
                : "Bill to"}
            </Text>
            <Text style={[styles.metaValue, { fontFamily: "Helvetica-Bold" }]}>
              {doc.customer.displayName}
            </Text>
            {doc.customer.email ? (
              <Text style={styles.metaValue}>{doc.customer.email}</Text>
            ) : null}
            {doc.customer.billingAddress ? (
              <Text style={styles.metaValue}>{doc.customer.billingAddress}</Text>
            ) : null}
          </View>
          <View style={styles.metaCol}>
            <Text style={styles.metaLabel}>Date</Text>
            <Text style={styles.metaValue}>{doc.document.date}</Text>
            {doc.document.dueDate ? (
              <>
                <Text style={[styles.metaLabel, { marginTop: 6 }]}>Due date</Text>
                <Text style={styles.metaValue}>{doc.document.dueDate}</Text>
              </>
            ) : null}
            {doc.document.referenceNumber ? (
              <>
                <Text style={[styles.metaLabel, { marginTop: 6 }]}>Reference</Text>
                <Text style={styles.metaValue}>{doc.document.referenceNumber}</Text>
              </>
            ) : null}
            {doc.document.subject ? (
              <>
                <Text style={[styles.metaLabel, { marginTop: 6 }]}>Subject</Text>
                <Text style={styles.metaValue}>{doc.document.subject}</Text>
              </>
            ) : null}
          </View>
        </View>

        <View style={styles.table}>
          <View style={styles.thRow}>
            <Text style={[styles.th, styles.colItem]}>Item</Text>
            <Text style={[styles.th, styles.colQty]}>Qty</Text>
            <Text style={[styles.th, styles.colRate]}>Rate</Text>
            <Text style={[styles.th, styles.colAmt]}>Amount</Text>
          </View>
          {doc.lines.map((l, i) => (
            <View key={i} style={styles.tdRow} wrap={false}>
              <View style={styles.colItem}>
                <Text style={styles.itemName}>{l.name}</Text>
                {l.description ? <Text style={styles.itemDesc}>{l.description}</Text> : null}
              </View>
              <Text style={[styles.td, styles.colQty]}>{l.quantity}</Text>
              <Text style={[styles.td, styles.colRate]}>{l.rate}</Text>
              <Text style={[styles.td, styles.colAmt]}>{l.amount}</Text>
            </View>
          ))}
        </View>

        <View style={styles.totals}>
          <View style={styles.totalsRow}>
            <Text style={styles.totalsLabel}>Sub Total</Text>
            <Text style={styles.totalsValue}>{doc.totals.subTotal}</Text>
          </View>
          {Number(doc.totals.documentDiscountAmount) !== 0 ? (
            <View style={styles.totalsRow}>
              <Text style={styles.totalsLabel}>Discount</Text>
              <Text style={styles.totalsValue}>
                -{doc.totals.documentDiscountAmount}
              </Text>
            </View>
          ) : null}
          {Number(doc.totals.documentTaxAmount) !== 0 ? (
            <View style={styles.totalsRow}>
              <Text style={styles.totalsLabel}>Tax</Text>
              <Text style={styles.totalsValue}>{doc.totals.documentTaxAmount}</Text>
            </View>
          ) : null}
          {Number(doc.totals.adjustmentAmount) !== 0 ? (
            <View style={styles.totalsRow}>
              <Text style={styles.totalsLabel}>Adjustment</Text>
              <Text style={styles.totalsValue}>{doc.totals.adjustmentAmount}</Text>
            </View>
          ) : null}
          <View style={styles.totalsGrand}>
            <Text style={styles.totalsGrandText}>Total</Text>
            <Text style={styles.totalsGrandText}>{doc.totals.total}</Text>
          </View>
        </View>

        {doc.customFields && doc.customFields.length > 0 ? (
          <View style={styles.notesSection}>
            <Text style={styles.notesHeader}>Additional Information</Text>
            {doc.customFields.map((cf, i) => (
              <View
                key={`cf-${i}`}
                style={{ flexDirection: "row", marginTop: 2 }}
              >
                <Text style={{ width: "30%", color: "#777" }}>{cf.label}</Text>
                <Text style={{ flex: 1 }}>{cf.value}</Text>
              </View>
            ))}
          </View>
        ) : null}

        {doc.notes ? (
          <View style={styles.notesSection}>
            <Text style={styles.notesHeader}>Notes</Text>
            <Text style={styles.notesBody}>{doc.notes}</Text>
          </View>
        ) : null}
        {doc.termsAndConditions ? (
          <View style={styles.notesSection}>
            <Text style={styles.notesHeader}>Terms &amp; Conditions</Text>
            <Text style={styles.notesBody}>{doc.termsAndConditions}</Text>
          </View>
        ) : null}
      </Page>
    </Document>
  );
}

/**
 * Render a Sales document to a PDF buffer. Async because @react-pdf/renderer
 * compiles the React tree to PDF in a worker.
 */
export async function renderSalesDocumentPdf(
  doc: RenderableSalesDocument
): Promise<Buffer> {
  return renderToBuffer(<SalesDocumentPdf doc={doc} /> as any);
}
