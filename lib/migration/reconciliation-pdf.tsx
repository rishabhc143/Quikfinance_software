/**
 * Sprint 5 — Tally Companion reconciliation PDF.
 *
 * Auto-generated per migration batch. Designed to be handed to a CA
 * for sign-off after a Tally import:
 *
 *   - Header — file metadata + import counts
 *   - Vouchers by type — totals per type (Sales / Purchase /
 *     Receipt / Payment / Journal / CN / DN / Contra)
 *   - Ledgers by kind — counts per kind (Customer / Vendor / Bank /
 *     P&L / BS / Tax / Other)
 *   - Top 10 parties by AR + top 10 by AP — quick sanity check
 *   - Unmatched cash — diagnostic from the payment matcher
 *   - CA sign-off line — date + signature
 *
 * Trust artifact: the customer downloads this PDF, hands to CA,
 * CA reviews + signs. We're not claiming Quikfinance numbers MATCH
 * Tally (that would require the native side too) — we're showing
 * what Quikfinance NOW HOLDS from the Tally import, with enough
 * detail that a CA can spot-check.
 *
 * Renders as a React Server Component using @react-pdf/renderer
 * (same library as P&L / BS / Cash Flow / Trial Balance reports).
 */

import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
} from "@react-pdf/renderer";
import { format } from "date-fns";
import { palette, styles as baseStyles } from "@/lib/reports/pdf/common";

const styles = StyleSheet.create({
  ...baseStyles,
  section: { marginBottom: 14 },
  sectionTitle: {
    fontSize: 11,
    fontFamily: "Helvetica-Bold",
    marginBottom: 6,
    color: palette.textPrimary,
  },
  metaRow: { flexDirection: "row", justifyContent: "space-between", marginBottom: 2, fontSize: 9 },
  metaLabel: { color: palette.textMuted },
  metaValue: { fontFamily: "Helvetica-Bold" },
  table: { width: "100%", marginTop: 4 },
  tableHeader: {
    flexDirection: "row",
    backgroundColor: palette.subtotalBg,
    paddingVertical: 4,
    paddingHorizontal: 4,
    borderTopWidth: 0.5,
    borderBottomWidth: 0.5,
    borderColor: palette.border,
    fontSize: 8,
    fontFamily: "Helvetica-Bold",
  },
  tableRow: {
    flexDirection: "row",
    paddingVertical: 3,
    paddingHorizontal: 4,
    borderBottomWidth: 0.25,
    borderColor: palette.border,
    fontSize: 9,
  },
  colName: { flex: 3 },
  colCount: { flex: 1, textAlign: "right" },
  colAmount: { flex: 2, textAlign: "right" },
  warningBox: {
    backgroundColor: "#FFFBEB",
    borderWidth: 0.5,
    borderColor: "#F59E0B",
    padding: 8,
    marginTop: 6,
    fontSize: 8,
  },
  signoffBlock: {
    marginTop: 28,
    paddingTop: 12,
    borderTopWidth: 0.5,
    borderTopColor: palette.border,
  },
  signoffLabel: { fontSize: 9, marginBottom: 18 },
  signoffLine: {
    borderBottomWidth: 0.5,
    borderColor: palette.textPrimary,
    width: 280,
    marginBottom: 4,
  },
});

export type ReconciliationData = {
  organization: {
    name: string;
    currency: string;
  };
  batch: {
    id: string;
    sourceFormat: string;
    sourceFilename: string;
    sourceFilesizeB: number;
    startedAt: Date;
    completedAt: Date | null;
    insertedLedgers: number;
    insertedVouchers: number;
    warnings: { code: string; message: string }[];
  };
  voucherTotalsByType: Array<{ type: string; count: number; total: number }>;
  ledgerCountsByKind: Array<{ kind: string; count: number }>;
  topAr: Array<{ party: string; outstanding: number; voucherCount: number }>;
  topAp: Array<{ party: string; outstanding: number; voucherCount: number }>;
  matcherStats?: {
    vouchersUpdated: number;
    totalCashApplied: number;
    unmatchedCash: number;
  };
};

