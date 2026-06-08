import "server-only";

/**
 * AD-v2 — GSTIN/state mismatch detector.
 *
 * Fires when a Contact's GSTIN encodes a state code that doesn't
 * match the Contact's declared placeOfSupply / stateCode.
 *
 * Why this matters in India:
 *   - GSTIN format is `<state code (2 digits)><PAN (10 chars)>
 *     <entity code (1 digit)><Z><checksum>`. The first 2 digits
 *     are the registered state.
 *   - Wrong state mapping → wrong IGST/CGST/SGST split on invoices
 *     → GST notices, audit findings, potential penalties.
 *   - Common cause: customer onboarded from old data where state
 *     was guessed from address; GSTIN added later but state not
 *     re-derived.
 *
 * Severity: ALWAYS medium. A mismatch is a data hygiene issue
 * worth flagging but not an emergency.
 *
 * Indian state codes per GST registration (first 2 digits of
 * GSTIN). Sourced from CBIC GST registration master list.
 */

import { db } from "@/lib/db";
import type { DetectedAnomaly, DetectorFn } from "../types";
import { fpKey } from "../util";

const GSTIN_STATE_CODES: Record<string, string> = {
  "01": "Jammu and Kashmir",
  "02": "Himachal Pradesh",
  "03": "Punjab",
  "04": "Chandigarh",
  "05": "Uttarakhand",
  "06": "Haryana",
  "07": "Delhi",
  "08": "Rajasthan",
  "09": "Uttar Pradesh",
  "10": "Bihar",
  "11": "Sikkim",
  "12": "Arunachal Pradesh",
  "13": "Nagaland",
  "14": "Manipur",
  "15": "Mizoram",
  "16": "Tripura",
  "17": "Meghalaya",
  "18": "Assam",
  "19": "West Bengal",
  "20": "Jharkhand",
  "21": "Odisha",
  "22": "Chhattisgarh",
  "23": "Madhya Pradesh",
  "24": "Gujarat",
  "26": "Dadra and Nagar Haveli and Daman and Diu",
  "27": "Maharashtra",
  "28": "Andhra Pradesh (Pre-2014)",
  "29": "Karnataka",
  "30": "Goa",
  "31": "Lakshadweep",
  "32": "Kerala",
  "33": "Tamil Nadu",
  "34": "Puducherry",
  "35": "Andaman and Nicobar Islands",
  "36": "Telangana",
  "37": "Andhra Pradesh",
  "38": "Ladakh",
};

const GSTIN_PATTERN = /^([0-9]{2})[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/;

/** Loose state-name match — normalises whitespace + case so e.g.
 *  "karnataka", "KARNATAKA", "Karnataka " all match the
 *  registry's "Karnataka". */
function statesMatch(a: string, b: string): boolean {
  return a.replace(/\s+/g, " ").trim().toLowerCase() === b.toLowerCase();
}

export const detectGstinMismatch: DetectorFn = async (organizationId) => {
  // Only contacts with BOTH a GSTIN and a declared state to compare
  // against. Contacts missing either are a separate data-hygiene
  // problem, not a mismatch.
  const contacts = await db.contact.findMany({
    where: {
      organizationId,
      gstin: { not: null },
      placeOfSupply: { not: null },
    },
    select: {
      id: true,
      displayName: true,
      gstin: true,
      placeOfSupply: true,
    },
  });

  const out: DetectedAnomaly[] = [];

  for (const c of contacts) {
    const gstin = (c.gstin ?? "").toUpperCase().trim();
    const m = GSTIN_PATTERN.exec(gstin);
    if (!m) continue; // malformed — separate issue, don't flag here
    const codeFromGstin = m[1];
    const stateFromGstin = GSTIN_STATE_CODES[codeFromGstin];
    if (!stateFromGstin) continue;
    const declared = (c.placeOfSupply ?? "").trim();
    if (!declared) continue;
    if (statesMatch(declared, stateFromGstin)) continue;

    out.push({
      detectorKey: "gstin_mismatch",
      severity: "medium",
      title: `${c.displayName}'s GSTIN state doesn't match their declared state`,
      description:
        `GSTIN ${gstin} encodes state "${stateFromGstin}" (code ${codeFromGstin}) ` +
        `but the contact's place-of-supply is "${declared}". ` +
        `Invoices to this contact will pick the wrong IGST vs CGST/SGST split. ` +
        `Either correct the GSTIN or update the contact's state in Quikfinance.`,
      refType: "contact",
      refId: c.id,
      fingerprint: fpKey("gstin_mismatch", [c.id]),
    });
  }
  return out;
};
