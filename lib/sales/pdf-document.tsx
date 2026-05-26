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
 * Two layouts live here:
 *   1. INVOICE → Indian GST "TAX INVOICE" format with supplier
 *      block, Bill To / Ship To grid, HSN/SAC + IGST columns,
 *      Total In Words, Authorized Signature, etc.
 *   2. All other types (Quote, SO, CN, etc.) → original simple
 *      layout (kept for back-compat until each gets its own
 *      proper template).
 */

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

// ─── Shared INR formatter ───────────────────────────────────────

function formatINR(value: string | number | null | undefined): string {
  const num =
    typeof value === "number" ? value : value == null ? 0 : Number(value);
  if (!Number.isFinite(num)) return "0.00";
  const sign = num < 0 ? "-" : "";
  const abs = Math.abs(num);
  // Indian thousands grouping: 2,47,800.00
  const [intPart, decPart = "00"] = abs.toFixed(2).split(".");
  let formatted = "";
  if (intPart.length <= 3) {
    formatted = intPart;
  } else {
    const last3 = intPart.slice(-3);
    const rest = intPart.slice(0, -3);
    const restGrouped = rest.replace(/\B(?=(\d{2})+(?!\d))/g, ",");
    formatted = `${restGrouped},${last3}`;
  }
  return `${sign}${formatted}.${decPart}`;
}

// ─── INVOICE layout (GST Tax Invoice) ──────────────────────────

