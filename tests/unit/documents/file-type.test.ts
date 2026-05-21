import { describe, it, expect } from "vitest";
import {
  fileTypeFromMime,
  labelForFileType,
  parseFileTypeParam,
  FILE_TYPE_BUCKETS,
  type FileTypeBucket,
} from "@/lib/documents/file-type";

describe("documents/file-type", () => {
  describe("fileTypeFromMime", () => {
    it("routes PDFs to the pdf bucket", () => {
      expect(fileTypeFromMime("application/pdf")).toBe("pdf");
    });

    it("routes common image MIMEs to the image bucket", () => {
      const images = [
        "image/png",
        "image/jpeg",
        "image/jpg",
        "image/webp",
        "image/heic",
        "image/heif",
        "image/gif",
        "image/svg+xml",
        "image/avif",
      ];
      for (const m of images) {
        expect(fileTypeFromMime(m), `expected ${m} → image`).toBe("image");
      }
    });

    it("routes any image/* fallback to image", () => {
      expect(fileTypeFromMime("image/x-canon-cr2")).toBe("image");
    });

    it("routes CSV/XLS/XLSX/ODS to the spreadsheet bucket", () => {
      expect(fileTypeFromMime("text/csv")).toBe("spreadsheet");
      expect(fileTypeFromMime("application/vnd.ms-excel")).toBe("spreadsheet");
      expect(
        fileTypeFromMime(
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        )
      ).toBe("spreadsheet");
      expect(
        fileTypeFromMime("application/vnd.oasis.opendocument.spreadsheet")
      ).toBe("spreadsheet");
    });

    it("routes DOC/DOCX/ODT/TXT/RTF to the word bucket", () => {
      expect(fileTypeFromMime("application/msword")).toBe("word");
      expect(
        fileTypeFromMime(
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        )
      ).toBe("word");
      expect(fileTypeFromMime("application/vnd.oasis.opendocument.text")).toBe(
        "word"
      );
      expect(fileTypeFromMime("text/plain")).toBe("word");
      expect(fileTypeFromMime("text/rtf")).toBe("word");
      expect(fileTypeFromMime("application/rtf")).toBe("word");
    });

    it("falls back to other for unknown MIMEs", () => {
      expect(fileTypeFromMime("application/x-mystery")).toBe("other");
      expect(fileTypeFromMime("video/mp4")).toBe("other");
    });

    it("treats null / empty / undefined as other (safe default)", () => {
      expect(fileTypeFromMime(null)).toBe("other");
      expect(fileTypeFromMime(undefined)).toBe("other");
      expect(fileTypeFromMime("")).toBe("other");
    });

    it("is case-insensitive + trim-tolerant", () => {
      expect(fileTypeFromMime("  Application/PDF  ")).toBe("pdf");
      expect(fileTypeFromMime("IMAGE/PNG")).toBe("image");
    });
  });

  describe("labelForFileType", () => {
    it("returns a friendly label for each bucket", () => {
      expect(labelForFileType("pdf")).toBe("PDF");
      expect(labelForFileType("image")).toBe("Image");
      expect(labelForFileType("spreadsheet")).toBe("Spreadsheet");
      expect(labelForFileType("word")).toBe("Word");
      expect(labelForFileType("other")).toBe("Other");
    });
  });

  describe("FILE_TYPE_BUCKETS", () => {
    it("covers all 5 buckets exactly once, in display order", () => {
      expect(FILE_TYPE_BUCKETS).toEqual([
        "pdf",
        "image",
        "spreadsheet",
        "word",
        "other",
      ]);
    });

    it("every bucket has a label and a MIME that maps to it", () => {
      const samples: Record<FileTypeBucket, string> = {
        pdf: "application/pdf",
        image: "image/png",
        spreadsheet: "text/csv",
        word: "application/msword",
        other: "video/mp4",
      };
      for (const b of FILE_TYPE_BUCKETS) {
        expect(labelForFileType(b)).toBeTruthy();
        expect(fileTypeFromMime(samples[b])).toBe(b);
      }
    });
  });

  describe("parseFileTypeParam", () => {
    it("returns null for missing / empty / 'all'", () => {
      expect(parseFileTypeParam(null)).toBeNull();
      expect(parseFileTypeParam(undefined)).toBeNull();
      expect(parseFileTypeParam("")).toBeNull();
      expect(parseFileTypeParam("all")).toBeNull();
      expect(parseFileTypeParam("ALL")).toBeNull();
    });

    it("returns the bucket for a known value", () => {
      expect(parseFileTypeParam("pdf")).toBe("pdf");
      expect(parseFileTypeParam("IMAGE")).toBe("image");
      expect(parseFileTypeParam(" spreadsheet ")).toBe("spreadsheet");
    });

    it("returns null for unknown values (fail-open to All)", () => {
      expect(parseFileTypeParam("rubbish")).toBeNull();
      expect(parseFileTypeParam("123")).toBeNull();
    });
  });
});
