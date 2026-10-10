import "server-only";
import { privateKeyToAccount } from "viem/accounts";
import { toHex, type Address } from "viem";
import { MINT_VOUCHER_DOMAIN, MINT_VOUCHER_TYPES } from "@/lib/blockchain/abi";
import { NFT_CONTRACT_ADDRESS, DEFAULT_CHAIN_ID } from "@/lib/blockchain/chain";

const key = process.env.MINT_SIGNER_PRIVATE_KEY;
if (!key) console.warn("[mint-voucher] MINT_SIGNER_PRIVATE_KEY is not set");

const account = key ? privateKeyToAccount(key as `0x${string}`) : null;

export interface MintVoucher {
  to: Address;
  uri: string;
  royaltyReceiver: Address;
  royaltyFeeBps: number;
  nonce: `0x${string}`;
  deadline: number;
}

export function newVoucherNonce(): `0x${string}` {
  return toHex(crypto.getRandomValues(new Uint8Array(32)));
}

export async function signMintVoucher(v: MintVoucher): Promise<{
  voucher: MintVoucher;
  signature: `0x${string}`;
}> {
  if (!account) throw new Error("mint signer not configured");

  const signature = await account.signTypedData({
    domain: {
      ...MINT_VOUCHER_DOMAIN,
      chainId: DEFAULT_CHAIN_ID,
      verifyingContract: NFT_CONTRACT_ADDRESS,
    },
    types: MINT_VOUCHER_TYPES,
    primaryType: "MintVoucher",
    message: {
      to: v.to,
      uri: v.uri,
      royaltyReceiver: v.royaltyReceiver,
      royaltyFeeBps: BigInt(v.royaltyFeeBps),
      nonce: v.nonce,
      deadline: BigInt(v.deadline),
    },
  });

  return { voucher: v, signature };
}
