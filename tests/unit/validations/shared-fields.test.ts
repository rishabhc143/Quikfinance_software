import { describe, it, expect } from "vitest";
import {
  attachmentSchema,
  attachmentsField,
  customFieldValuesField,
} from "@/lib/validations/shared-fields";

describe("attachmentSchema (single row)", () => {
  it("accepts a well-formed attachment", () => {
    const result = attachmentSchema.parse({
      fileName: "invoice.pdf",
      fileUrl: "https://blob.vercel.com/foo.pdf",
      fileSize: 12345,
      mimeType: "application/pdf",
    });
    expect(result.fileName).toBe("invoice.pdf");
    expect(result.fileSize).toBe(12345);
  });

  it("rejects empty fileName", () => {
    expect(() =>
      attachmentSchema.parse({
        fileName: "",
        fileUrl: "https://x",
        fileSize: 0,
        mimeType: "application/pdf",
      })
    ).toThrow();
  });

  it("rejects fileName longer than 200 chars", () => {
    expect(() =>
      attachmentSchema.parse({
        fileName: "a".repeat(201),
        fileUrl: "https://x",
        fileSize: 0,
        mimeType: "application/pdf",
      })
    ).toThrow();
  });

  it("rejects negative fileSize", () => {
    expect(() =>
      attachmentSchema.parse({
        fileName: "x.pdf",
        fileUrl: "https://x",
        fileSize: -1,
        mimeType: "application/pdf",
      })
    ).toThrow();
  });

  it("rejects non-integer fileSize", () => {
    expect(() =>
      attachmentSchema.parse({
        fileName: "x.pdf",
        fileUrl: "https://x",
        fileSize: 1.5,
        mimeType: "application/pdf",
      })
    ).toThrow();
  });

  it("coerces stringified fileSize", () => {
    const result = attachmentSchema.parse({
      fileName: "x.pdf",
      fileUrl: "https://x",
      fileSize: "12345",
      mimeType: "application/pdf",
    });
    expect(result.fileSize).toBe(12345);
  });

  it("rejects mimeType longer than 120 chars", () => {
    expect(() =>
      attachmentSchema.parse({
        fileName: "x.pdf",
        fileUrl: "https://x",
        fileSize: 0,
        mimeType: "a".repeat(121),
      })
    ).toThrow();
  });

  it("rejects empty fileUrl", () => {
    expect(() =>
      attachmentSchema.parse({
        fileName: "x.pdf",
        fileUrl: "",
        fileSize: 0,
        mimeType: "application/pdf",
      })
    ).toThrow();
  });
});

describe("attachmentsField(max)", () => {
  const validRow = {
    fileName: "x.pdf",
    fileUrl: "https://x",
    fileSize: 1,
    mimeType: "application/pdf",
  };

  it("defaults to empty array when omitted", () => {
    const schema = attachmentsField(10);
    expect(schema.parse(undefined)).toEqual([]);
  });

  it("defaults to empty array when explicitly undefined", () => {
    const schema = attachmentsField(5);
    expect(schema.parse(undefined)).toEqual([]);
  });

  it("accepts up to the max count", () => {
    const schema = attachmentsField(3);
    const rows = [validRow, validRow, validRow];
    expect(schema.parse(rows)).toHaveLength(3);
  });

  it("rejects more than the max count", () => {
    const schema = attachmentsField(2);
    const rows = [validRow, validRow, validRow];
    expect(() => schema.parse(rows)).toThrow();
  });

  it("default max is 10", () => {
    const schema = attachmentsField();
    const rows = Array.from({ length: 11 }, () => validRow);
    expect(() => schema.parse(rows)).toThrow();
    expect(schema.parse(Array.from({ length: 10 }, () => validRow))).toHaveLength(10);
  });

  it("each invocation returns a fresh schema (no shared state)", () => {
    const a = attachmentsField(5);
    const b = attachmentsField(5);
    expect(a).not.toBe(b);
    // Both still parse the same input identically.
    expect(a.parse([validRow])).toEqual(b.parse([validRow]));
  });

  it("rejects rows that fail the inner attachment schema", () => {
    const schema = attachmentsField(10);
    expect(() => schema.parse([{ ...validRow, fileName: "" }])).toThrow();
  });
});

describe("customFieldValuesField", () => {
  it("defaults to empty array when omitted", () => {
    expect(customFieldValuesField.parse(undefined)).toEqual([]);
  });

  it("accepts well-formed entries", () => {
    const result = customFieldValuesField.parse([
      { fieldDefinitionId: "fd-1", value: "string value" },
      { fieldDefinitionId: "fd-2", value: 42 },
      { fieldDefinitionId: "fd-3", value: true },
      { fieldDefinitionId: "fd-4", value: null },
      { fieldDefinitionId: "fd-5", value: { nested: "object" } },
    ]);
    expect(result).toHaveLength(5);
  });

  it("rejects empty fieldDefinitionId", () => {
    expect(() =>
      customFieldValuesField.parse([{ fieldDefinitionId: "", value: "x" }])
    ).toThrow();
  });

  it("accepts an empty array", () => {
    expect(customFieldValuesField.parse([])).toEqual([]);
  });

  it("value field accepts unknown shape (z.unknown)", () => {
    // The whole point of value: z.unknown() is that the schema doesn't
    // validate it. The per-fieldType validation happens elsewhere.
    const exotic = customFieldValuesField.parse([
      { fieldDefinitionId: "f1", value: Symbol() as unknown },
      { fieldDefinitionId: "f2", value: new Date() as unknown },
    ]);
    expect(exotic).toHaveLength(2);
  });
});
