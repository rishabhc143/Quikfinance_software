/**
 * RPT-TB PDF — React-PDF document for the Trial Balance report.
 *
 * A4 portrait. Banner + 5-group section table + grand-total + base
 * currency footnote. Each group header is followed by its account
 * rows; subtotal rows are inline. Wraps each group block with
 * wrap={false} so a group + its subtotal doesn't break across pages.
 */

import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
  renderToBuffer,
} from "@react-pdf/renderer";
import { palette, fmtMoney } from "./common";
import type { TrialBalance } from "@/lib/reports/trial-balance";

const tbStyles = StyleSheet.create({
  page: {
    paddingTop: 32,
    paddingBottom: 40,
    paddingHorizontal: 32,
    fontSize: 9,
    fontFamily: "Helvetica",
    color: palette.textPrimary,
  },
  banner: {
    backgroundColor: palette.bannerBg,
    color: palette.bannerText,
    paddingVertical: 12,
    paddingHorizontal: 12,
    marginBottom: 14,
  },
  bannerOrg: { fontSize: 9, color: "#D1D5DB", marginBottom: 3 },
  bannerTitle: { fontSize: 13, fontFamily: "Helvetica-Bold" },
  bannerSub: { fontSize: 9, color: "#D1D5DB", marginTop: 3 },
  table: { width: "100%" },
  headerRow: {
    flexDirection: "row",
    backgroundColor: palette.subtotalBg,
    paddingHorizontal: 8,
    paddingVertical: 6,
    fontFamily: "Helvetica-Bold",
    borderBottomWidth: 1,
    borderBottomColor: palette.border,
  },
  groupHeader: {
    flexDirection: "row",
    backgroundColor: "#F3F4F6",
    paddingHorizontal: 8,
    paddingVertical: 6,
    fontFamily: "Helvetica-Bold",
  },
  accountRow: {
    flexDirection: "row",
    paddingHorizontal: 8,
    paddingVertical: 4,
    paddingLeft: 24,
    borderBottomWidth: 0.5,
    borderBottomColor: palette.border,
  },
  grandTotalRow: {
    flexDirection: "row",
    backgroundColor: palette.bannerBg,
    color: "#FFFFFF",
    paddingHorizontal: 8,
    paddingVertical: 7,
    fontFamily: "Helvetica-Bold",
    marginTop: 6,
  },
  imbalanceBanner: {
    backgroundColor: "#FEF3C7",
    borderLeftWidth: 3,
    borderLeftColor: "#D97706",
    padding: 8,
    marginBottom: 10,
    fontSize: 8,
    color: "#78350F",
  },
  footnote: {
    marginTop: 12,
    fontSize: 7,
    color: palette.textMuted,
  },
  cellLabel: { flex: 1, textAlign: "left" },
  cellAmount: { width: 120, textAlign: "right" },
});

export type TrialBalancePdfInput = {
  orgName: string;
  asOfDisplay: string;
  basisLabel: string;
  currency: string;
  tb: TrialBalance;
  /** Visible columns — drives layout. */
  cols: {
    accountCode: boolean;
    account: boolean;
    netDebit: boolean;
    netCredit: boolean;
  };
};

export async function renderTrialBalancePdf(
  input: TrialBalancePdfInput
): Promise<Buffer> {
  return renderToBuffer(<TrialBalanceDocument {...input} />) as Promise<Buffer>;
}

function TrialBalanceDocument({
  orgName,
  asOfDisplay,
  basisLabel,
  currency,
  tb,
  cols,
}: TrialBalancePdfInput) {
  return (
    <Document>
      <Page size="A4" style={tbStyles.page}>
        <View style={tbStyles.banner}>
          <Text style={tbStyles.bannerOrg}>{orgName}</Text>
          <Text style={tbStyles.bannerTitle}>Trial Balance</Text>
          <Text style={tbStyles.bannerSub}>
            Basis: {basisLabel} · As of {asOfDisplay}
          </Text>
        </View>

        {tb.imbalance > 0.005 ? (
          <View style={tbStyles.imbalanceBanner}>
            <Text>
              Imbalance: {fmtMoney(tb.imbalance)} — Σ Debit ≠ Σ Credit.
            </Text>
          </View>
        ) : null}

        <View style={tbStyles.table}>
          {/* Column header */}
          <View style={tbStyles.headerRow}>
            {cols.accountCode ? (
              <Text style={{ width: 70 }}>Code</Text>
            ) : null}
            {cols.account ? <Text style={tbStyles.cellLabel}>Account</Text> : null}
            {cols.netDebit ? (
              <Text style={tbStyles.cellAmount}>Net Debit</Text>
            ) : null}
            {cols.netCredit ? (
              <Text style={tbStyles.cellAmount}>Net Credit</Text>
            ) : null}
          </View>

          {tb.groups.map((g) => (
            <View key={g.groupKey} wrap={false}>
              <View style={tbStyles.groupHeader}>
                <Text>{g.groupLabel}</Text>
              </View>
              {g.rows.map((r) => (
                <View key={r.accountId} style={tbStyles.accountRow}>
                  {cols.accountCode ? (
                    <Text style={{ width: 70 - 16 /* indent eat */ }}>
                      {r.accountCode ?? ""}
                    </Text>
                  ) : null}
                  {cols.account ? (
                    <Text style={tbStyles.cellLabel}>{r.accountName}</Text>
                  ) : null}
                  {cols.netDebit ? (
                    <Text style={tbStyles.cellAmount}>
                      {r.netDebit > 0 ? fmtMoney(r.netDebit) : ""}
                    </Text>
                  ) : null}
                  {cols.netCredit ? (
                    <Text style={tbStyles.cellAmount}>
                      {r.netCredit > 0 ? fmtMoney(r.netCredit) : ""}
                    </Text>
                  ) : null}
                </View>
              ))}
            </View>
          ))}

          <View style={tbStyles.grandTotalRow}>
            <Text style={{ ...tbStyles.cellLabel, color: "#FFFFFF" }}>
              Total for Trial Balance
            </Text>
            {cols.netDebit ? (
              <Text style={{ ...tbStyles.cellAmount, color: "#FFFFFF" }}>
                {fmtMoney(tb.totalDebit)}
              </Text>
            ) : null}
            {cols.netCredit ? (
              <Text style={{ ...tbStyles.cellAmount, color: "#FFFFFF" }}>
                {fmtMoney(tb.totalCredit)}
              </Text>
            ) : null}
          </View>
        </View>

        <Text style={tbStyles.footnote}>
          **Amount is displayed in your base currency [{currency}]
        </Text>
      </Page>
    </Document>
  );
}
