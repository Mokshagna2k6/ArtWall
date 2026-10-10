import { describe, it, expect } from "vitest";
import { PDFDocument } from "pdf-lib";

import { buildCertificatePdf } from "@/features/coa/pdf";

const base = {
  certificateId: "coa_abc123",
  status: "issued",
  title: "Sunset over Hampi",
  artist: "Asha Rao",
  medium: "Oil on canvas",
  dimensions: "60 x 90 cm",
  year: 2024,
  issuedAt: new Date("2025-01-02T00:00:00Z"),
  metadataHash: "a".repeat(64),
  verifyUrl: "https://example.test/verify/coa_abc123",
};

describe("buildCertificatePdf", () => {
  it("emits a single-page PDF carrying the certificate id and title", async () => {
    const bytes = await buildCertificatePdf({
      ...base,
      merkle: { root: "0x" + "b".repeat(64), leaf: "0x" + "c".repeat(64) },
    });
    expect(Buffer.from(bytes.slice(0, 5)).toString()).toBe("%PDF-");
    const doc = await PDFDocument.load(bytes);
    expect(doc.getPageCount()).toBe(1);
    expect(doc.getTitle()).toContain("Sunset over Hampi");
    expect(doc.getSubject()).toContain("coa_abc123");
  });

  it("does not throw on non-Latin titles or an undecodable image", async () => {
    const bytes = await buildCertificatePdf({
      ...base,
      title: "सूर्यास्त ☀",
      status: "revoked",
      image: { bytes: new Uint8Array([1, 2, 3]), kind: "jpg" },
    });
    expect(bytes.length).toBeGreaterThan(1000);
  });
});