const fmtCurrency = (n: number, ccy = "INR") =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: ccy,
    maximumFractionDigits: 2,
  }).format(n);

const fmtSize = (b: number) => {
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
  return `${(b / 1024 / 1024).toFixed(2)} MB`;
};

const VCHTYPE_LABEL: Record<string, string> = {
  sales: "Sales (invoices)",
  purchase: "Purchase (bills)",
  receipt: "Receipt (cash in)",
  payment: "Payment (cash out)",
  journal: "Journal",
  credit_note: "Credit Note",
  debit_note: "Debit Note",
  contra: "Contra",
};

const KIND_LABEL: Record<string, string> = {
  customer: "Customers",
  vendor: "Vendors",
  bank: "Bank / Cash",
  income: "Income accounts",
  expense: "Expense accounts",
  asset: "Asset accounts",
  liability: "Liability accounts",
  tax: "Tax accounts",
  other: "Other",
};

export function ReconciliationReport({ data }: { data: ReconciliationData }) {
  const ccy = data.organization.currency || "INR";
  return (
    <Document title={`Tally Reconciliation — ${data.batch.sourceFilename}`}>
      <Page size="A4" style={styles.page}>
        {/* Banner */}
        <View style={styles.banner}>
          <Text style={styles.bannerOrgName}>{data.organization.name}</Text>
          <Text style={styles.bannerTitle}>Tally Import Reconciliation Report</Text>
        </View>

        {/* Batch metadata */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Import details</Text>
          <View style={styles.metaRow}>
            <Text style={styles.metaLabel}>Source format</Text>
            <Text style={styles.metaValue}>{data.batch.sourceFormat}</Text>
          </View>
          <View style={styles.metaRow}>
            <Text style={styles.metaLabel}>Source file</Text>
            <Text style={styles.metaValue}>
              {data.batch.sourceFilename} ({fmtSize(data.batch.sourceFilesizeB)})
            </Text>
          </View>
          <View style={styles.metaRow}>
            <Text style={styles.metaLabel}>Imported on</Text>
            <Text style={styles.metaValue}>
              {format(data.batch.startedAt, "dd MMM yyyy, HH:mm")}
            </Text>
          </View>
          <View style={styles.metaRow}>
            <Text style={styles.metaLabel}>Total ledgers imported</Text>
            <Text style={styles.metaValue}>
              {data.batch.insertedLedgers.toLocaleString("en-IN")}
            </Text>
          </View>
          <View style={styles.metaRow}>
            <Text style={styles.metaLabel}>Total vouchers imported</Text>
            <Text style={styles.metaValue}>
              {data.batch.insertedVouchers.toLocaleString("en-IN")}
            </Text>
          </View>
        </View>

        {/* Vouchers by type */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Vouchers by type</Text>
          <View style={styles.table}>
            <View style={styles.tableHeader}>
              <Text style={styles.colName}>Type</Text>
              <Text style={styles.colCount}>Count</Text>
              <Text style={styles.colAmount}>Total amount</Text>
            </View>
            {data.voucherTotalsByType.map((row) => (
              <View key={row.type} style={styles.tableRow}>
                <Text style={styles.colName}>{VCHTYPE_LABEL[row.type] ?? row.type}</Text>
                <Text style={styles.colCount}>{row.count.toLocaleString("en-IN")}</Text>
                <Text style={styles.colAmount}>{fmtCurrency(row.total, ccy)}</Text>
              </View>
            ))}
          </View>
        </View>

        {/* Ledgers by kind */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Ledgers by category</Text>
          <View style={styles.table}>
            <View style={styles.tableHeader}>
              <Text style={styles.colName}>Category</Text>
              <Text style={styles.colCount}>Count</Text>
            </View>
            {data.ledgerCountsByKind.map((row) => (
              <View key={row.kind} style={styles.tableRow}>
                <Text style={styles.colName}>{KIND_LABEL[row.kind] ?? row.kind}</Text>
                <Text style={styles.colCount}>{row.count.toLocaleString("en-IN")}</Text>
              </View>
            ))}
          </View>
        </View>

        {/* Top AR */}
        {data.topAr.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Top customers by outstanding (AR)</Text>
            <View style={styles.table}>
              <View style={styles.tableHeader}>
                <Text style={styles.colName}>Customer</Text>
                <Text style={styles.colCount}>Invoices</Text>
                <Text style={styles.colAmount}>Outstanding</Text>
              </View>
              {data.topAr.map((row) => (
                <View key={row.party} style={styles.tableRow}>
                  <Text style={styles.colName}>{row.party}</Text>
                  <Text style={styles.colCount}>{row.voucherCount}</Text>
                  <Text style={styles.colAmount}>{fmtCurrency(row.outstanding, ccy)}</Text>
                </View>
              ))}
            </View>
          </View>
        )}

        {/* Top AP */}
        {data.topAp.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Top vendors by outstanding (AP)</Text>
            <View style={styles.table}>
              <View style={styles.tableHeader}>
                <Text style={styles.colName}>Vendor</Text>
                <Text style={styles.colCount}>Bills</Text>
                <Text style={styles.colAmount}>Outstanding</Text>
              </View>
              {data.topAp.map((row) => (
                <View key={row.party} style={styles.tableRow}>
                  <Text style={styles.colName}>{row.party}</Text>
                  <Text style={styles.colCount}>{row.voucherCount}</Text>
                  <Text style={styles.colAmount}>{fmtCurrency(row.outstanding, ccy)}</Text>
                </View>
              ))}
            </View>
          </View>
        )}

        {/* Matcher diagnostics */}
        {data.matcherStats && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Payment matcher diagnostics</Text>
            <View style={styles.metaRow}>
              <Text style={styles.metaLabel}>Vouchers paid down by matcher</Text>
              <Text style={styles.metaValue}>{data.matcherStats.vouchersUpdated}</Text>
            </View>
            <View style={styles.metaRow}>
              <Text style={styles.metaLabel}>Total cash applied</Text>
              <Text style={styles.metaValue}>
                {fmtCurrency(data.matcherStats.totalCashApplied, ccy)}
              </Text>
            </View>
            <View style={styles.metaRow}>
              <Text style={styles.metaLabel}>Unmatched cash (advances / orphans)</Text>
              <Text style={styles.metaValue}>
                {fmtCurrency(data.matcherStats.unmatchedCash, ccy)}
              </Text>
            </View>
          </View>
        )}

        {/* Warnings */}
        {data.batch.warnings.length > 0 && (
          <View style={styles.warningBox}>
            <Text style={{ fontFamily: "Helvetica-Bold", marginBottom: 4 }}>
              Parser warnings ({data.batch.warnings.length})
            </Text>
            {data.batch.warnings.slice(0, 10).map((w, i) => (
              <Text key={i} style={{ marginBottom: 2 }}>
                • {w.message}
              </Text>
            ))}
            {data.batch.warnings.length > 10 && (
              <Text style={{ fontStyle: "italic" }}>
                ...and {data.batch.warnings.length - 10} more (see in-app for full list)
              </Text>
            )}
          </View>
        )}

        {/* CA sign-off */}
        <View style={styles.signoffBlock} wrap={false}>
          <Text style={styles.sectionTitle}>Reviewed by</Text>
          <Text style={styles.signoffLabel}>I have reviewed the above import:</Text>
          <View style={styles.signoffLine} />
          <Text style={{ fontSize: 8, color: palette.textMuted }}>
            Name + signature
          </Text>
          <View style={[styles.signoffLine, { marginTop: 14 }]} />
          <Text style={{ fontSize: 8, color: palette.textMuted }}>Date</Text>
        </View>

        {/* Footer */}
        <Text
          style={{
            position: "absolute",
            bottom: 16,
            left: 28,
            right: 28,
            fontSize: 7,
            color: palette.textMuted,
            textAlign: "center",
          }}
          fixed
        >
          Generated by Quikfinance Tally Companion · Batch {data.batch.id} ·{" "}
          {format(new Date(), "dd MMM yyyy HH:mm")}
        </Text>
      </Page>
    </Document>
  );
}
