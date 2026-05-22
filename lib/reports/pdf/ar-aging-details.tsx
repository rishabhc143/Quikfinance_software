/**
 * RPT-AR-DETAILS PDF — React-PDF document for the AR Aging Details
 * report. Uses the shared styles from `./common.tsx`.
 *
 * Renders:
 *   - Banner with org name + report title + as-of date
 *   - Table headers for the user's selected columns
 *   - Either flat rows or grouped rows with subtotals + grand total
 *   - Page-aware footer with page number
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
import type {
  ArAgingDetailGroup,
  ArAgingDetailRow,
} from "@/lib/reports/ar-aging-details";

const tbl = StyleSheet.create({
  page: {
    paddingTop: 32,
    paddingBottom: 40,
    paddingHorizontal: 24,
    fontSize: 8,
    fontFamily: "Helvetica",
    color: palette.textPrimary,
  },
  banner: {
    backgroundColor: palette.bannerBg,
    color: palette.bannerText,
    paddingVertical: 12,
    paddingHorizontal: 12,
    marginBottom: 10,
  },
  bannerOrgName: {
    fontSize: 8,
    color: "#D1D5DB",
    marginBottom: 3,
  },
  bannerTitle: {
    fontSize: 12,
    fontFamily: "Helvetica-Bold",
  },
  bannerSubtitle: {
    fontSize: 8,
    color: "#D1D5DB",
    marginTop: 3,
  },
  table: { width: "100%" },
  headerRow: {
    flexDirection: "row",
    backgroundColor: palette.subtotalBg,
    paddingHorizontal: 6,
    paddingVertical: 5,
    fontFamily: "Helvetica-Bold",
    borderBottomWidth: 1,
    borderBottomColor: palette.border,
  },
  dataRow: {
    flexDirection: "row",
    paddingHorizontal: 6,
    paddingVertical: 4,
    borderBottomWidth: 0.5,
    borderBottomColor: palette.border,
  },
  groupHeader: {
    flexDirection: "row",
    backgroundColor: "#E5E7EB",
    paddingHorizontal: 6,
    paddingVertical: 4,
    fontFamily: "Helvetica-Bold",
    fontSize: 9,
  },
  subtotalRow: {
    flexDirection: "row",
    backgroundColor: palette.subtotalBg,
    paddingHorizontal: 6,
    paddingVertical: 5,
    fontFamily: "Helvetica-Bold",
    borderTopWidth: 0.5,
    borderTopColor: palette.border,
    borderBottomWidth: 1,
    borderBottomColor: palette.border,
  },
  grandTotalRow: {
    flexDirection: "row",
    backgroundColor: "#1F2937",
    color: "#FFFFFF",
    paddingHorizontal: 6,
    paddingVertical: 6,
    fontFamily: "Helvetica-Bold",
    marginTop: 4,
  },
  footer: {
    position: "absolute",
    bottom: 16,
    left: 24,
    right: 24,
    fontSize: 7,
    color: palette.textMuted,
    flexDirection: "row",
    justifyContent: "space-between",
  },
  cellLeft: { textAlign: "left" },
  cellRight: { textAlign: "right" },
  // Column widths (% of row); tweak if columns added/removed.
  wDate: { width: "9%" },
  wDueDate: { width: "9%" },
  wNumber: { width: "13%" },
  wType: { width: "9%" },
  wStatus: { width: "11%" },
  wCustomer: { width: "21%" },
  wAge: { width: "8%", textAlign: "right" },
  wAmount: { width: "10%", textAlign: "right" },
  wBalance: { width: "10%", textAlign: "right" },
});

export type ArAgingDetailsPdfInput = {
  orgName: string;
  reportTitle: string;
  asOfDisplay: string;
  groups: ArAgingDetailGroup[];
  flatRows: ArAgingDetailRow[];
  grandTotal: number;
  /** Column keys (`date`, `dueDate`, ...) actually visible to the user. */
  cols: string[];
  groupBy: string;
};

/** Render the PDF document and return a Buffer. */
export async function renderArAgingDetailsPdf(
  input: ArAgingDetailsPdfInput
): Promise<Buffer> {
  return renderToBuffer(<ArAgingDetailsDocument {...input} />) as Promise<Buffer>;
}

