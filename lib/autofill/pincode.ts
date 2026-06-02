/**
 * Indian pincode → city + state lookup via the free postalpincode.in API.
 *
 * Hit on blur of a pincode field; result is cached in-memory per browser
 * session (pincode mappings don't change frequently). 404s / network
 * failures resolve silently to null so the field stays editable.
 *
 * API shape (success):
 *   [{ Status: "Success", PostOffice: [{ Name, District, State, Country, Pincode, ... }] }]
 * API shape (failure):
 *   [{ Status: "Error", Message: "..." }]
 *
 * We don't need any API key. The endpoint is free for low-volume use.
 * If we ever exceed their rate limit we'll swap to importing India Post's
 * public dataset (~150K rows, ~5MB) and bundling it.
 */

const PINCODE_API_BASE = "https://api.postalpincode.in/pincode";
const cache = new Map<string, PincodeLookupResult | null>();

export type PincodeLookupResult = {
  pincode: string;
  city: string;
  state: string;
  country: string;
};

const PINCODE_REGEX = /^\d{6}$/;

export async function lookupPincode(
  pincode: string,
): Promise<PincodeLookupResult | null> {
  const p = (pincode ?? "").trim();
  if (!PINCODE_REGEX.test(p)) return null;
  if (cache.has(p)) return cache.get(p) ?? null;

  try {
    const r = await fetch(`${PINCODE_API_BASE}/${p}`, {
      // Cache at the fetch layer too — pincode lookups are fully cacheable.
      next: { revalidate: 60 * 60 * 24 * 30 }, // 30 days
    });
    if (!r.ok) {
      cache.set(p, null);
      return null;
    }
    const json = (await r.json()) as Array<{
      Status: string;
      PostOffice?: Array<{
        Name: string;
        District: string;
        State: string;
        Country: string;
      }>;
    }>;
    const first = json?.[0];
    if (first?.Status !== "Success" || !first.PostOffice?.[0]) {
      cache.set(p, null);
      return null;
    }
    const po = first.PostOffice[0];
    const result: PincodeLookupResult = {
      pincode: p,
      city: po.District,
      state: po.State,
      country: po.Country,
    };
    cache.set(p, result);
    return result;
  } catch {
    cache.set(p, null);
    return null;
  }
}
