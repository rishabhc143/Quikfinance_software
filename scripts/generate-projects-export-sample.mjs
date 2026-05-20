/**
 * One-off generator for a populated sample Projects CSV + a matching
 * professional PDF report. Run with:
 *
 *   pnpm tsx scripts/generate-projects-export-sample.mjs
 *
 * Outputs are written to the current user's Downloads folder so the
 * user can compare them against an actual /time/projects/export
 * download.
 */
import path from "node:path";
import os from "node:os";
import fs from "node:fs/promises";
import React from "react";
import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
  renderToBuffer,
} from "@react-pdf/renderer";

// ── Dummy data ───────────────────────────────────────────────────────────
const today = new Date();
const ymd = (d) => d.toISOString().slice(0, 10);

const PROJECTS = [
  {
    name: "Acme Q3 Redesign",
    code: "ACME-Q3",
    customer: "Acme Holdings",
    status: "active",
    billingMethod: "Based on Project Hours",
    description: "Quarterly UI refresh + microcopy polish",
    costBudget: 150000,
    revenueBudget: 400000,
    startDate: "2026-04-01",
    endDate: "2026-06-30",
    createdAt: "2026-03-25",
  },
  {
    name: "Demo Co Mobile App",
    code: "DEMO-MOB",
    customer: "Demo Co",
    status: "active",
    billingMethod: "Based on Task Hours",
    description: "iOS + Android rewrite for B2B portal",
    costBudget: 250000,
    revenueBudget: 600000,
    startDate: "2026-05-01",
    endDate: "2026-09-30",
    createdAt: "2026-04-20",
  },
  {
    name: "Internal Analytics Dashboard",
    code: "INT-DASH",
    customer: "Demo Co",
    status: "active",
    billingMethod: "Fixed Cost for Project",
    description: "Build management-facing analytics dashboard",
    costBudget: 80000,
    revenueBudget: 150000,
    startDate: "2026-05-10",
    endDate: "2026-07-15",
    createdAt: "2026-05-05",
  },
  {
    name: "Globex GST Compliance",
    code: "GLOBEX-GST",
    customer: "Globex Industries",
    status: "active",
    billingMethod: "Based on Staff Hours",
    description: "Full GST audit + e-invoicing rollout",
    costBudget: 320000,
    revenueBudget: 800000,
    startDate: "2026-02-01",
    endDate: "2026-08-31",
    createdAt: "2026-01-20",
  },
  {
    name: "Initech Payroll Migration",
    code: "INIT-PAY",
    customer: "Initech",
    status: "completed",
    billingMethod: "Fixed Cost for Project",
    description: "Migration from legacy payroll system",
    costBudget: 120000,
    revenueBudget: 250000,
    startDate: "2025-11-01",
    endDate: "2026-03-31",
    createdAt: "2025-10-15",
  },
  {
    name: "Stark Industries Website",
    code: "STARK-WEB",
    customer: "Stark Industries",
    status: "active",
    billingMethod: "Based on Project Hours",
    description: "Marketing site rebuild with case-study CMS",
    costBudget: 95000,
    revenueBudget: 220000,
    startDate: "2026-04-15",
    endDate: "2026-07-30",
    createdAt: "2026-04-01",
  },
  {
    name: "Wayne Enterprises Audit",
    code: "WAYNE-AUD",
    customer: "Wayne Enterprises",
    status: "on_hold",
    billingMethod: "Based on Staff Hours",
    description: "Mid-year financial audit",
    costBudget: 180000,
    revenueBudget: 420000,
    startDate: "2026-06-01",
    endDate: "2026-08-15",
    createdAt: "2026-05-15",
  },
  {
    name: "Pied Piper Data Migration",
    code: "PP-MIG",
    customer: "Pied Piper",
    status: "active",
    billingMethod: "Based on Task Hours",
    description: "Move from on-prem to cloud warehouse",
    costBudget: 220000,
    revenueBudget: 550000,
    startDate: "2026-03-15",
    endDate: "2026-10-31",
    createdAt: "2026-02-20",
  },
  {
    name: "Hooli Brand Refresh",
    code: "HOOLI-BR",
    customer: "Hooli",
    status: "completed",
    billingMethod: "Fixed Cost for Project",
    description: "Logo + brand guideline overhaul",
    costBudget: 65000,
    revenueBudget: 140000,
    startDate: "2026-01-15",
    endDate: "2026-03-30",
    createdAt: "2026-01-05",
  },
  {
    name: "Vandelay International Setup",
    code: "VAND-SET",
    customer: "Vandelay International",
    status: "active",
    billingMethod: "Based on Project Hours",
    description: "ERP setup + first-year support",
    costBudget: 340000,
    revenueBudget: 900000,
    startDate: "2026-05-20",
    endDate: "2027-05-19",
    createdAt: "2026-05-10",
  },
];

const downloadsDir = path.join(os.homedir(), "Downloads");
await fs.mkdir(downloadsDir, { recursive: true });

