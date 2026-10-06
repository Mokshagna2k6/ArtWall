import "server-only";

import { createWalletClient, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { eq } from "drizzle-orm";

import { db } from "@/lib/db/index";
import { merkleRoots, mintCommitments, provenanceEvents } from "@/lib/db/schema";
import { chainFor, resilientTransport, NFT_CONTRACT_ADDRESS, DEFAULT_CHAIN_ID } from "@/lib/blockchain/chain";
import { artwallCoaAbi } from "@/lib/blockchain/abi";
import { expireCatalog } from "@/lib/catalog-cache";

/**
 * Anchors a batched Merkle root on-chain via ArtwallCOA.commitRoot
 * (BC-1.11/1.12). Signs with the same platform signer key the mint-voucher
 * route uses — it holds SIGNER_ROLE on the deployed contract, which is what
 * commitRoot requires.
 *
 * BC-2.06: on any failure to submit (missing config, every RPC endpoint
 * down, a reverted/rejected tx), the root is marked 'failed' instead
 * of being left at 'pending' forever — commitPendingMerkleRoot() never
 * re-batches it (its leaves are already 'committed', not 'pending'), so a
 * silently-stuck 'pending' row would otherwise never be retried or even be
 * visible as broken. 'failed' is picked back up by retryFailedRoots().
 */
export async function submitRootOnChain(rootId: string): Promise<{
  submitted: boolean;
  txHash?: string;
  error?: string;
}> {
  const privateKey = process.env.MINT_SIGNER_PRIVATE_KEY;

  if (!privateKey || !NFT_CONTRACT_ADDRESS) {
    const error = "Missing MINT_SIGNER_PRIVATE_KEY or NEXT_PUBLIC_NFT_CONTRACT_ADDRESS";
    await markAnchorFailed(rootId, error);
    return { submitted: false, error };
  }

  const [root] = await db
    .select()
    .from(merkleRoots)
    .where(eq(merkleRoots.id, rootId));

  if (!root) return { submitted: false, error: "Root not found" };
  if (root.status === "confirmed") return { submitted: false, error: "Already confirmed" };

  try {
    const account = privateKeyToAccount(privateKey as Hex);
    // Reuses chain.ts's retry+fallback transport (BC-2.06) rather than a
    // single bare RPC URL, so root anchoring gets the same RPC resilience
    // as mint verification.
    const client = createWalletClient({
      account,
      chain: chainFor(DEFAULT_CHAIN_ID),
      transport: resilientTransport(DEFAULT_CHAIN_ID),
    });

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
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    await markAnchorFailed(rootId, error);
    return { submitted: false, error };
  }
}

async function markAnchorFailed(rootId: string, reason: string) {
  await db
    .update(merkleRoots)
    .set({ status: "failed" })
    .where(eq(merkleRoots.id, rootId));
  console.error("[gateway] submitRootOnChain failed, root marked 'failed' for retry", rootId, reason);
}

/** BC-2.06: roots stuck at 'failed' get one more submit attempt per
 *  cron run (bounded, so a persistently broken signer/RPC doesn't retry
 *  unboundedly fast) — a fresh RPC outage or a transient nonce/gas issue
 *  resolves on its own without the batch's leaves staying unanchored. */
export async function retryFailedRoots(limit = 5): Promise<number> {
  const failed = await db
    .select({ id: merkleRoots.id })
    .from(merkleRoots)
    .where(eq(merkleRoots.status, "failed"))
    .limit(limit);

  let retried = 0;
  for (const row of failed) {
    const result = await submitRootOnChain(row.id);
    if (result.submitted) retried++;
  }
  return retried;
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
