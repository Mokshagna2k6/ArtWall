import { beforeEach, describe, expect, it, vi } from "vitest";

const { build, verify } = vi.hoisted(() => ({
  build: vi.fn(async (_d: Record<string, unknown>) => new Uint8Array([1, 2, 3])),
  verify: vi.fn(),
}));
vi.mock("@/features/coa/pdf", () => ({ buildCertificatePdf: build }));
vi.mock("@/lib/catalog-cache", () => ({ getCertificateForVerify: verify }));
vi.mock("@/features/coa/merkle-commit", () => ({ getCertificateProof: vi.fn() }));
vi.mock("@/lib/cloudinary", () => ({ uploadRawFile: vi.fn() }));
vi.mock("@/lib/db/index", () => ({ db: {} }));

const publicCert = {
  id: "coa_1", artworkId: "art_1", ownerId: "user_SECRET", status: "revoked", issuedAt: new Date(),
  revokedAt: new Date(), artworkTitle: "T", artworkImage: null, medium: "Oil", dimensions: "1x1", year: 2020,
  artistName: "A", tokenId: "7", contractAddr: "0xabc", chainId: 1, metadataUri: null,
  ownerWallet: "0xWALLET", txHash: "0xtx",
};

beforeEach(() => vi.clearAllMocks());

describe("public certificate PDF", () => {
  it("passes only publicly shown fields, with REVOKED status and no hash/merkle/owner data", async () => {
    verify.mockResolvedValue(publicCert);
    const { renderPublicCertificatePdf } = await import("@/features/coa/pdf-service");
    await renderPublicCertificatePdf("coa_1");
    const arg = build.mock.calls[0][0];
    expect(arg.status).toBe("revoked");
    expect(arg.metadataHash).toBeUndefined();
    expect(arg.merkle).toBeUndefined();
    expect(JSON.stringify(arg)).not.toMatch(/user_SECRET|0xWALLET/);
  });

  it("route: no auth needed, 404 for unknown/malformed keys, public cache header", async () => {
    const { GET } = await import("@/app/verify/[hash]/pdf/route");
    const call = (hash: string) => GET(new Request("http://x"), { params: Promise.resolve({ hash }) });
    verify.mockResolvedValue(null);
    expect((await call("nope")).status).toBe(404);
    expect((await call("../etc")).status).toBe(404);
    verify.mockResolvedValue({ ...publicCert, status: "issued" });
    const ok = await call("coa_1");
    expect(ok.status).toBe(200);
    expect(ok.headers.get("content-type")).toBe("application/pdf");
    expect(ok.headers.get("cache-control")).toContain("s-maxage=60");
  });
});
