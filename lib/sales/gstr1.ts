/**
 * GSTR-1 JSON generator.
 *
 * GSTR-1 is the monthly Indian "outward supplies" return — the
 * supplier reports every sale invoice they raised in a given tax
 * period. The GST portal accepts a specific JSON shape (the same
 * structure the offline tool produces). This module turns a flat
 * list of invoices into that shape.
 *
 * v1 scope:
 *  - b2b   — invoices to registered customers (have a GSTIN)
 *  - b2cs  — small-value invoices to unregistered customers, grouped
 *            by (place-of-supply × rate). Threshold not enforced —
 *            real GSTR-1 splits at ₹2.5L per invoice; bumping that
 *            split into b2cl is a follow-up.
 *  - hsn   — line-level HSN/SAC summary across all invoices
 *
 * Not yet covered: b2cl, cdnr (credit/debit notes), exp (exports),
 * at (advance receipts), atadj. These exist in the schema and can
 * land in subsequent passes.
 *
 * Intra- vs. inter-state:
 *  Supplier state = first 2 chars of supplier GSTIN.
 *  Customer state = first 2 chars of customer GSTIN, OR
 *                   Contact.placeOfSupply (state code).
 *  If states match → intra-state → CGST + SGST split 50/50.
 *  If states differ → inter-state → IGST.
 *
 * All amounts are rounded to 2 decimals (GSTR-1 portal convention).
 */

export type Gstr1LineInput = {
  /** Taxable value (qty × rate − discount, pre-tax). */
  taxableValue: number;
  /** Combined GST rate as a percentage (e.g. 18 for 18%). */
  rate: number;
  /** Quantity for HSN aggregation. */
  quantity: number;
  /** Unit (UQC code or free text — used as-is). */
  unit?: string | null;
  /** HSN or SAC code; required for the hsn section. */
  hsnSacCode?: string | null;
  /** Line description (used as HSN description fallback). */
  description?: string | null;
};

export type Gstr1InvoiceInput = {
  /** Invoice number as printed (e.g. "INV-001"). */
  number: string;
  /** Invoice date. */
  date: Date;
  /** Invoice total (line subtotal + tax + adjustments, post-discount). */
  invoiceValue: number;
  /** Customer GSTIN — null/empty for unregistered (B2C). */
  customerGstin?: string | null;
  /** Customer state code (2 digits). Falls back to GSTIN prefix. */
  customerStateCode?: string | null;
  /** Reverse-charge applicable? Defaults to false. */
  reverseCharge?: boolean;
  /** Line items contributing to this invoice. */
  lines: Gstr1LineInput[];
};

export type Gstr1Period = {
  /** Supplier GSTIN — required. First 2 chars = supplier state. */
  supplierGstin: string;
  /** 1-based month (1 = January, 12 = December). */
  month: number;
  /** 4-digit year. */
  year: number;
};

/* ---------- GSTR-1 JSON output shape (matches GSTN portal) ---------- */

export type B2bItem = {
  /** 1-based sequence within the invoice. */
  num: number;
  itm_det: {
    txval: number;
    rt: number;
    iamt: number;
    camt: number;
    samt: number;
    csamt: number;
    hsn_sc?: string;
  };
};

export type B2bInvoice = {
  inum: string;
  idt: string; // DD-MM-YYYY
  val: number;
  pos: string; // 2-digit state code
  rchrg: "Y" | "N";
  inv_typ: "R" | "SEWP" | "SEWOP" | "DE";
  itms: B2bItem[];
};

export type B2bGroup = {
  ctin: string;
  inv: B2bInvoice[];
};

export type B2csRow = {
  sply_ty: "INTRA" | "INTER";
  rt: number;
  typ: "OE";
  pos: string;
  txval: number;
  iamt: number;
  camt: number;
  samt: number;
  csamt: number;
};

export type HsnRow = {
  num: number;
  hsn_sc: string;
  desc: string;
  uqc: string;
  qty: number;
  txval: number;
  iamt: number;
  camt: number;
  samt: number;
  csamt: number;
};

export type Gstr1Output = {
  gstin: string;
  fp: string; // MMYYYY
  gt: number; // gross turnover — left to caller to set if needed
  cur_gt: number; // current period turnover
  b2b: B2bGroup[];
  b2cs: B2csRow[];
  hsn: { data: HsnRow[] };
};

/* ---------- Helpers ---------- */

const round2 = (n: number) => Math.round(n * 100) / 100;

function stateCodeFromGstin(gstin?: string | null): string | null {
  if (!gstin || gstin.length < 2) return null;
  return gstin.slice(0, 2);
}

function formatDate(d: Date): string {
  // GSTR-1 portal expects DD-MM-YYYY.
  const day = String(d.getUTCDate()).padStart(2, "0");
  const month = String(d.getUTCMonth() + 1).padStart(2, "0");
  const year = d.getUTCFullYear();
  return `${day}-${month}-${year}`;
}

function fpString(month: number, year: number): string {
  return `${String(month).padStart(2, "0")}${year}`;
}

