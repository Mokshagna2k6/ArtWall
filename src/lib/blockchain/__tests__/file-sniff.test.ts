import { describe, it, expect } from "vitest";
import { sniffImageType } from "@/lib/blockchain/file-sniff";

describe("sniffImageType (BC-1.20)", () => {
  it("detects JPEG by magic bytes", () => {
    expect(sniffImageType(new Uint8Array([0xff, 0xd8, 0xff, 0xe0]))).toBe("image/jpeg");
  });

  it("detects PNG by magic bytes", () => {
    expect(
      sniffImageType(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])),
    ).toBe("image/png");
  });

  it("detects GIF89a by magic bytes", () => {
    expect(
      sniffImageType(new Uint8Array([0x47, 0x49, 0x46, 0x38, 0x39, 0x61])),
    ).toBe("image/gif");
  });

  it("detects WEBP by RIFF....WEBP magic bytes", () => {
    const bytes = new Uint8Array(12);
    bytes.set([0x52, 0x49, 0x46, 0x46], 0);
    bytes.set([0, 0, 0, 0], 4); // file size, irrelevant to detection
    bytes.set([0x57, 0x45, 0x42, 0x50], 8);
    expect(sniffImageType(bytes)).toBe("image/webp");
  });

  it("detects HEIC by ftyp box brand", () => {
    const bytes = new Uint8Array(12);
    bytes.set([0, 0, 0, 0x18], 0); // box size, irrelevant to detection
    bytes.set([0x66, 0x74, 0x79, 0x70], 4); // "ftyp"
    bytes.set([0x68, 0x65, 0x69, 0x63], 8); // "heic" brand
    expect(sniffImageType(bytes)).toBe("image/heic");
  });

  it("detects AVIF by ftyp box brand", () => {
    const bytes = new Uint8Array(12);
    bytes.set([0, 0, 0, 0x18], 0);
    bytes.set([0x66, 0x74, 0x79, 0x70], 4);
    bytes.set([0x61, 0x76, 0x69, 0x66], 8); // "avif" brand
    expect(sniffImageType(bytes)).toBe("image/avif");
  });

  it("rejects a renamed non-image file even with an image-claiming extension", () => {
    // A plain text/HTML payload masquerading as a .png by filename/content-type alone.
    const fakePng = new TextEncoder().encode("<script>alert(1)</script>");
    expect(sniffImageType(fakePng)).toBeNull();
  });

  it("rejects an empty buffer", () => {
    expect(sniffImageType(new Uint8Array(0))).toBeNull();
  });
});
