import { describe, it, expect, vi } from "vitest";

import { buildCertificatePdf } from "@/features/coa/pdf";

const base = {
  certificateId: "coa_abc123",
  status: "issued",
  title: "Sunset over Hampi",
  artist: "Asha Rao",
  medium: "Oil on canvas",
  year: 2024,
  issuedAt: new Date("2025-01-02T00:00:00Z"),
  metadataHash: "a".repeat(64),
  verifyUrl: "https://example.test/verify/coa_abc123",
};
const raw = (b: Uint8Array) => Buffer.from(b).toString("latin1");

describe("unicode fonts", () => {
  it("embeds a Devanagari-capable subset font instead of a '?' fallback", async () => {
    const bytes = await buildCertificatePdf({ ...base, title: "सूर्यास्त हम्पी Hampi", artist: "आशा राव" });
    expect(raw(bytes)).toMatch(/NotoSansDevanagari-Bold/);
    expect(bytes.length).toBeLessThan(600_000); // subset, not the ~1.7MB of full faces
  });

  it("uses only the Latin face for English", async () => {
    const s = raw(await buildCertificatePdf(base));
    expect(s).toMatch(/NotoSans-Bold/);
    expect(s).not.toMatch(/NotoSansDevanagari/);
  });

  it("falls back to standard fonts if the font files cannot be read", async () => {
    vi.resetModules();
    vi.doMock("node:fs/promises", () => ({ readFile: () => Promise.reject(new Error("ENOENT")) }));
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const { buildCertificatePdf: build } = await import("@/features/coa/pdf");
    const bytes = await build({ ...base, title: "सूर्यास्त" });
    expect(raw(bytes)).toMatch(/Times-Bold/);
    expect(spy).toHaveBeenCalled();
    vi.doUnmock("node:fs/promises");
    spy.mockRestore();
  });
});
