import { describe, it, expect } from "vitest";
import {
  manualJournalAttachmentSchema,
  manualJournalAttachmentsSchema,
  MAX_MANUAL_JOURNAL_ATTACHMENTS,
  MAX_MANUAL_JOURNAL_ATTACHMENT_BYTES,
} from "@/lib/accounting/manual-journal-attachments";

/**
 * ACCT-A.3.c — Tests for the attachment policy. Pins the
 * 5 × 10 MB limits so a regression here can't silently widen the
 * upload surface (which matters for data-URL storage — the larger
 * the cap, the more DB row weight we ship per journal).
 */

const TEN_MB = MAX_MANUAL_JOURNAL_ATTACHMENT_BYTES;

function attachment(over: Partial<{
  fileName: string;
  fileUrl: string;
  fileSize: number;
  mimeType: string;
}> = {}) {
  return {
    fileName: "expense-receipt.pdf",
    fileUrl: "data:application/pdf;base64,aGVsbG8=",
    fileSize: 1024,
    mimeType: "application/pdf",
    ...over,
  };
}

describe("ACCT-A.3.c constants", () => {
  it("pins the 5-file maximum", () => {
    // The spec is 5 × 10 MB; widening either side is a deliberate
    // change that should require a test update.
    expect(MAX_MANUAL_JOURNAL_ATTACHMENTS).toBe(5);
  });

  it("pins the 10 MB per-file maximum (in bytes)", () => {
    expect(MAX_MANUAL_JOURNAL_ATTACHMENT_BYTES).toBe(10 * 1024 * 1024);
  });
});

describe("manualJournalAttachmentSchema (per-file)", () => {
  it("accepts a well-formed attachment", () => {
    const parsed = manualJournalAttachmentSchema.parse(attachment());
    expect(parsed.fileName).toBe("expense-receipt.pdf");
    expect(parsed.fileSize).toBe(1024);
  });

  it("accepts a file at the exact byte cap", () => {
    expect(() =>
      manualJournalAttachmentSchema.parse(attachment({ fileSize: TEN_MB }))
    ).not.toThrow();
  });

  it("rejects a file 1 byte over the cap", () => {
    expect(() =>
      manualJournalAttachmentSchema.parse(attachment({ fileSize: TEN_MB + 1 }))
    ).toThrow(/≤ 10 MB/i);
  });

  it("rejects a missing fileName", () => {
    expect(() =>
      manualJournalAttachmentSchema.parse(attachment({ fileName: "" }))
    ).toThrow();
  });

  it("rejects a missing fileUrl (data URL or otherwise)", () => {
    expect(() =>
      manualJournalAttachmentSchema.parse(attachment({ fileUrl: "" }))
    ).toThrow();
  });

  it("rejects a missing mimeType", () => {
    expect(() =>
      manualJournalAttachmentSchema.parse(attachment({ mimeType: "" }))
    ).toThrow();
  });

  it("rejects a fileName longer than 200 chars (path-traversal + UI sanity)", () => {
    expect(() =>
      manualJournalAttachmentSchema.parse(
        attachment({ fileName: "x".repeat(201) })
      )
    ).toThrow();
  });
});

describe("manualJournalAttachmentsSchema (array policy)", () => {
  it("defaults to [] when undefined", () => {
    const parsed = manualJournalAttachmentsSchema.parse(undefined);
    expect(parsed).toEqual([]);
  });

  it("accepts exactly the maximum number of files", () => {
    const five = Array.from({ length: MAX_MANUAL_JOURNAL_ATTACHMENTS }, () =>
      attachment()
    );
    expect(() => manualJournalAttachmentsSchema.parse(five)).not.toThrow();
  });

  it("rejects more than the maximum (6 files when cap is 5)", () => {
    const six = Array.from(
      { length: MAX_MANUAL_JOURNAL_ATTACHMENTS + 1 },
      () => attachment()
    );
    expect(() => manualJournalAttachmentsSchema.parse(six)).toThrow(
      /Maximum 5 attachments/i
    );
  });

  it("accepts an empty array (a journal can have no attachments)", () => {
    expect(() => manualJournalAttachmentsSchema.parse([])).not.toThrow();
  });
});
