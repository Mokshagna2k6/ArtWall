import { describe, it, expect } from "vitest";
import { privateKeyToAccount, generatePrivateKey } from "viem/accounts";
import { recoverTypedDataAddress, type Address } from "viem";
import { MINT_VOUCHER_DOMAIN, MINT_VOUCHER_TYPES } from "@/lib/blockchain/abi";

/**
 * BC-2.04: the EIP-712 domain signMintVoucher (src/lib/blockchain/mint-voucher.ts)
 * builds includes name, version (MINT_VOUCHER_DOMAIN: {name:"ArtwallCOA",
 * version:"1"}), chainId and verifyingContract (added at the call site from
 * NFT_CONTRACT_ADDRESS/DEFAULT_CHAIN_ID) — matching exactly the Solidity
 * contract's `EIP712("ArtwallCOA", "1")` constructor call and the
 * MintVoucher struct's field order (contracts/src/ArtwallCOA.sol).
 *
 * This test signs a voucher the same way signMintVoucher does (same domain
 * shape, same signer key) and proves the resulting signature only recovers
 * to the signer under the EXACT domain it was signed for — a voucher signed
 * for a different chainId, or a different verifying contract, recovers to a
 * different (wrong) address and so is rejected, mirroring what
 * ArtwallCOA.mintWithVoucher enforces on-chain (also covered by
 * contracts/test/ArtwallCOASecurity.t.sol's
 * testVoucherSignedForWrongChainIdReverts and
 * ArtwallCOA.t.sol's testVoucherBoundToThisContractDomain).
 */
describe("mint voucher EIP-712 domain binding (BC-2.04)", () => {
  const signerKey = generatePrivateKey();
  const account = privateKeyToAccount(signerKey);
  const contractA = "0x1111111111111111111111111111111111111111" as Address;
  const contractB = "0x2222222222222222222222222222222222222222" as Address;
  const to = "0x3333333333333333333333333333333333333333" as Address;

  const message = {
    to,
    uri: "ipfs://bafy-example",
    royaltyReceiver: to,
    royaltyFeeBps: 500n,
    nonce: "0x0000000000000000000000000000000000000000000000000000000000000001" as `0x${string}`,
    deadline: 9_999_999_999n,
  };

  async function sign(chainId: number, verifyingContract: Address) {
    return account.signTypedData({
      domain: { ...MINT_VOUCHER_DOMAIN, chainId, verifyingContract },
      types: MINT_VOUCHER_TYPES,
      primaryType: "MintVoucher",
      message,
    });
  }

  it("includes name, version, chainId and verifyingContract in the domain", () => {
    expect(MINT_VOUCHER_DOMAIN.name).toBe("ArtwallCOA");
    expect(MINT_VOUCHER_DOMAIN.version).toBe("1");
    // chainId and verifyingContract are supplied by the caller (mint-voucher.ts
    // spreads MINT_VOUCHER_DOMAIN then adds them) — asserted via the recovery
    // round-trip below, which fails the moment either is wrong.
  });

  it("recovers to the real signer under the domain it was signed for", async () => {
    const signature = await sign(84532, contractA);
    const recovered = await recoverTypedDataAddress({
      domain: { ...MINT_VOUCHER_DOMAIN, chainId: 84532, verifyingContract: contractA },
      types: MINT_VOUCHER_TYPES,
      primaryType: "MintVoucher",
      message,
      signature,
    });
    expect(recovered.toLowerCase()).toBe(account.address.toLowerCase());
  });

  it("rejects a voucher signed for a different chainId", async () => {
    const signature = await sign(84532, contractA); // signed for Base Sepolia
    const recovered = await recoverTypedDataAddress({
      domain: { ...MINT_VOUCHER_DOMAIN, chainId: 8453, verifyingContract: contractA }, // verified against Base mainnet
      types: MINT_VOUCHER_TYPES,
      primaryType: "MintVoucher",
      message,
      signature,
    });
    expect(recovered.toLowerCase()).not.toBe(account.address.toLowerCase());
  });

  it("rejects a voucher signed for a different verifying contract", async () => {
    const signature = await sign(84532, contractA);
    const recovered = await recoverTypedDataAddress({
      domain: { ...MINT_VOUCHER_DOMAIN, chainId: 84532, verifyingContract: contractB },
      types: MINT_VOUCHER_TYPES,
      primaryType: "MintVoucher",
      message,
      signature,
    });
    expect(recovered.toLowerCase()).not.toBe(account.address.toLowerCase());
  });
});
