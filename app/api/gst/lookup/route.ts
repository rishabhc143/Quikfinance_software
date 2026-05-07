import { NextRequest, NextResponse } from "next/server";
import { requireOrganization } from "@/lib/auth-helpers";

export const dynamic = "force-dynamic";

const GSTIN_REGEX = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;

/**
 * GST portal prefill stub per <customers_spec>:
 *   "calls a stub /api/gst/lookup route (returns mock data in dev) →
 *    populates name/address."
 *
 * Real GST portal integration requires a registered GSP (GST Suvidha
 * Provider) account and is documented at:
 * https://developer.gst.gov.in/
 *
 * Until that's wired, this endpoint returns deterministic mock data so
 * the UI flow can be exercised end-to-end. The 15-char GSTIN pattern is
 * validated server-side too.
 */
export async function GET(req: NextRequest) {
  await requireOrganization(); // require auth even for the stub

  const gstin = (req.nextUrl.searchParams.get("gstin") ?? "")
    .trim()
    .toUpperCase();
  if (!gstin) {
    return NextResponse.json(
      { error: "gstin query param required" },
      { status: 400 }
    );
  }
  if (!GSTIN_REGEX.test(gstin)) {
    return NextResponse.json(
      { error: "GSTIN must match 15-char pattern: 22AAAAA0000A1Z5" },
      { status: 422 }
    );
  }

  // Mock dataset keyed by the 2-digit state code at the front of GSTIN.
  // In dev/preview/prod this returns deterministic data so the merchant
  // can test the prefill flow even without GSP credentials.
  const stateCode = gstin.slice(0, 2);
  const stateName = STATES_BY_CODE[stateCode] ?? "Unknown";

  return NextResponse.json({
    gstin,
    legalName: `Sample Trading Co (${gstin.slice(2, 7)})`,
    tradeName: `Sample Trading Co`,
    addressLine1: `${stateCode}-123 Main Street`,
    addressLine2: `Suite ${gstin.slice(7, 11)}`,
    city: stateName === "Maharashtra" ? "Mumbai" : stateName,
    state: stateName,
    zipCode: "400001",
    country: "India",
    gstTreatment: "registered",
    placeOfSupply: stateName,
  });
}

const STATES_BY_CODE: Record<string, string> = {
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
  "27": "Maharashtra",
  "29": "Karnataka",
  "32": "Kerala",
  "33": "Tamil Nadu",
  "36": "Telangana",
  "37": "Andhra Pradesh",
};
