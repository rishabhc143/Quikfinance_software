/**
 * Projects export PDF — reusable React-PDF component.
 *
 * Mirrors the look of `scripts/generate-projects-export-sample.mjs` but
 * accepts dynamic data so the `/time/projects/export?format=pdf` route
 * can serve real projects.
 *
 * Caller supplies already-formatted strings (e.g. budget amounts pre-
 * formatted to US/EU decimals + currency symbol) so we don't have to
 * carry locale state into the PDF tree.
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

export type ProjectsPdfRow = {
  name: string;
  code: string;
  customer: string; // empty string when PII excluded
  status: string;
  billingMethod: string;
  description: string; // empty string when PII excluded
  costBudget: string; // pre-formatted, e.g. "₹1,50,000.00"
  revenueBudget: string;
  startDate: string;
  endDate: string;
};

export type ProjectsPdfOptions = {
  rows: ProjectsPdfRow[];
  includePii: boolean;
  /** Free-text shown in the header strip, e.g. "All Projects · INR · Generated 20 May 2026". */
  metaLine: string;
  /** Pre-formatted summary metrics rendered as four boxes. */
  summary: {
    totalProjects: number;
    activeProjects: number;
    totalCostBudget: string;
    totalRevenueBudget: string;
  };
};

const styles = StyleSheet.create({
  page: {
    fontFamily: "Helvetica",
    fontSize: 9,
    padding: 36,
    color: "#0f172a",
  },
  // Header band
  headerBand: {
    borderBottom: "2pt solid #2563eb",
    paddingBottom: 12,
    marginBottom: 16,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-end",
  },
  brand: {
    fontSize: 18,
    fontWeight: 700,
    color: "#1e3a8a",
  },
  brandSub: {
    fontSize: 8,
    color: "#64748b",
    marginTop: 2,
  },
  reportTitleBlock: {
    alignItems: "flex-end",
  },
  reportTitle: {
    fontSize: 14,
    fontWeight: 700,
    color: "#0f172a",
  },
  reportMeta: {
    fontSize: 8,
    color: "#64748b",
    marginTop: 2,
  },

  // Summary strip
  summaryRow: {
    flexDirection: "row",
    gap: 12,
    marginBottom: 16,
  },
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

  // Table
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
  tableRowAlt: {
    backgroundColor: "#f8fafc",
  },
  tableCell: {
    padding: 6,
    borderRight: "1pt solid #e2e8f0",
    color: "#0f172a",
  },
  numericCell: {
    textAlign: "right",
  },

  // Status pill
  statusPill: {
    fontSize: 7,
    padding: 2,
    borderRadius: 2,
    textAlign: "center",
  },
  statusActive: {
    backgroundColor: "#dcfce7",
    color: "#166534",
  },
  statusCompleted: {
    backgroundColor: "#dbeafe",
    color: "#1e40af",
  },
  statusOnHold: {
    backgroundColor: "#fef3c7",
    color: "#92400e",
  },
  statusOther: {
    backgroundColor: "#f1f5f9",
    color: "#475569",
  },

  // Footer
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

  // Empty-state
  emptyBlock: {
    padding: 24,
    textAlign: "center",
    color: "#94a3b8",
    fontSize: 10,
    border: "1pt dashed #cbd5e1",
    borderRadius: 4,
  },
});

function statusStyle(status: string) {
  if (status === "active") return styles.statusActive;
  if (status === "completed") return styles.statusCompleted;
  if (status === "on_hold") return styles.statusOnHold;
  return styles.statusOther;
}

function statusLabel(s: string) {
  return s
    .split("_")
    .map((w) => (w ? w[0].toUpperCase() + w.slice(1) : ""))
    .join(" ");
}

// Column widths sum to the landscape Letter content width
// (~720pt: 792pt page width - 2 * 36pt margins).
// PII on vs off changes which columns are shown.
function colWidths(includePii: boolean) {
  if (includePii) {
    return {
      name: 95,
      code: 55,
      customer: 85,
      status: 50,
      billingMethod: 70,
      description: 130,
      costBudget: 65,
      revenueBudget: 70,
      startDate: 50,
      endDate: 50,
    };
  }
  // PII off — no customer / description columns; redistribute width.
  return {
    name: 140,
    code: 70,
    customer: 0,
    status: 70,
    billingMethod: 90,
    description: 0,
    costBudget: 90,
    revenueBudget: 95,
    startDate: 80,
    endDate: 85,
  };
}

