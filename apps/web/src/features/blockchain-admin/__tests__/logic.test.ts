import { describe, expect, it } from "vitest";

import { duplicateWallets, escrowTotals, ipfsPinState, isOverdueHold, mintHealth } from "../logic";

const now = new Date("2026-01-01T12:00:00Z");

describe("blockchain-admin logic", () => {
  it("classifies IPFS pin state", () => {
    expect(ipfsPinState({ imageCid: "a", metadataCid: "b" })).toBe("pinned");
    expect(ipfsPinState({ imageCid: "a", metadataCid: null })).toBe("partial");
    expect(ipfsPinState({ imageCid: null, metadataCid: null })).toBe("unpinned");
  });

  it("flags minting certificates older than the threshold as stuck", () => {
    const old = new Date(now.getTime() - 60 * 60 * 1000);
    const fresh = new Date(now.getTime() - 60 * 1000);
    expect(mintHealth({ status: "minting", mintRequestedAt: old }, now)).toBe("stuck");
    expect(mintHealth({ status: "minting", mintRequestedAt: fresh }, now)).toBe("ok");
    expect(mintHealth({ status: "minting", mintRequestedAt: null }, now)).toBe("stuck");
    expect(mintHealth({ status: "failed", mintRequestedAt: null }, now)).toBe("failed");
    expect(mintHealth({ status: "issued", mintRequestedAt: null }, now)).toBe("not_started");
  });

  it("finds a wallet shared by two users case-insensitively", () => {
    const d = duplicateWallets([
      { userId: "u1", walletAddress: "0xAbC" },
      { userId: "u2", walletAddress: "0xabc" },
      { userId: "u3", walletAddress: "0xdef" },
      { userId: "u4", walletAddress: null },
    ]);
    expect(d).toEqual([{ walletAddress: "0xabc", userIds: ["u1", "u2"] }]);
  });

  it("totals escrow by status and finds overdue holds", () => {
    expect(
      escrowTotals([
        { status: "held", amountPaise: 100 },
        { status: "held", amountPaise: 50 },
        { status: "released", amountPaise: 70 },
        { status: "refunded", amountPaise: 30 },
      ]),
    ).toEqual({ held: 150, heldCount: 2, released: 70, refunded: 30 });
    const past = new Date(now.getTime() - 1000);
    expect(isOverdueHold({ status: "held", releaseEligibleAt: past }, now)).toBe(true);
    expect(isOverdueHold({ status: "released", releaseEligibleAt: past }, now)).toBe(false);
    expect(isOverdueHold({ status: "held", releaseEligibleAt: null }, now)).toBe(false);
  });
});