/** Per-line split of a GST amount into CGST/SGST/IGST. */
function splitGst(
  taxableValue: number,
  rate: number,
  isIntraState: boolean
): { cgst: number; sgst: number; igst: number } {
  const tax = (taxableValue * rate) / 100;
  if (isIntraState) {
    const half = round2(tax / 2);
    return { cgst: half, sgst: half, igst: 0 };
  }
  return { cgst: 0, sgst: 0, igst: round2(tax) };
}

/* ---------- Main generator ---------- */

export function generateGstr1(
  invoices: Gstr1InvoiceInput[],
  period: Gstr1Period
): Gstr1Output {
  const supplierState = stateCodeFromGstin(period.supplierGstin);
  if (!supplierState) {
    throw new Error(
      "supplierGstin must be a valid GSTIN (first 2 chars are the state code)"
    );
  }

  const b2bGroups = new Map<string, B2bInvoice[]>();
  // b2cs aggregates by (pos × rate)
  const b2csAgg = new Map<string, B2csRow>();
  // hsn aggregates by (hsn × rate × unit)
  const hsnAgg = new Map<string, HsnRow>();
  let currentPeriodTurnover = 0;

  for (const inv of invoices) {
    currentPeriodTurnover += inv.invoiceValue;

    const customerState =
      stateCodeFromGstin(inv.customerGstin) ?? inv.customerStateCode ?? null;
    const isIntraState =
      customerState !== null && customerState === supplierState;

    if (inv.customerGstin && inv.customerGstin.length === 15) {
      // ---------- B2B ----------
      const itms: B2bItem[] = inv.lines.map((line, idx) => {
        const split = splitGst(line.taxableValue, line.rate, isIntraState);
        return {
          num: idx + 1,
          itm_det: {
            txval: round2(line.taxableValue),
            rt: line.rate,
            iamt: split.igst,
            camt: split.cgst,
            samt: split.sgst,
            csamt: 0,
            ...(line.hsnSacCode ? { hsn_sc: line.hsnSacCode } : {}),
          },
        };
      });

      const b2bInv: B2bInvoice = {
        inum: inv.number,
        idt: formatDate(inv.date),
        val: round2(inv.invoiceValue),
        pos: customerState ?? supplierState,
        rchrg: inv.reverseCharge ? "Y" : "N",
        inv_typ: "R",
        itms,
      };

      const groupKey = inv.customerGstin;
      if (!b2bGroups.has(groupKey)) b2bGroups.set(groupKey, []);
      b2bGroups.get(groupKey)!.push(b2bInv);
    } else {
      // ---------- B2CS (unregistered customer) ----------
      const pos = customerState ?? supplierState;
      for (const line of inv.lines) {
        const split = splitGst(line.taxableValue, line.rate, isIntraState);
        const key = `${pos}|${line.rate}|${isIntraState ? "INTRA" : "INTER"}`;
        const existing = b2csAgg.get(key);
        if (existing) {
          existing.txval = round2(existing.txval + line.taxableValue);
          existing.iamt = round2(existing.iamt + split.igst);
          existing.camt = round2(existing.camt + split.cgst);
          existing.samt = round2(existing.samt + split.sgst);
        } else {
          b2csAgg.set(key, {
            sply_ty: isIntraState ? "INTRA" : "INTER",
            rt: line.rate,
            typ: "OE",
            pos,
            txval: round2(line.taxableValue),
            iamt: split.igst,
            camt: split.cgst,
            samt: split.sgst,
            csamt: 0,
          });
        }
      }
    }

    // ---------- HSN (aggregated regardless of B2B/B2CS) ----------
    for (const line of inv.lines) {
      const hsn = line.hsnSacCode ?? "";
      if (!hsn) continue;
      const unit = line.unit ?? "OTH";
      const split = splitGst(line.taxableValue, line.rate, isIntraState);
      const key = `${hsn}|${line.rate}|${unit}`;
      const existing = hsnAgg.get(key);
      if (existing) {
        existing.qty = round2(existing.qty + line.quantity);
        existing.txval = round2(existing.txval + line.taxableValue);
        existing.iamt = round2(existing.iamt + split.igst);
        existing.camt = round2(existing.camt + split.cgst);
        existing.samt = round2(existing.samt + split.sgst);
      } else {
        hsnAgg.set(key, {
          num: hsnAgg.size + 1,
          hsn_sc: hsn,
          desc: line.description ?? "",
          uqc: unit,
          qty: round2(line.quantity),
          txval: round2(line.taxableValue),
          iamt: split.igst,
          camt: split.cgst,
          samt: split.sgst,
          csamt: 0,
        });
      }
    }
  }

  const b2b: B2bGroup[] = Array.from(b2bGroups.entries()).map(
    ([ctin, inv]) => ({ ctin, inv })
  );

  return {
    gstin: period.supplierGstin,
    fp: fpString(period.month, period.year),
    gt: round2(currentPeriodTurnover),
    cur_gt: round2(currentPeriodTurnover),
    b2b,
    b2cs: Array.from(b2csAgg.values()),
    hsn: { data: Array.from(hsnAgg.values()) },
  };
}
