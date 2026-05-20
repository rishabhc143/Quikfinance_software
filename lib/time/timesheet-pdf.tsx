/**
 * Timesheet export PDF — reusable React-PDF component.
 *
 * Mirrors `lib/time/projects-pdf.tsx` look-and-feel (blue brand band,
 * 4-card summary strip, dark-blue header row, zebra rows, page-numbered
 * footer) but with Timesheet-specific columns and summary metrics.
 *
 * Caller passes already-formatted strings so we don't carry locale or
 * currency state into the PDF tree.
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

export type TimesheetPdfRow = {
  date: string;
  project: string;
  task: string;
  user: string; // empty string when PII excluded
  notes: string;
  hours: string; // pre-formatted, e.g. "1.50"
  billable: boolean;
  billed: boolean;
};

export type TimesheetPdfOptions = {
  rows: TimesheetPdfRow[];
  includePii: boolean;
  metaLine: string;
  summary: {
    totalEntries: number;
    totalHours: string;
    billableHours: string;
    unbilledHours: string;
  };
};

const styles = StyleSheet.create({
  page: {
    fontFamily: "Helvetica",
    fontSize: 9,
    padding: 36,
    color: "#0f172a",
  },
  headerBand: {
    borderBottom: "2pt solid #2563eb",
    paddingBottom: 12,
    marginBottom: 16,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-end",
  },
  brand: { fontSize: 18, fontWeight: 700, color: "#1e3a8a" },
  brandSub: { fontSize: 8, color: "#64748b", marginTop: 2 },
  reportTitleBlock: { alignItems: "flex-end" },
  reportTitle: { fontSize: 14, fontWeight: 700, color: "#0f172a" },
  reportMeta: { fontSize: 8, color: "#64748b", marginTop: 2 },

  summaryRow: { flexDirection: "row", gap: 12, marginBottom: 16 },
  summaryBox: {
    flex: 1,
    backgroundColor: "#f1f5f9",
    borderRadius: 4,
    padding: 8,
  },
  summaryLabel: {
    fontSize: 7,
    color: "#64748b",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  summaryValue: {
    fontSize: 13,
    fontWeight: 700,
    color: "#0f172a",
    marginTop: 2,
  },

  table: {
    borderTop: "1pt solid #cbd5e1",
    borderLeft: "1pt solid #cbd5e1",
    borderRight: "1pt solid #cbd5e1",
  },
  tableHead: {
    flexDirection: "row",
    backgroundColor: "#1e3a8a",
    color: "#ffffff",
    fontSize: 8,
    fontWeight: 700,
  },
  tableHeadCell: {
    padding: 6,
    borderRight: "1pt solid #1e40af",
    color: "#ffffff",
  },
  tableRow: {
    flexDirection: "row",
    fontSize: 8,
    borderBottom: "1pt solid #e2e8f0",
  },
  tableRowAlt: { backgroundColor: "#f8fafc" },
  tableCell: {
    padding: 6,
    borderRight: "1pt solid #e2e8f0",
    color: "#0f172a",
  },
  numericCell: { textAlign: "right" },

  flagPill: {
    fontSize: 7,
    padding: 2,
    borderRadius: 2,
    textAlign: "center",
  },
  flagYes: { backgroundColor: "#dcfce7", color: "#166534" },
  flagNo: { backgroundColor: "#f1f5f9", color: "#475569" },
  flagBilled: { backgroundColor: "#dbeafe", color: "#1e40af" },

  footer: {
    position: "absolute",
    bottom: 18,
    left: 36,
    right: 36,
    fontSize: 7,
    color: "#64748b",
    flexDirection: "row",
    justifyContent: "space-between",
    borderTop: "0.5pt solid #cbd5e1",
    paddingTop: 6,
  },

  emptyBlock: {
    padding: 24,
    textAlign: "center",
    color: "#94a3b8",
    fontSize: 10,
    border: "1pt dashed #cbd5e1",
    borderRadius: 4,
  },
});

// Column widths sum to ~720pt (landscape Letter content area).
function colWidths(includePii: boolean) {
  if (includePii) {
    return {
      date: 70,
      project: 100,
      task: 90,
      user: 90,
      notes: 165,
      hours: 55,
      billable: 50,
      billed: 50,
    };
  }
  // PII off — drops User + Notes columns; redistribute width.
  return {
    date: 90,
    project: 165,
    task: 145,
    user: 0,
    notes: 0,
    hours: 95,
    billable: 90,
    billed: 95,
  };
}

function TimesheetPdfDoc({
  rows,
  includePii,
  metaLine,
  summary,
}: TimesheetPdfOptions) {
  const widths = colWidths(includePii);
  return (
    <Document
      title="Timesheet Export"
      author="Quikfinance"
      creator="Quikfinance"
      producer="Quikfinance"
    >
      <Page size="LETTER" orientation="landscape" style={styles.page}>
        <View style={styles.headerBand}>
          <View>
            <Text style={styles.brand}>Quikfinance</Text>
            <Text style={styles.brandSub}>Time Tracking • Timesheet</Text>
          </View>
          <View style={styles.reportTitleBlock}>
            <Text style={styles.reportTitle}>Timesheet Export</Text>
            <Text style={styles.reportMeta}>{metaLine}</Text>
          </View>
        </View>

        <View style={styles.summaryRow}>
          <View style={styles.summaryBox}>
            <Text style={styles.summaryLabel}>Total Entries</Text>
            <Text style={styles.summaryValue}>
              {String(summary.totalEntries)}
            </Text>
          </View>
          <View style={styles.summaryBox}>
            <Text style={styles.summaryLabel}>Total Hours</Text>
            <Text style={styles.summaryValue}>{summary.totalHours}</Text>
          </View>
          <View style={styles.summaryBox}>
            <Text style={styles.summaryLabel}>Billable Hours</Text>
            <Text style={styles.summaryValue}>{summary.billableHours}</Text>
          </View>
          <View style={styles.summaryBox}>
            <Text style={styles.summaryLabel}>Unbilled Hours</Text>
            <Text style={styles.summaryValue}>{summary.unbilledHours}</Text>
          </View>
        </View>

        {rows.length === 0 ? (
          <View style={styles.emptyBlock}>
            <Text>No time entries match the current filter.</Text>
          </View>
        ) : (
          <View style={styles.table}>
            <View style={styles.tableHead}>
              <Text style={[styles.tableHeadCell, { width: widths.date }]}>
                Date
              </Text>
              <Text style={[styles.tableHeadCell, { width: widths.project }]}>
                Project
              </Text>
              <Text style={[styles.tableHeadCell, { width: widths.task }]}>
                Task
              </Text>
              {includePii && (
                <Text style={[styles.tableHeadCell, { width: widths.user }]}>
                  User
                </Text>
              )}
              {includePii && (
                <Text style={[styles.tableHeadCell, { width: widths.notes }]}>
                  Notes
                </Text>
              )}
              <Text
                style={[
                  styles.tableHeadCell,
                  styles.numericCell,
                  { width: widths.hours },
                ]}
              >
                Hours
              </Text>
              <Text style={[styles.tableHeadCell, { width: widths.billable }]}>
                Billable
              </Text>
              <Text
                style={[
                  styles.tableHeadCell,
                  { width: widths.billed, borderRight: 0 },
                ]}
              >
                Billed
              </Text>
            </View>

            {rows.map((e, i) => (
              <View
                key={i}
                style={[
                  styles.tableRow,
                  ...(i % 2 === 1 ? [styles.tableRowAlt] : []),
                ]}
                wrap={false}
              >
                <Text style={[styles.tableCell, { width: widths.date }]}>
                  {e.date}
                </Text>
                <Text
                  style={[
                    styles.tableCell,
                    { width: widths.project, fontWeight: 700 },
                  ]}
                >
                  {e.project}
                </Text>
                <Text style={[styles.tableCell, { width: widths.task }]}>
                  {e.task}
                </Text>
                {includePii && (
                  <Text style={[styles.tableCell, { width: widths.user }]}>
                    {e.user}
                  </Text>
                )}
                {includePii && (
                  <Text style={[styles.tableCell, { width: widths.notes }]}>
                    {e.notes}
                  </Text>
                )}
                <Text
                  style={[
                    styles.tableCell,
                    styles.numericCell,
                    { width: widths.hours },
                  ]}
                >
                  {e.hours}
                </Text>
                <View
                  style={[styles.tableCell, { width: widths.billable }]}
                >
                  <Text
                    style={[
                      styles.flagPill,
                      e.billable ? styles.flagYes : styles.flagNo,
                    ]}
                  >
                    {e.billable ? "Yes" : "No"}
                  </Text>
                </View>
                <View
                  style={[
                    styles.tableCell,
                    { width: widths.billed, borderRight: 0 },
                  ]}
                >
                  <Text
                    style={[
                      styles.flagPill,
                      e.billed ? styles.flagBilled : styles.flagNo,
                    ]}
                  >
                    {e.billed ? "Billed" : "Unbilled"}
                  </Text>
                </View>
              </View>
            ))}
          </View>
        )}

        <View style={styles.footer} fixed>
          <Text>Generated by Quikfinance • support@quikfinance.app</Text>
          <Text
            render={({ pageNumber, totalPages }) =>
              `Page ${pageNumber} of ${totalPages}`
            }
          />
        </View>
      </Page>
    </Document>
  );
}

export async function buildTimesheetPdf(
  opts: TimesheetPdfOptions
): Promise<Buffer> {
  return await renderToBuffer(<TimesheetPdfDoc {...opts} />);
}

export function pdfResponse(filename: string, buf: Buffer): Response {
  const safe = filename.replace(/[^A-Za-z0-9._-]/g, "_");
  return new Response(buf as unknown as BodyInit, {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${safe}.pdf"`,
      "Cache-Control": "no-store",
    },
  });
}