function ArAgingDetailsDocument(input: ArAgingDetailsPdfInput) {
  const { orgName, reportTitle, asOfDisplay, groups, flatRows, grandTotal, cols, groupBy } =
    input;

  return (
    <Document>
      <Page size="A4" orientation="landscape" style={tbl.page}>
        <View style={tbl.banner}>
          <Text style={tbl.bannerOrgName}>{orgName}</Text>
          <Text style={tbl.bannerTitle}>{reportTitle}</Text>
          <Text style={tbl.bannerSubtitle}>As of {asOfDisplay}</Text>
        </View>

        <View style={tbl.table}>
          <ColumnHeader cols={cols} />
          {groupBy === "none"
            ? flatRows.map((r) => (
                <DataRow key={r.rowId} row={r} cols={cols} />
              ))
            : groups.map((g) => (
                <View key={g.groupKey} wrap={false}>
                  <View style={tbl.groupHeader}>
                    <Text>{g.groupLabel}</Text>
                  </View>
                  {g.rows.map((r) => (
                    <DataRow key={r.rowId} row={r} cols={cols} />
                  ))}
                  <SubtotalRow label={`Subtotal — ${g.groupLabel}`} amount={g.subtotal} cols={cols} />
                </View>
              ))}
          <View style={tbl.grandTotalRow}>
            <Text style={{ flex: 1, color: "#FFFFFF" }}>
              Grand Total ({flatRows.length} row{flatRows.length === 1 ? "" : "s"})
            </Text>
            <Text style={{ ...tbl.cellRight, color: "#FFFFFF", width: 90 }}>
              {fmtMoney(grandTotal)}
            </Text>
          </View>
        </View>

        <View style={tbl.footer} fixed>
          <Text>{orgName}</Text>
          <Text
            render={({ pageNumber, totalPages }) =>
              `${pageNumber} / ${totalPages}`
            }
          />
        </View>
      </Page>
    </Document>
  );
}

function ColumnHeader({ cols }: { cols: string[] }) {
  return (
    <View style={tbl.headerRow}>
      {cols.includes("date") ? (
        <Text style={{ ...tbl.cellLeft, ...tbl.wDate }}>Date</Text>
      ) : null}
      {cols.includes("dueDate") ? (
        <Text style={{ ...tbl.cellLeft, ...tbl.wDueDate }}>Due Date</Text>
      ) : null}
      {cols.includes("number") ? (
        <Text style={{ ...tbl.cellLeft, ...tbl.wNumber }}>Transaction#</Text>
      ) : null}
      {cols.includes("type") ? (
        <Text style={{ ...tbl.cellLeft, ...tbl.wType }}>Type</Text>
      ) : null}
      {cols.includes("status") ? (
        <Text style={{ ...tbl.cellLeft, ...tbl.wStatus }}>Status</Text>
      ) : null}
      {cols.includes("customerName") ? (
        <Text style={{ ...tbl.cellLeft, ...tbl.wCustomer }}>Customer Name</Text>
      ) : null}
      {cols.includes("age") ? (
        <Text style={{ ...tbl.wAge }}>Age</Text>
      ) : null}
      {cols.includes("amount") ? (
        <Text style={{ ...tbl.wAmount }}>Amount</Text>
      ) : null}
      {cols.includes("balanceDue") ? (
        <Text style={{ ...tbl.wBalance }}>Balance Due</Text>
      ) : null}
    </View>
  );
}

function DataRow({ row, cols }: { row: ArAgingDetailRow; cols: string[] }) {
  return (
    <View style={tbl.dataRow}>
      {cols.includes("date") ? (
        <Text style={{ ...tbl.cellLeft, ...tbl.wDate }}>{row.date}</Text>
      ) : null}
      {cols.includes("dueDate") ? (
        <Text style={{ ...tbl.cellLeft, ...tbl.wDueDate }}>{row.dueDate}</Text>
      ) : null}
      {cols.includes("number") ? (
        <Text style={{ ...tbl.cellLeft, ...tbl.wNumber }}>{row.number}</Text>
      ) : null}
      {cols.includes("type") ? (
        <Text style={{ ...tbl.cellLeft, ...tbl.wType }}>{row.type}</Text>
      ) : null}
      {cols.includes("status") ? (
        <Text style={{ ...tbl.cellLeft, ...tbl.wStatus }}>{row.status}</Text>
      ) : null}
      {cols.includes("customerName") ? (
        <Text style={{ ...tbl.cellLeft, ...tbl.wCustomer }}>{row.customerName}</Text>
      ) : null}
      {cols.includes("age") ? (
        <Text style={{ ...tbl.wAge }}>
          {row.age <= 0 ? "—" : `${row.age}d`}
        </Text>
      ) : null}
      {cols.includes("amount") ? (
        <Text style={{ ...tbl.wAmount }}>{fmtMoney(row.amount)}</Text>
      ) : null}
      {cols.includes("balanceDue") ? (
        <Text
          style={{
            ...tbl.wBalance,
            color: row.balanceDue < 0 ? "#047857" : palette.textPrimary,
          }}
        >
          {fmtMoney(row.balanceDue)}
        </Text>
      ) : null}
    </View>
  );
}

function SubtotalRow({
  label,
  amount,
  cols,
}: {
  label: string;
  amount: number;
  cols: string[];
}) {
  // Total number of visible columns minus the Balance Due column
  // (which we render at the right). The label spans the remaining
  // columns; if Balance Due is hidden, just span everything.
  const showsBalance = cols.includes("balanceDue");
  return (
    <View style={tbl.subtotalRow}>
      <Text style={{ flex: 1, textAlign: "right" }}>{label}</Text>
      {showsBalance ? (
        <Text style={{ width: 90, textAlign: "right" }}>{fmtMoney(amount)}</Text>
      ) : null}
    </View>
  );
}