function ProjectsPdfDoc({ rows, includePii, metaLine, summary }: ProjectsPdfOptions) {
  const widths = colWidths(includePii);
  return (
    <Document
      title="Projects Export"
      author="Quikfinance"
      creator="Quikfinance"
      producer="Quikfinance"
    >
      <Page size="LETTER" orientation="landscape" style={styles.page}>
        {/* Header band */}
        <View style={styles.headerBand}>
          <View>
            <Text style={styles.brand}>Quikfinance</Text>
            <Text style={styles.brandSub}>Time Tracking • Projects</Text>
          </View>
          <View style={styles.reportTitleBlock}>
            <Text style={styles.reportTitle}>Projects Export</Text>
            <Text style={styles.reportMeta}>{metaLine}</Text>
          </View>
        </View>

        {/* Summary strip */}
        <View style={styles.summaryRow}>
          <View style={styles.summaryBox}>
            <Text style={styles.summaryLabel}>Total Projects</Text>
            <Text style={styles.summaryValue}>{String(summary.totalProjects)}</Text>
          </View>
          <View style={styles.summaryBox}>
            <Text style={styles.summaryLabel}>Active</Text>
            <Text style={styles.summaryValue}>{String(summary.activeProjects)}</Text>
          </View>
          <View style={styles.summaryBox}>
            <Text style={styles.summaryLabel}>Total Cost Budget</Text>
            <Text style={styles.summaryValue}>{summary.totalCostBudget}</Text>
          </View>
          <View style={styles.summaryBox}>
            <Text style={styles.summaryLabel}>Total Revenue Budget</Text>
            <Text style={styles.summaryValue}>{summary.totalRevenueBudget}</Text>
          </View>
        </View>

        {/* Empty state */}
        {rows.length === 0 ? (
          <View style={styles.emptyBlock}>
            <Text>No projects match the current filter.</Text>
          </View>
        ) : (
          <View style={styles.table}>
            {/* Head */}
            <View style={styles.tableHead}>
              <Text style={[styles.tableHeadCell, { width: widths.name }]}>
                Project Name
              </Text>
              <Text style={[styles.tableHeadCell, { width: widths.code }]}>Code</Text>
              {includePii && (
                <Text style={[styles.tableHeadCell, { width: widths.customer }]}>
                  Customer
                </Text>
              )}
              <Text style={[styles.tableHeadCell, { width: widths.status }]}>
                Status
              </Text>
              <Text style={[styles.tableHeadCell, { width: widths.billingMethod }]}>
                Billing
              </Text>
              {includePii && (
                <Text style={[styles.tableHeadCell, { width: widths.description }]}>
                  Description
                </Text>
              )}
              <Text
                style={[
                  styles.tableHeadCell,
                  styles.numericCell,
                  { width: widths.costBudget },
                ]}
              >
                Cost
              </Text>
              <Text
                style={[
                  styles.tableHeadCell,
                  styles.numericCell,
                  { width: widths.revenueBudget },
                ]}
              >
                Revenue
              </Text>
              <Text style={[styles.tableHeadCell, { width: widths.startDate }]}>
                Start
              </Text>
              <Text
                style={[
                  styles.tableHeadCell,
                  { width: widths.endDate, borderRight: 0 },
                ]}
              >
                End
              </Text>
            </View>

            {/* Rows */}
            {rows.map((p, i) => (
              <View
                key={i}
                style={[
                  styles.tableRow,
                  ...(i % 2 === 1 ? [styles.tableRowAlt] : []),
                ]}
                wrap={false}
              >
                <Text style={[styles.tableCell, { width: widths.name, fontWeight: 700 }]}>
                  {p.name}
                </Text>
                <Text style={[styles.tableCell, { width: widths.code }]}>{p.code}</Text>
                {includePii && (
                  <Text style={[styles.tableCell, { width: widths.customer }]}>
                    {p.customer}
                  </Text>
                )}
                <View style={[styles.tableCell, { width: widths.status }]}>
                  <Text style={[styles.statusPill, statusStyle(p.status)]}>
                    {statusLabel(p.status)}
                  </Text>
                </View>
                <Text style={[styles.tableCell, { width: widths.billingMethod }]}>
                  {p.billingMethod}
                </Text>
                {includePii && (
                  <Text style={[styles.tableCell, { width: widths.description }]}>
                    {p.description}
                  </Text>
                )}
                <Text
                  style={[
                    styles.tableCell,
                    styles.numericCell,
                    { width: widths.costBudget },
                  ]}
                >
                  {p.costBudget}
                </Text>
                <Text
                  style={[
                    styles.tableCell,
                    styles.numericCell,
                    { width: widths.revenueBudget },
                  ]}
                >
                  {p.revenueBudget}
                </Text>
                <Text style={[styles.tableCell, { width: widths.startDate }]}>
                  {p.startDate}
                </Text>
                <Text
                  style={[
                    styles.tableCell,
                    { width: widths.endDate, borderRight: 0 },
                  ]}
                >
                  {p.endDate}
                </Text>
              </View>
            ))}
          </View>
        )}

        {/* Footer with page numbers */}
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

/**
 * Build a .pdf Buffer for the given rows. Mirrors `toXlsx()` in
 * `lib/reports/xlsx-export.ts`.
 */
export async function buildProjectsPdf(opts: ProjectsPdfOptions): Promise<Buffer> {
  return await renderToBuffer(<ProjectsPdfDoc {...opts} />);
}

/**
 * Wrap a PDF buffer in a Next.js Response with the right download
 * headers. `filename` should NOT include the `.pdf` extension — we add it.
 */
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
