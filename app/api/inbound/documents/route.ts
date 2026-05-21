import { NextResponse } from "next/server";
import { processInboundEmail, type InboundAttachment } from "@/lib/documents/inbound-email";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * DOC-D3.1: Inbound email webhook for Smart Capture.
 *
 * Accepts POSTs from Resend Inbound, AWS SES (via SNS), Mailgun
 * Routes, or any provider that can deliver a JSON body containing
 * `{ to, from, subject, attachments }`. The route handler converts
 * the provider-specific shape into our normalised
 * `InboundEmailPayload` and hands off to `processInboundEmail`.
 *
 * Security:
 *   - Gated by a shared bearer token in `INBOUND_EMAIL_WEBHOOK_SECRET`
 *   - Each provider's webhook config must include the same secret
 *     in the `Authorization: Bearer <secret>` header
 *
 * Provider hints (for the user when configuring):
 *
 *   Resend Inbound:
 *     - Domain: <INBOUND_EMAIL_DOMAIN>
 *     - Catch-all → POST to https://<app>/api/inbound/documents
 *     - Forward custom header: Authorization: Bearer <secret>
 *     - Body shape: { to, from, subject, attachments: [{ filename,
 *       contentType, content_base64 }] }
 *
 *   AWS SES → SNS → Lambda → fetch:
 *     - Receipt rule for <INBOUND_EMAIL_DOMAIN>
 *     - Action: Save to S3 + invoke Lambda
 *     - Lambda parses S3 object via mailparser, POSTs to our endpoint
 *
 *   Mailgun Routes:
 *     - Route `match_recipient(".*@<INBOUND_EMAIL_DOMAIN>$")`
 *     - Forward to https://<app>/api/inbound/documents with the
 *       attachments in their `attachment-N` form fields
 */

type IncomingAttachment = {
  filename?: string;
  name?: string;
  contentType?: string;
  content_type?: string;
  mimeType?: string;
  content?: string;
  content_base64?: string;
  data?: string;
};

type IncomingPayload = {
  to?: string | string[];
  from?: string;
  subject?: string;
  attachments?: IncomingAttachment[];
};

/**
 * Normalise an attachment from any provider shape into the
 * canonical `InboundAttachment`. Base64 content is decoded here.
 */
function normaliseAttachment(
  a: IncomingAttachment
): InboundAttachment | null {
  const filename = a.filename ?? a.name ?? "attachment";
  const contentType =
    a.contentType ?? a.content_type ?? a.mimeType ?? undefined;
  const base64 = a.content_base64 ?? a.content ?? a.data;
  if (!base64) return null;
  let content: Buffer;
  try {
    content = Buffer.from(base64, "base64");
  } catch {
    return null;
  }
  if (!content.length) return null;
  return { filename, contentType, content };
}

function firstString(value: string | string[] | undefined): string | undefined {
  if (!value) return undefined;
  if (Array.isArray(value)) return value[0];
  return value;
}

export async function POST(request: Request) {
  // ── Auth: shared bearer secret ─────────────────────────────────
  const secret = process.env.INBOUND_EMAIL_WEBHOOK_SECRET;
  if (!secret) {
    // Operator hasn't configured inbound yet — short-circuit so we
    // don't accidentally accept unsigned payloads.
    return NextResponse.json(
      { ok: false, reason: "webhook-not-configured" },
      { status: 503 }
    );
  }
  const auth = request.headers.get("authorization") ?? "";
  const provided = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
  if (provided !== secret) {
    return NextResponse.json(
      { ok: false, reason: "unauthorized" },
      { status: 401 }
    );
  }

  // ── Parse payload ──────────────────────────────────────────────
  let body: IncomingPayload;
  try {
    body = (await request.json()) as IncomingPayload;
  } catch {
    return NextResponse.json(
      { ok: false, reason: "invalid-json" },
      { status: 400 }
    );
  }

  const to = firstString(body.to);
  if (!to) {
    return NextResponse.json(
      { ok: false, reason: "missing-to" },
      { status: 400 }
    );
  }

  const rawAttachments = Array.isArray(body.attachments)
    ? body.attachments
    : [];
  const attachments: InboundAttachment[] = [];
  for (const a of rawAttachments) {
    const n = normaliseAttachment(a);
    if (n) attachments.push(n);
  }

  // ── Process ────────────────────────────────────────────────────
  const result = await processInboundEmail({
    to,
    from: body.from,
    subject: body.subject,
    attachments,
  });

  // We return 200 even on "unknown-org" / "no-attachments" so the
  // provider doesn't retry a permanent failure. Real errors (e.g.
  // missing BLOB token) come back as 503 with reason set so the
  // provider can backoff + retry.
  if (!result.ok) {
    const transientReasons = new Set([
      "blob-storage-not-configured",
    ]);
    const status = transientReasons.has(result.reason) ? 503 : 200;
    return NextResponse.json(result, { status });
  }

  return NextResponse.json(result, { status: 200 });
}

/**
 * Health-check GET so providers can verify the endpoint without
 * sending an actual payload.
 */
export async function GET() {
  const configured = !!(
    process.env.INBOUND_EMAIL_WEBHOOK_SECRET &&
    process.env.INBOUND_EMAIL_DOMAIN &&
    process.env.BLOB_READ_WRITE_TOKEN
  );
  return NextResponse.json({
    ok: true,
    configured,
    documentInboxDomain: process.env.INBOUND_EMAIL_DOMAIN ?? null,
  });
}
