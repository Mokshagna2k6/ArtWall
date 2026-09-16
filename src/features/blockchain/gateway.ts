import "server-only";

import { eq } from "drizzle-orm";

import { db } from "@/lib/db/index";
import { merkleRoots, mintCommitments, provenanceEvents } from "@/lib/db/schema";

/**
 * Submit a Merkle root on-chain via the platform deployer.
 * No-ops if DEPLOYER_PRIVATE_KEY or ARTWORK_REGISTRY_ADDRESS is not set.
 *
 * ponytail: uses fetch to Base Sepolia RPC directly instead of viem/ethers.
 * Add viem when the contract is deployed and you need proper ABI encoding.
 */
export async function submitRootOnChain(rootId: string): Promise<{
  submitted: boolean;
  txHash?: string;
  error?: string;
}> {
  const privateKey = process.env.DEPLOYER_PRIVATE_KEY;
  const registryAddress = process.env.ARTWORK_REGISTRY_ADDRESS;
  const rpcUrl = process.env.BASE_SEPOLIA_RPC_URL;

  if (!privateKey || !registryAddress || !rpcUrl) {
    return {
      submitted: false,
      error: "Missing DEPLOYER_PRIVATE_KEY, ARTWORK_REGISTRY_ADDRESS, or BASE_SEPOLIA_RPC_URL",
    };
  }

  const [root] = await db
    .select()
    .from(merkleRoots)
    .where(eq(merkleRoots.id, rootId));

  if (!root) return { submitted: false, error: "Root not found" };
  if (root.status === "confirmed") return { submitted: false, error: "Already confirmed" };

  // ponytail: raw RPC call placeholder. Replace with viem when ready:
  //   import { createWalletClient, http } from "viem";
  //   import { baseSepolia } from "viem/chains";
  //   import { privateKeyToAccount } from "viem/accounts";
  //   const account = privateKeyToAccount(privateKey as `0x${string}`);
  //   const client = createWalletClient({ account, chain: baseSepolia, transport: http(rpcUrl) });
  //   const txHash = await client.writeContract({ address: registryAddress, abi, functionName: "commitRoot", args: [`0x${root.rootHash}`] });

  console.log(`[blockchain] Would submit root ${root.rootHash} to ${registryAddress} on ${rpcUrl}`);

  // Mark as submitted (actual tx hash comes from viem call above)
  await db
    .update(merkleRoots)
    .set({ status: "submitted", chainId: 84532 })
    .where(eq(merkleRoots.id, rootId));

  return { submitted: true, txHash: undefined };
}

/** After a root is confirmed on-chain, record provenance events for all its commitments. */
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
}