// ── 1. Build CSV ─────────────────────────────────────────────────────────
function csvEscape(s) {
  if (s === null || s === undefined) return "";
  const str = String(s);
  if (/[",\r\n]/.test(str)) return `"${str.replace(/"/g, '""')}"`;
  return str;
}

const csvCols = [
  "Project Name",
  "Project Code",
  "Customer Name",
  "Status",
  "Billing Method",
  "Description",
  "Cost Budget",
  "Revenue Budget",
  "Start Date",
  "End Date",
  "Created At",
];

const csvLines = [csvCols.map(csvEscape).join(",")];
for (const p of PROJECTS) {
  csvLines.push(
    [
      p.name,
      p.code,
      p.customer,
      p.status,
      p.billingMethod,
      p.description,
      p.costBudget.toFixed(2),
      p.revenueBudget.toFixed(2),
      p.startDate,
      p.endDate,
      p.createdAt,
    ]
      .map(csvEscape)
      .join(",")
  );
}

const csvPath = path.join(
  downloadsDir,
  `projects-${ymd(today).replace(/-/g, "")}-sample.csv`
);
await fs.writeFile(csvPath, csvLines.join("\r\n"), "utf-8");

// ── 2. Build PDF ─────────────────────────────────────────────────────────
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
});

// Column widths sum to ~520pt (Letter content width is ~540 with 36pt margins).
const COL_WIDTHS = {
  name: 90,
  code: 50,
  customer: 80,
  status: 50,
  billingMethod: 70,
  description: 110,
  costBudget: 55,
  revenueBudget: 60,
  startDate: 55,
  endDate: 55,
};

function fmtINR(n) {
  // Indian thousands grouping (1,23,45,678.00)
  const fixed = Math.abs(n).toFixed(2);
  const [whole, frac] = fixed.split(".");
  let result;
  if (whole.length > 3) {
    const last3 = whole.slice(-3);
    const rest = whole.slice(0, -3);
    const restGrouped = rest.replace(/\B(?=(\d{2})+(?!\d))/g, ",");
    result = `${restGrouped},${last3}.${frac}`;
  } else {
    result = `${whole}.${frac}`;
  }
  return `₹${result}`;
}

function statusStyle(status) {
  if (status === "active") return styles.statusActive;
  if (status === "completed") return styles.statusCompleted;
  if (status === "on_hold") return styles.statusOnHold;
  return styles.statusOther;
}

function statusLabel(s) {
  return s
    .split("_")
    .map((w) => w[0].toUpperCase() + w.slice(1))
    .join(" ");
}

const totalCost = PROJECTS.reduce((s, p) => s + p.costBudget, 0);
const totalRevenue = PROJECTS.reduce((s, p) => s + p.revenueBudget, 0);
const activeCount = PROJECTS.filter((p) => p.status === "active").length;

function PdfDoc() {
  return React.createElement(
    Document,
    {
      title: "Projects Export",
      author: "Quikfinance",
      creator: "Quikfinance",
      producer: "Quikfinance",
    },
    React.createElement(
      Page,
      { size: "LETTER", orientation: "landscape", style: styles.page },

      // Header band
      React.createElement(
        View,
        { style: styles.headerBand },
        React.createElement(
          View,
          null,
          React.createElement(Text, { style: styles.brand }, "Quikfinance"),
          React.createElement(
            Text,
            { style: styles.brandSub },
            "Time Tracking • Projects"
          )
        ),
        React.createElement(
          View,
          { style: styles.reportTitleBlock },
          React.createElement(
            Text,
            { style: styles.reportTitle },
            "Projects Export"
          ),
          React.createElement(
            Text,
            { style: styles.reportMeta },
            `Generated on ${ymd(today)} • All Projects • Indian Rupee (INR)`
          )
        )
      ),

      // Summary strip
      React.createElement(
        View,
        { style: styles.summaryRow },
        React.createElement(
          View,
          { style: styles.summaryBox },
          React.createElement(
            Text,
            { style: styles.summaryLabel },
            "Total Projects"
          ),
          React.createElement(
            Text,
            { style: styles.summaryValue },
            String(PROJECTS.length)
          )
        ),
        React.createElement(
          View,
          { style: styles.summaryBox },
          React.createElement(
            Text,
            { style: styles.summaryLabel },
            "Active"
          ),
          React.createElement(
            Text,
            { style: styles.summaryValue },
            String(activeCount)
          )
        ),
        React.createElement(
          View,
          { style: styles.summaryBox },
          React.createElement(
            Text,
            { style: styles.summaryLabel },
            "Total Cost Budget"
          ),
          React.createElement(
            Text,
            { style: styles.summaryValue },
            fmtINR(totalCost)
          )
        ),
        React.createElement(
          View,
          { style: styles.summaryBox },
          React.createElement(
            Text,
            { style: styles.summaryLabel },
            "Total Revenue Budget"
          ),
          React.createElement(
            Text,
            { style: styles.summaryValue },
            fmtINR(totalRevenue)
          )
        )
      ),

      // Table
      React.createElement(
        View,
        { style: styles.table },
        // Head
        React.createElement(
          View,
          { style: styles.tableHead },
          React.createElement(
            Text,
            { style: [styles.tableHeadCell, { width: COL_WIDTHS.name }] },
            "Project Name"
          ),
          React.createElement(
            Text,
            { style: [styles.tableHeadCell, { width: COL_WIDTHS.code }] },
            "Code"
          ),
          React.createElement(
            Text,
            { style: [styles.tableHeadCell, { width: COL_WIDTHS.customer }] },
            "Customer"
          ),
          React.createElement(
            Text,
            { style: [styles.tableHeadCell, { width: COL_WIDTHS.status }] },
            "Status"
          ),
          React.createElement(
            Text,
            { style: [styles.tableHeadCell, { width: COL_WIDTHS.billingMethod }] },
            "Billing"
          ),
          React.createElement(
            Text,
            { style: [styles.tableHeadCell, { width: COL_WIDTHS.description }] },
            "Description"
          ),
          React.createElement(
            Text,
            {
              style: [
                styles.tableHeadCell,
                styles.numericCell,
                { width: COL_WIDTHS.costBudget },
              ],
            },
            "Cost"
          ),
          React.createElement(
            Text,
            {
              style: [
                styles.tableHeadCell,
                styles.numericCell,
                { width: COL_WIDTHS.revenueBudget },
              ],
            },
            "Revenue"
          ),
          React.createElement(
            Text,
            { style: [styles.tableHeadCell, { width: COL_WIDTHS.startDate }] },
            "Start"
          ),
          React.createElement(
            Text,
            { style: [styles.tableHeadCell, { width: COL_WIDTHS.endDate, borderRight: 0 }] },
            "End"
          )
        ),
        // Rows
        ...PROJECTS.map((p, i) =>
          React.createElement(
            View,
            {
              key: i,
              style: [styles.tableRow, i % 2 === 1 ? styles.tableRowAlt : null].filter(Boolean),
            },
            React.createElement(
              Text,
              { style: [styles.tableCell, { width: COL_WIDTHS.name, fontWeight: 700 }] },
              p.name
            ),
            React.createElement(
              Text,
              { style: [styles.tableCell, { width: COL_WIDTHS.code }] },
              p.code
            ),
            React.createElement(
              Text,
              { style: [styles.tableCell, { width: COL_WIDTHS.customer }] },
              p.customer
            ),
            React.createElement(
              View,
              { style: [styles.tableCell, { width: COL_WIDTHS.status }] },
              React.createElement(
                Text,
                { style: [styles.statusPill, statusStyle(p.status)] },
                statusLabel(p.status)
              )
            ),
            React.createElement(
              Text,
              { style: [styles.tableCell, { width: COL_WIDTHS.billingMethod }] },
              p.billingMethod
            ),
            React.createElement(
              Text,
              { style: [styles.tableCell, { width: COL_WIDTHS.description }] },
              p.description
            ),
            React.createElement(
              Text,
              {
                style: [
                  styles.tableCell,
                  styles.numericCell,
                  { width: COL_WIDTHS.costBudget },
                ],
              },
              fmtINR(p.costBudget)
            ),
            React.createElement(
              Text,
              {
                style: [
                  styles.tableCell,
                  styles.numericCell,
                  { width: COL_WIDTHS.revenueBudget },
                ],
              },
              fmtINR(p.revenueBudget)
            ),
            React.createElement(
              Text,
              { style: [styles.tableCell, { width: COL_WIDTHS.startDate }] },
              p.startDate
            ),
            React.createElement(
              Text,
              {
                style: [
                  styles.tableCell,
                  { width: COL_WIDTHS.endDate, borderRight: 0 },
                ],
              },
              p.endDate
            )
          )
        )
      ),

      // Footer with page numbers
      React.createElement(
        View,
        { style: styles.footer, fixed: true },
        React.createElement(
          Text,
          null,
          "Generated by Quikfinance • support@quikfinance.app"
        ),
        React.createElement(Text, {
          render: ({ pageNumber, totalPages }) =>
            `Page ${pageNumber} of ${totalPages}`,
        })
      )
    )
  );
}

const buf = await renderToBuffer(React.createElement(PdfDoc));
const pdfPath = path.join(
  downloadsDir,
  `projects-${ymd(today).replace(/-/g, "")}-sample.pdf`
);
await fs.writeFile(pdfPath, buf);

console.log("");
console.log("✓ CSV written:");
console.log("    " + csvPath);
console.log("");
console.log("✓ PDF written:");
console.log("    " + pdfPath);
console.log("");
console.log(`Rows: ${PROJECTS.length} projects · Total cost budget: ${fmtINR(totalCost)} · Total revenue budget: ${fmtINR(totalRevenue)}`);
