/**
 * REPORTS-PDF — Shared @react-pdf/renderer primitives.
 *
 * Three reports (P&L, Balance Sheet, Cash Flow) each get their own
 * template (lib/reports/pdf/{profit-loss,balance-sheet,cash-flow}.tsx)
 * but share the page layout, banner, and amount formatter through
 * this module.
 */

import { StyleSheet, Font } from "@react-pdf/renderer";

// react-pdf ships Helvetica out of the box; no font loading needed.
// If we ever want a custom font, register here with Font.register.
void Font;

export const palette = {
  textPrimary: "#111111",
  textMuted: "#666666",
  bannerBg: "#1F2937",
  bannerText: "#FFFFFF",
  subtotalBg: "#F5F5F5",
  border: "#E5E7EB",
  destructive: "#DC2626",
};

export const styles = StyleSheet.create({
  page: {
    paddingTop: 32,
    paddingBottom: 32,
    paddingHorizontal: 28,
    fontSize: 9,
    fontFamily: "Helvetica",
    color: palette.textPrimary,
  },
  banner: {
    backgroundColor: palette.bannerBg,
    color: palette.bannerText,
    paddingVertical: 14,
    paddingHorizontal: 14,
    marginBottom: 12,
  },
  bannerOrgName: {
    fontSize: 9,
    color: "#D1D5DB",
    marginBottom: 4,
  },
  bannerTitle: {
    fontSize: 14,
    fontFamily: "Helvetica-Bold",
  },
  bannerSubtitle: {
    fontSize: 9,
    color: "#D1D5DB",
    marginTop: 4,
  },
  table: {
    width: "100%",
  },
  rowSection: {
    flexDirection: "row",
    backgroundColor: palette.subtotalBg,
    paddingHorizontal: 10,
    paddingVertical: 6,
    fontFamily: "Helvetica-Bold",
    borderBottomWidth: 1,
    borderBottomColor: palette.border,
  },
  rowAccount: {
    flexDirection: "row",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderBottomWidth: 1,
    borderBottomColor: palette.border,
  },
  rowAccountIndent: {
    paddingLeft: 28,
  },
  rowAccountIndent2: {
    paddingLeft: 46,
  },
  rowSubtotal: {
    flexDirection: "row",
    backgroundColor: palette.subtotalBg,
    paddingHorizontal: 10,
    paddingVertical: 5,
    fontFamily: "Helvetica-Bold",
    borderBottomWidth: 1,
    borderBottomColor: palette.border,
  },
  cellLabel: {
    flex: 1,
  },
  cellAmount: {
    width: 100,
    textAlign: "right",
  },
  footer: {
    position: "absolute",
    bottom: 16,
    left: 28,
    right: 28,
    fontSize: 8,
    color: palette.textMuted,
    flexDirection: "row",
    justifyContent: "space-between",
  },
});

/** Money formatter matching the on-screen tables (2-dp, neg as -1234.56). */
export function fmtMoney(n: number): string {
  if (Math.abs(n) < 0.005) return "0.00";
  const abs = Math.abs(n).toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return n < 0 ? `-${abs}` : abs;
}
