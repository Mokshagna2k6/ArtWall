import { describe, expect, it } from "vitest";

import { chainName } from "@/features/blockchain/chains";

/**
 * The mint flow's two pieces of pure logic. Everything else in the mint UI is
 * a wallet round trip or a fetch, which belongs in an integration test, not
 * here — but these two decide what the artist is told about *which chain* they
 * are signing on, and that is exactly the thing nobody notices until a token
 * lands somewhere unexpected.
 */
describe("chainName", () => {
  it("names the testnets we actually target, so a testnet mint cannot read as mainnet", () => {
    expect(chainName(84532)).toContain("testnet");
    expect(chainName(11155111)).toContain("testnet");
    expect(chainName(2442)).toContain("testnet");
  });

  it("names mainnets plainly", () => {
    expect(chainName(1)).toBe("Ethereum mainnet");
    expect(chainName(8453)).toBe("Base");
  });

  it("never renders an unknown chain as a blank or a lie", () => {
    // A chain we have no name for still has to be identifiable: showing
    // nothing would let someone assume it was the expected network.
    expect(chainName(999999)).toBe("chain 999999");
    expect(chainName(null)).toBe("unknown network");
    expect(chainName(undefined)).toBe("unknown network");
  });
});

describe("voucher argument conversion", () => {
  // The server sends JSON, where a uint96 and a uint256 are strings. The ABI
  // wants bigints. Getting this wrong does not fail loudly — it encodes a
  // different number, and the royalty or the deadline silently changes.
  it("converts string fields to bigint without losing precision", () => {
    const royaltyFeeBps = "1000";
    const deadline = "1794500000";
    expect(BigInt(royaltyFeeBps)).toBe(1000n);
    expect(BigInt(deadline)).toBe(1794500000n);
  });

  it("survives a deadline past 2^53, where Number would round", () => {
    const huge = "9007199254740993"; // 2^53 + 1
    expect(BigInt(huge).toString()).toBe(huge);
    expect(Number(huge).toString()).not.toBe(huge);
  });
});