const inv = StyleSheet.create({
  page: {
    paddingTop: 30,
    paddingBottom: 40,
    paddingHorizontal: 30,
    fontSize: 9,
    fontFamily: "Helvetica",
    color: "#111",
  },
  // Outer border that wraps the whole content block
  outer: {
    borderWidth: 1,
    borderColor: "#000",
    borderStyle: "solid",
  },
  // Top section: org on left, TAX INVOICE on right
  topRow: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: "#000",
    borderBottomStyle: "solid",
  },
  topLeft: {
    flex: 1.4,
    padding: 8,
    borderRightWidth: 1,
    borderRightColor: "#000",
    borderRightStyle: "solid",
  },
  topRight: {
    flex: 1,
    padding: 8,
    justifyContent: "flex-start",
    alignItems: "flex-end",
  },
  orgName: {
    fontFamily: "Helvetica-Bold",
    fontSize: 11,
    marginBottom: 3,
  },
  orgLine: { fontSize: 8.5, lineHeight: 1.35, color: "#222" },
  taxInvoiceTitle: {
    fontFamily: "Helvetica-Bold",
    fontSize: 22,
    marginTop: 6,
  },
  // Meta strip: # / Date / Terms / Due | Place of Supply
  metaRow: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: "#000",
    borderBottomStyle: "solid",
  },
  metaLeft: {
    flex: 1.4,
    padding: 6,
    borderRightWidth: 1,
    borderRightColor: "#000",
    borderRightStyle: "solid",
  },
  metaRight: {
    flex: 1,
    padding: 6,
  },
  metaPair: {
    flexDirection: "row",
    marginVertical: 1,
  },
  metaLabel: {
    width: 75,
    color: "#444",
    fontSize: 8.5,
  },
  metaValue: {
    flex: 1,
    fontFamily: "Helvetica-Bold",
    fontSize: 9,
  },
  metaLabelRight: {
    color: "#444",
    fontSize: 8.5,
  },
  metaValueRight: {
    fontFamily: "Helvetica-Bold",
    fontSize: 9,
    marginLeft: 6,
  },
  // Bill To / Ship To panels header strip
  partyHeaderRow: {
    flexDirection: "row",
    backgroundColor: "#f4f4f4",
    borderBottomWidth: 1,
    borderBottomColor: "#000",
    borderBottomStyle: "solid",
  },
  partyHeaderCell: {
    flex: 1,
    padding: 4,
    fontFamily: "Helvetica-Bold",
    fontSize: 9,
    borderRightWidth: 1,
    borderRightColor: "#000",
    borderRightStyle: "solid",
  },
  partyHeaderCellLast: {
    flex: 1,
    padding: 4,
    fontFamily: "Helvetica-Bold",
    fontSize: 9,
  },
  partyBodyRow: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: "#000",
    borderBottomStyle: "solid",
  },
  partyCell: {
    flex: 1,
    padding: 6,
    borderRightWidth: 1,
    borderRightColor: "#000",
    borderRightStyle: "solid",
  },
  partyCellLast: {
    flex: 1,
    padding: 6,
  },
  partyName: {
    fontFamily: "Helvetica-Bold",
    fontSize: 10,
    marginBottom: 3,
  },
  partyLine: { fontSize: 9, lineHeight: 1.4, color: "#222" },
  partyGstin: { fontSize: 9, marginTop: 3 },
  // Line items table
  itemsHeader: {
    flexDirection: "row",
    backgroundColor: "#f4f4f4",
    borderBottomWidth: 1,
    borderBottomColor: "#000",
    borderBottomStyle: "solid",
    alignItems: "stretch" as const,
  },
  // Outer-grid headers (non-IGST): single label cells that span both
  // rows visually. Text is bottom-aligned so it sits on the same
  // baseline as the IGST sub-row's "%" / "Amt".
  itemsHeaderCell: {
    padding: 5,
    borderRightWidth: 1,
    borderRightColor: "#000",
    borderRightStyle: "solid",
    justifyContent: "flex-end" as const,
  },
  itemsHeaderCellLast: {
    padding: 5,
    justifyContent: "flex-end" as const,
  },
  itemsHeaderText: {
    fontFamily: "Helvetica-Bold",
    fontSize: 8.5,
  },
  itemRow: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: "#000",
    borderBottomStyle: "solid",
    minHeight: 24,
  },
  itemCell: {
    padding: 5,
    borderRightWidth: 1,
    borderRightColor: "#000",
    borderRightStyle: "solid",
  },
  itemCellLast: { padding: 5 },
  // Column widths (must sum to 100%)
  colNo: { width: "4%" },
  colItem: { width: "32%" },
  colHsn: { width: "10%", textAlign: "center" as const },
  colQty: { width: "8%", textAlign: "right" as const },
  colRate: { width: "12%", textAlign: "right" as const },
  colTaxPct: { width: "7%", textAlign: "right" as const },
  colTaxAmt: { width: "11%", textAlign: "right" as const },
  colAmount: { width: "16%", textAlign: "right" as const },
  // Two-row header cluster for IGST: a top "IGST" banner spanning
  // both sub-columns, with "%" + "Amt" labels in a sub-row below.
  igstClusterCol: {
    width: "18%", // colTaxPct (7%) + colTaxAmt (11%)
    borderRightWidth: 1,
    borderRightColor: "#000",
    borderRightStyle: "solid",
  },
  igstClusterTopLabel: {
    fontFamily: "Helvetica-Bold",
    fontSize: 8.5,
    padding: 3,
    textAlign: "center" as const,
    borderBottomWidth: 1,
    borderBottomColor: "#000",
    borderBottomStyle: "solid",
  },
  igstClusterSubRow: {
    flexDirection: "row",
  },
  igstClusterSubCell: {
    fontFamily: "Helvetica-Bold",
    fontSize: 8.5,
    padding: 5,
    textAlign: "right" as const,
    width: "38.89%", // 7 / 18
    borderRightWidth: 1,
    borderRightColor: "#000",
    borderRightStyle: "solid",
  },
  igstClusterSubCellLast: {
    fontFamily: "Helvetica-Bold",
    fontSize: 8.5,
    padding: 5,
    textAlign: "right" as const,
    width: "61.11%", // 11 / 18
  },
  // Qty cell: stack "1.00" / "Nos" on two lines (Zoho-style)
  qtyStack: {
    alignItems: "flex-end" as const,
  },
  qtyValue: { fontSize: 9 },
  qtyUnit: { fontSize: 9, color: "#444" },
  // Bottom strip — left col (words + notes), right col (totals)
  bottomRow: { flexDirection: "row" },
  bottomLeft: {
    flex: 1.4,
    padding: 8,
    borderRightWidth: 1,
    borderRightColor: "#000",
    borderRightStyle: "solid",
  },
  bottomRight: { flex: 1 },
  totalLine: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderBottomWidth: 1,
    borderBottomColor: "#e5e5e5",
    borderBottomStyle: "solid",
  },
  totalLabel: { fontSize: 9, color: "#222" },
  totalValue: { fontSize: 9 },
  totalLineBold: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderBottomWidth: 1,
    borderBottomColor: "#000",
    borderBottomStyle: "solid",
  },
  totalLabelBold: { fontSize: 9.5, fontFamily: "Helvetica-Bold" },
  totalValueBold: { fontSize: 9.5, fontFamily: "Helvetica-Bold" },
  twoLabel: {
    fontFamily: "Helvetica-Bold",
    fontSize: 9,
    marginBottom: 3,
  },
  twoText: {
    fontSize: 9,
    fontFamily: "Helvetica-BoldOblique",
    lineHeight: 1.4,
  },
  notesLabel: {
    fontFamily: "Helvetica-Bold",
    fontSize: 9,
    marginTop: 10,
    marginBottom: 2,
  },
  notesText: { fontSize: 9, lineHeight: 1.4 },
  signatureBox: {
    padding: 8,
    minHeight: 70,
    justifyContent: "flex-end",
    alignItems: "flex-end",
  },
  signatureLabel: {
    fontSize: 9,
    color: "#222",
    paddingTop: 28,
    borderTopWidth: 1,
    borderTopColor: "#222",
    borderTopStyle: "solid",
    width: 140,
    textAlign: "center" as const,
  },
});

