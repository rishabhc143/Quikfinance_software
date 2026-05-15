/**
 * REPORTS-PDF — Balance Sheet (4-level hierarchy flattened to PDF rows).
 */

import React from "react";
import {
  Document,
  Page,
  Text,
  View,
  renderToBuffer,
} from "@react-pdf/renderer";
import { styles, fmtMoney } from "./common";
import type {
  BalanceSheet,
  BsTopGroup,
  BsMidGroup,
  BsLeafGroup,
} from "@/lib/reports/balance-sheet";

export async function renderBalanceSheetPdf(args: {
  organizationName: string;
  asOfText: string;
  bs: BalanceSheet;
  currency: string;
}): Promise<Buffer> {
  return renderToBuffer(
    <BalanceSheetDocument
      organizationName={args.organizationName}
      asOfText={args.asOfText}
      bs={args.bs}
      currency={args.currency}
    />
  );
}

function BalanceSheetDocument({
  organizationName,
  asOfText,
  bs,
  currency,
}: {
  organizationName: string;
  asOfText: string;
  bs: BalanceSheet;
  currency: string;
}) {
  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <View style={styles.banner}>
          <Text style={styles.bannerOrgName}>{organizationName}</Text>
          <Text style={styles.bannerTitle}>Balance Sheet</Text>
          <Text style={styles.bannerSubtitle}>{`As of ${asOfText}`}</Text>
        </View>

        <View style={styles.table}>
          <TopGroup top={bs.assets} />
          <TopGroup top={bs.liabilities} />
          <MidGroup mid={bs.equities} levelIndent={0} />
          <View style={styles.rowSubtotal}>
            <Text style={styles.cellLabel}>Total for Liabilities &amp; Equities</Text>
            <Text style={styles.cellAmount}>
              {fmtMoney(bs.liabilitiesAndEquitiesTotal)}
            </Text>
          </View>
        </View>

        <View style={styles.footer} fixed>
          <Text>** Amount is in {currency}</Text>
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

function TopGroup({ top }: { top: BsTopGroup }) {
  return (
    <>
      <View style={styles.rowSection}>
        <Text style={styles.cellLabel}>{top.label}</Text>
        <Text style={styles.cellAmount}> </Text>
      </View>
      {top.groups.map((mid, i) => (
        <MidGroup key={i} mid={mid} levelIndent={1} />
      ))}
      <View style={styles.rowSubtotal}>
        <Text style={styles.cellLabel}>Total for {top.label}</Text>
        <Text style={styles.cellAmount}>{fmtMoney(top.total)}</Text>
      </View>
    </>
  );
}

function MidGroup({
  mid,
  levelIndent,
}: {
  mid: BsMidGroup;
  levelIndent: number;
}) {
  const indentStyle =
    levelIndent === 0
      ? styles.rowAccountIndent
      : levelIndent === 1
        ? styles.rowAccountIndent
        : styles.rowAccountIndent2;
  return (
    <>
      <View style={[styles.rowAccount, indentStyle, { fontFamily: "Helvetica-Bold" }]}>
        <Text style={styles.cellLabel}>{mid.label}</Text>
        <Text style={styles.cellAmount}> </Text>
      </View>
      {mid.leaves.map((leaf, i) => (
        <LeafGroup key={i} leaf={leaf} />
      ))}
      {mid.accounts.map((a) => (
        <View key={a.accountId} style={[styles.rowAccount, styles.rowAccountIndent2]}>
          <Text style={styles.cellLabel}>
            {a.accountCode ? `${a.accountCode}  ${a.accountName}` : a.accountName}
          </Text>
          <Text style={styles.cellAmount}>{fmtMoney(a.amount)}</Text>
        </View>
      ))}
      <View style={[styles.rowSubtotal, indentStyle]}>
        <Text style={styles.cellLabel}>Total for {mid.label}</Text>
        <Text style={styles.cellAmount}>{fmtMoney(mid.total)}</Text>
      </View>
    </>
  );
}

function LeafGroup({ leaf }: { leaf: BsLeafGroup }) {
  return (
    <>
      <View style={[styles.rowAccount, styles.rowAccountIndent2, { fontFamily: "Helvetica-Bold" }]}>
        <Text style={styles.cellLabel}>{leaf.label}</Text>
        <Text style={styles.cellAmount}> </Text>
      </View>
      {leaf.accounts.map((a) => (
        <View
          key={a.accountId}
          style={[styles.rowAccount, styles.rowAccountIndent2, { paddingLeft: 64 }]}
        >
          <Text style={styles.cellLabel}>
            {a.accountCode ? `${a.accountCode}  ${a.accountName}` : a.accountName}
          </Text>
          <Text style={styles.cellAmount}>{fmtMoney(a.amount)}</Text>
        </View>
      ))}
      <View
        style={[
          styles.rowAccount,
          styles.rowAccountIndent2,
          { fontFamily: "Helvetica-Bold" },
        ]}
      >
        <Text style={styles.cellLabel}>Total for {leaf.label}</Text>
        <Text style={styles.cellAmount}>{fmtMoney(leaf.total)}</Text>
      </View>
    </>
  );
}
