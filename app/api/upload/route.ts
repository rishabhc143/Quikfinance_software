import { NextResponse } from "next/server";
import { z } from "zod";
import { requireOrganization } from "@/lib/auth-helpers";

export const runtime = "nodejs";

const MAX_BYTES = 10 * 1024 * 1024; // 10 MB

const schema = z.object({
  filename: z.string().min(1).max(200),
  mimeType: z.string().max(120),
  dataUrl: z.string().regex(/^data:[a-zA-Z0-9+./-]+;base64,/, "Must be a base64 data URL"),
});

/**
 * POST /api/upload
 *
 * Body: { filename, mimeType, dataUrl }
 * Response: { url, kind: "data-url" | "s3" }
 *
 * Behavior:
 *   - When UPLOADTHING_SECRET / S3 keys are configured, this endpoint will
 *     forward the upload to the provider and return the persisted URL.
 *   - In dev (no provider keys), it echoes the data URL back unchanged. The
 *     consumer stores it on the entity record. This is fine for prototypes
 *     and small images; not for production multi-MB attachments.
 */
export async function POST(req: Request) {
  await requireOrganization();
  const body = await req.json().catch(() => ({}));
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });

  const { dataUrl, filename, mimeType } = parsed.data;

  // Approximate base64 size; reject early.
  const base64 = dataUrl.split(",", 2)[1] ?? "";
  const approxBytes = Math.floor((base64.length * 3) / 4);
  if (approxBytes > MAX_BYTES) {
    return NextResponse.json({ error: `File too large (${(approxBytes / 1024 / 1024).toFixed(1)} MB > ${MAX_BYTES / 1024 / 1024} MB)` }, { status: 413 });
  }

  if (process.env.UPLOADTHING_SECRET || process.env.AWS_S3_BUCKET) {
    // Production path placeholder. The real implementation:
    //   1. POST to UploadThing or presign + PUT to S3
    //   2. Return the persisted URL
    // Wiring requires actual provider keys; documented in DECISIONS.md (D-native-upload).
    return NextResponse.json({ error: "Provider integration not yet wired. Add the SDK call and remove this fallback." }, { status: 501 });
  }

  // Dev / no-provider path: echo the data URL.
  // Stored on Document.url / Item.imageUrl for now.
  return NextResponse.json({ url: dataUrl, kind: "data-url", filename, mimeType, bytes: approxBytes });
}
