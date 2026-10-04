import "server-only";

import { createWalletClient, http, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { eq } from "drizzle-orm";

import { db } from "@/lib/db/index";
import { merkleRoots, mintCommitments, provenanceEvents } from "@/lib/db/schema";
import { publicClientFor, NFT_CONTRACT_ADDRESS, DEFAULT_CHAIN_ID } from "@/lib/blockchain/chain";
import { artwallCoaAbi } from "@/lib/blockchain/abi";
import { expireCatalog } from "@/lib/catalog-cache";

/**
 * Anchors a batched Merkle root on-chain via ArtwallCOA.commitRoot
 * (BC-1.11/1.12). Signs with the same platform signer key the mint-voucher
 * route uses — it holds SIGNER_ROLE on the deployed contract, which is what
 * commitRoot requires.
 */
export async function submitRootOnChain(rootId: string): Promise<{
  submitted: boolean;
  txHash?: string;
  error?: string;
}> {
  const privateKey = process.env.MINT_SIGNER_PRIVATE_KEY;
  const rpcUrl = process.env.BASE_SEPOLIA_RPC_URL;

  if (!privateKey || !NFT_CONTRACT_ADDRESS || !rpcUrl) {
    return {
      submitted: false,
      error: "Missing MINT_SIGNER_PRIVATE_KEY, NEXT_PUBLIC_NFT_CONTRACT_ADDRESS, or BASE_SEPOLIA_RPC_URL",
    };
  }

  const [root] = await db
    .select()
    .from(merkleRoots)
    .where(eq(merkleRoots.id, rootId));

  if (!root) return { submitted: false, error: "Root not found" };
  if (root.status === "confirmed") return { submitted: false, error: "Already confirmed" };

  const account = privateKeyToAccount(privateKey as Hex);
  const chain = publicClientFor(DEFAULT_CHAIN_ID).chain;
  const client = createWalletClient({ account, chain, transport: http(rpcUrl) });

  const txHash = await client.writeContract({
    address: NFT_CONTRACT_ADDRESS,
    abi: artwallCoaAbi,
    functionName: "commitRoot",
    args: [`0x${root.rootHash}` as Hex],
  });

  await db
    .update(merkleRoots)
    .set({ status: "submitted", chainId: DEFAULT_CHAIN_ID, txHash })
    .where(eq(merkleRoots.id, rootId));

  return { submitted: true, txHash };
}

export async function recordOnChainProvenance(rootId: string, txHash: string, blockNumber: number) {
  await db
    .update(merkleRoots)
    .set({ status: "confirmed", txHash, blockNumber })
    .where(eq(merkleRoots.id, rootId));

  const commitments = await db
    .select({ id: mintCommitments.id, artworkId: mintCommitments.artworkId, userId: mintCommitments.userId })
    .from(mintCommitments)
    .where(eq(mintCommitments.merkleRootId, rootId));

  for (const c of commitments) {
    const provId = `prov_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
    await db.insert(provenanceEvents).values({
      id: provId,
      artworkId: c.artworkId,
      eventType: "minted",
      actorId: c.userId,
      label: "On-chain root confirmed",
      metadata: { txHash, blockNumber, merkleRootId: rootId },
      txHash,
    });
  }
  expireCatalog(); // provenance timelines on /artwork and /verify
}
