import { describe, it, expect } from "vitest";
import { hashTypedData } from "viem";

import { MINT_VOUCHER_DOMAIN, MINT_VOUCHER_TYPES } from "@/lib/blockchain/abi";

/**
 * BC-1.01 cross-language hash test vector.
 *
 * The off-chain signer (src/lib/blockchain/mint-voucher.ts) and the on-chain
 * contract (contracts/src/ArtwallCOA.sol, EIP-712 `_hashTypedDataV4`) must
 * compute the *same* digest for the same voucher — otherwise a voucher the
 * server signs would never verify on-chain, or worse, the two sides could
 * silently agree on different content for the same bytes.
 *
 * The expected digest below was produced independently, by Solidity/Foundry,
 * for this exact fixed input (see contracts/test/ArtwallCOA.t.sol's
 * `_sign` helper for the equivalent Solidity-side construction — same
 * typehash, same abi.encode order, same keccak256(bytes(uri)) treatment).
 * Reproduce it by deploying ArtwallCOA(admin=0x1111..., signer=0x2222...)
 * as the first contract from a fresh `forge test` run (nonce 0 gives the
 * deterministic address below) and logging `_hashTypedDataV4(structHash)`
 * for the same voucher fields, chainId 31337.
 */
describe("EIP-712 MintVoucher cross-language hash (BC-1.01)", () => {
  it("viem's hashTypedData matches the independently-computed Solidity digest", () => {
    const digest = hashTypedData({
      domain: {
        ...MINT_VOUCHER_DOMAIN,
        chainId: 31337,
        verifyingContract: "0x5615dEB798BB3E4dFa0139dFa1b3D433Cc23b72f",
      },
      types: MINT_VOUCHER_TYPES,
      primaryType: "MintVoucher",
      message: {
        to: "0x3333333333333333333333333333333333333333",
        uri: "ipfs://bafyTestVector",
        royaltyReceiver: "0x4444444444444444444444444444444444444444",
        royaltyFeeBps: 500n,
        nonce: `0x${"0".repeat(63)}1` as const,
        deadline: 1999999999n,
      },
    });

    expect(digest).toBe(
      "0x568c2cd2a35878060144279fc7236996f65891bfd7bc9534d66a72080220c213",
    );
  });
});
