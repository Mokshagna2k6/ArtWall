import "server-only";

import { createWalletClient, http, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { eq } from "drizzle-orm";

import { db } from "@/lib/db/index";
import { merkleRoots, mintCommitments, provenanceEvents } from "@/lib/db/schema";
import { publicClientFor } from "@/lib/blockchain/chain";

export async function submitRootOnChain(rootId: string): Promise<{
  submitted: boolean;
  txHash?: string;
  error?: string;
}> {
  const privateKey = process.env.DEPLOYER_PRIVATE_KEY;
  const registryAddress = process.env.ARTWORK_REGISTRY_ADDRESS as `0x${string}` | undefined;
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

  const account = privateKeyToAccount(`0x${privateKey}` as Hex);
  const chain = publicClientFor(84532).chain;
  const client = createWalletClient({ account, chain, transport: http(rpcUrl) });

  // ponytail: ABI for commitRoot — single bytes32 arg
  const txHash = await client.writeContract({
    address: registryAddress,
    abi: [{
      type: "function",
      name: "commitRoot",
      stateMutability: "nonpayable",
      inputs: [{ name: "root", type: "bytes32" }],
      outputs: [],
    }] as const,
    functionName: "commitRoot",
    args: [`0x${root.rootHash}` as Hex],
  });

  await db
    .update(merkleRoots)
    .set({ status: "submitted", chainId: 84532, txHash })
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
}