function splitLines(text: string | null | undefined): string[] {
  if (!text) return [];
  return text
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function InvoiceTaxPdf({ doc }: { doc: RenderableSalesDocument }) {
  const org = doc.organization;
  const orgAddressLines = splitLines(org.address);
  const billingAddressLines = splitLines(doc.customer.billingAddress);
  const shippingAddressLines = splitLines(
    doc.customer.shippingAddress ?? doc.customer.billingAddress
  );
  const balance = doc.balanceDue ?? doc.totals.total;
  const breakdown = doc.taxBreakdown ?? [];

  return (
    <Document>
      <Page size="A4" style={inv.page}>
        <View style={inv.outer}>
          {/* Top: supplier block on left, TAX INVOICE on right */}
          <View style={inv.topRow}>
            <View style={inv.topLeft}>
              <Text style={inv.orgName}>{org.name}</Text>
              {orgAddressLines.map((ln, i) => (
                <Text key={`oa-${i}`} style={inv.orgLine}>
                  {ln}
                </Text>
              ))}
              {org.gstin ? (
                <Text style={inv.orgLine}>GSTIN {org.gstin}</Text>
              ) : null}
              {org.phoneNumber ? (
                <Text style={inv.orgLine}>{org.phoneNumber}</Text>
              ) : null}
              {org.email ? (
                <Text style={inv.orgLine}>{org.email}</Text>
              ) : null}
            </View>
            <View style={inv.topRight}>
              <Text style={inv.taxInvoiceTitle}>TAX INVOICE</Text>
            </View>
          </View>

          {/* Meta strip */}
          <View style={inv.metaRow}>
            <View style={inv.metaLeft}>
              <View style={inv.metaPair}>
                <Text style={inv.metaLabel}>#</Text>
                <Text style={inv.metaValue}>: {doc.document.number}</Text>
              </View>
              <View style={inv.metaPair}>
                <Text style={inv.metaLabel}>Invoice Date</Text>
                <Text style={inv.metaValue}>: {doc.document.date}</Text>
              </View>
              {doc.document.terms ? (
                <View style={inv.metaPair}>
                  <Text style={inv.metaLabel}>Terms</Text>
                  <Text style={inv.metaValue}>: {doc.document.terms}</Text>
                </View>
              ) : null}
              {doc.document.dueDate ? (
                <View style={inv.metaPair}>
                  <Text style={inv.metaLabel}>Due Date</Text>
                  <Text style={inv.metaValue}>: {doc.document.dueDate}</Text>
                </View>
              ) : null}
            </View>
            <View style={inv.metaRight}>
              {doc.document.placeOfSupply ? (
                <View style={{ flexDirection: "row" }}>
                  <Text style={inv.metaLabelRight}>Place Of Supply</Text>
                  <Text style={inv.metaValueRight}>
                    : {doc.document.placeOfSupply}
                  </Text>
                </View>
              ) : null}
            </View>
          </View>

          {/* Bill To / Ship To header */}
          <View style={inv.partyHeaderRow}>
            <Text style={inv.partyHeaderCell}>Bill To</Text>
            <Text style={inv.partyHeaderCellLast}>Ship To</Text>
          </View>
          <View style={inv.partyBodyRow}>
            <View style={inv.partyCell}>
              <Text style={inv.partyName}>{doc.customer.displayName}</Text>
              {billingAddressLines.map((ln, i) => (
                <Text key={`ba-${i}`} style={inv.partyLine}>
                  {ln}
                </Text>
              ))}
              {doc.customer.gstin ? (
                <Text style={inv.partyGstin}>GSTIN {doc.customer.gstin}</Text>
              ) : null}
            </View>
            <View style={inv.partyCellLast}>
              {shippingAddressLines.map((ln, i) => (
                <Text key={`sa-${i}`} style={inv.partyLine}>
                  {ln}
                </Text>
              ))}
              {doc.customer.gstin ? (
                <Text style={inv.partyGstin}>GSTIN {doc.customer.gstin}</Text>
              ) : null}
            </View>
          </View>

          {/* Items table — 2-row IGST grouped header (Zoho-style) */}
          <View style={inv.itemsHeader}>
            <View style={[inv.itemsHeaderCell, inv.colNo]}>
              <Text style={inv.itemsHeaderText}>#</Text>
            </View>
            <View style={[inv.itemsHeaderCell, inv.colItem]}>
              <Text style={inv.itemsHeaderText}>Item &amp; Description</Text>
            </View>
            <View style={[inv.itemsHeaderCell, inv.colHsn]}>
              <Text style={inv.itemsHeaderText}>HSN/SAC</Text>
            </View>
            <View style={[inv.itemsHeaderCell, inv.colQty]}>
              <Text style={inv.itemsHeaderText}>Qty</Text>
            </View>
            <View style={[inv.itemsHeaderCell, inv.colRate]}>
              <Text style={inv.itemsHeaderText}>Rate</Text>
            </View>
            {/* IGST cluster: top banner + (% / Amt) sub-row */}
            <View style={inv.igstClusterCol}>
              <Text style={inv.igstClusterTopLabel}>IGST</Text>
              <View style={inv.igstClusterSubRow}>
                <Text style={inv.igstClusterSubCell}>%</Text>
                <Text style={inv.igstClusterSubCellLast}>Amt</Text>
              </View>
            </View>
            <View style={[inv.itemsHeaderCellLast, inv.colAmount]}>
              <Text style={inv.itemsHeaderText}>Amount</Text>
            </View>
          </View>
          {doc.lines.map((l, i) => {
            const rateNum = Number(l.rate);
            const amountNum = Number(l.amount);
            const taxPct = l.taxRate ?? 0;
            const taxAmt =
              l.taxAmount != null
                ? Number(l.taxAmount)
                : taxPct
                  ? (amountNum * taxPct) / 100
                  : 0;
            return (
              <View key={i} style={inv.itemRow} wrap={false}>
                <Text style={[inv.itemCell, inv.colNo]}>{i + 1}</Text>
                <View style={[inv.itemCell, inv.colItem]}>
                  <Text style={{ fontFamily: "Helvetica-Bold", fontSize: 9 }}>
                    {l.name}
                  </Text>
                  {l.description
                    ? splitLines(l.description).map((dl, di) => (
                        <Text
                          key={`d-${i}-${di}`}
                          style={{
                            fontSize: 8.5,
                            color: "#444",
                            marginTop: di === 0 ? 1 : 0,
                          }}
                        >
                          {dl}
                        </Text>
                      ))
                    : null}
                </View>
                <Text style={[inv.itemCell, inv.colHsn]}>{l.hsnSac ?? ""}</Text>
                <View style={[inv.itemCell, inv.colQty, inv.qtyStack]}>
                  <Text style={inv.qtyValue}>{l.quantity}</Text>
                  {l.unit ? <Text style={inv.qtyUnit}>{l.unit}</Text> : null}
                </View>
                <Text style={[inv.itemCell, inv.colRate]}>
                  {formatINR(rateNum)}
                </Text>
                <Text style={[inv.itemCell, inv.colTaxPct]}>
                  {taxPct ? `${taxPct}%` : ""}
                </Text>
                <Text style={[inv.itemCell, inv.colTaxAmt]}>
                  {taxAmt ? formatINR(taxAmt) : ""}
                </Text>
                <Text style={[inv.itemCellLast, inv.colAmount]}>
                  {formatINR(amountNum)}
                </Text>
              </View>
            );
          })}

          {/* Bottom: words+notes on left, totals on right */}
          <View style={inv.bottomRow}>
            <View style={inv.bottomLeft}>
              {doc.totalInWords ? (
                <>
                  <Text style={inv.twoLabel}>Total In Words</Text>
                  <Text style={inv.twoText}>{doc.totalInWords}</Text>
                </>
              ) : null}
              {doc.notes ? (
                <>
                  <Text style={inv.notesLabel}>Notes</Text>
                  <Text style={inv.notesText}>{doc.notes}</Text>
                </>
              ) : null}
              {doc.termsAndConditions ? (
                <>
                  <Text style={inv.notesLabel}>Terms &amp; Conditions</Text>
                  <Text style={inv.notesText}>{doc.termsAndConditions}</Text>
                </>
              ) : null}
            </View>
            <View style={inv.bottomRight}>
              <View style={inv.totalLine}>
                <Text style={inv.totalLabel}>Sub Total</Text>
                <Text style={inv.totalValue}>
                  {formatINR(doc.totals.subTotal)}
                </Text>
              </View>
              {breakdown.map((b, i) => (
                <View key={`bd-${i}`} style={inv.totalLine}>
                  <Text style={inv.totalLabel}>{b.label}</Text>
                  <Text style={inv.totalValue}>{formatINR(b.amount)}</Text>
                </View>
              ))}
              {Number(doc.totals.documentDiscountAmount) !== 0 ? (
                <View style={inv.totalLine}>
                  <Text style={inv.totalLabel}>Discount</Text>
                  <Text style={inv.totalValue}>
                    -{formatINR(doc.totals.documentDiscountAmount)}
                  </Text>
                </View>
              ) : null}
              {Number(doc.totals.adjustmentAmount) !== 0 ? (
                <View style={inv.totalLine}>
                  <Text style={inv.totalLabel}>Adjustment</Text>
                  <Text style={inv.totalValue}>
                    {formatINR(doc.totals.adjustmentAmount)}
                  </Text>
                </View>
              ) : null}
              <View style={inv.totalLineBold}>
                <Text style={inv.totalLabelBold}>Total</Text>
                <Text style={inv.totalValueBold}>
                  ₹{formatINR(doc.totals.total)}
                </Text>
              </View>
              <View style={inv.totalLineBold}>
                <Text style={inv.totalLabelBold}>Balance Due</Text>
                <Text style={inv.totalValueBold}>₹{formatINR(balance)}</Text>
              </View>
              <View style={inv.signatureBox}>
                <Text style={inv.signatureLabel}>Authorized Signature</Text>
              </View>
            </View>
          </View>
        </View>
      </Page>
    </Document>
  );
}

// ─── Legacy layout (kept for non-INVOICE types) ────────────────

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

function LegacySalesDocumentPdf({ doc }: { doc: RenderableSalesDocument }): React.ReactElement<unknown> {
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

function SalesDocumentPdf({ doc }: { doc: RenderableSalesDocument }): React.ReactElement<unknown> {
  if (doc.type === "INVOICE") {
    return <InvoiceTaxPdf doc={doc} />;
  }
  return <LegacySalesDocumentPdf doc={doc} />;
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
