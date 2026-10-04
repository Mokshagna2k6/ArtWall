import { eq, and } from "drizzle-orm";

import { runCron } from "@/lib/cron";
import { db } from "@/lib/db/index";
import { merkleRoots } from "@/lib/db/schema";
import { commitPendingMerkleRoot } from "@/features/coa/merkle-commit";
import { submitRootOnChain, recordOnChainProvenance, retryFailedRoots } from "@/features/blockchain/gateway";
import { publicClientFor, DEFAULT_CHAIN_ID } from "@/lib/blockchain/chain";
import type { Hex } from "viem";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Roots already submitted on-chain but not yet confirmed: check for a
 *  mined receipt and, once found, record the provenance events (BC-1.12). */
async function confirmSubmittedRoots(): Promise<number> {
  const submitted = await db
    .select()
    .from(merkleRoots)
    .where(and(eq(merkleRoots.status, "submitted")))
    .limit(20);

  let confirmed = 0;
  for (const root of submitted) {
    if (!root.txHash) continue;
    try {
      const client = publicClientFor(root.chainId ?? DEFAULT_CHAIN_ID);
      const receipt = await client
        .getTransactionReceipt({ hash: root.txHash as Hex })
        .catch(() => null);
      if (!receipt || receipt.status !== "success") continue;
      await recordOnChainProvenance(root.id, root.txHash, Number(receipt.blockNumber));
      confirmed++;
    } catch (err) {
      console.error("[merkle-root] confirm", root.id, err instanceof Error ? err.message : err);
    }
  }
  return confirmed;
}

/**
 * Batch pending mint commitments into a Merkle root, store each leaf's proof
 * (mint_commitments.merkle_proof), then anchor the root on-chain via
 * ArtwallCOA.commitRoot (BC-1.11/1.12) so blockchainAnchored can later be
 * computed from a real committed_roots check, not merely a DB row. Also
 * confirms any previously-submitted root whose transaction has since mined.
 *
 * A re-used root (same leaves hashed into a root already submitted earlier)
 * is not re-submitted — submitRootOnChain itself is a no-op once the row's
 * status is already 'confirmed', and resubmitting a still-'submitted' root
 * harmlessly reverts on-chain (duplicate commit), which is logged, not
 * thrown: the batching succeeded regardless of the anchor's outcome.
 */
export async function GET(request: Request) {
  return runCron("merkle-root", request, async () => {
    const confirmed = await confirmSubmittedRoots();
    // BC-2.06: give previously-failed anchors (RPC outage, transient signer
    // error) another shot before batching a new root — same cron, bounded.
    const retried = await retryFailedRoots();

    const result = await commitPendingMerkleRoot();
    if (!result) return { processed: 0, errors: 0, root: null, confirmed, retried };

    let errors = 0;
    let onChain: { submitted: boolean; txHash?: string; error?: string } | null = null;
    if (!result.reused) {
      // submitRootOnChain never throws for an anchor failure (it marks the
      // row 'failed' and returns submitted: false) — this try/catch
      // is only for a genuinely unexpected throw (e.g. a DB error) that
      // submitRootOnChain's own error path didn't already handle.
      try {
        onChain = await submitRootOnChain(result.rootId);
        if (!onChain.submitted) errors = 1;
      } catch (err) {
        errors = 1;
        onChain = { submitted: false, error: err instanceof Error ? err.message : String(err) };
      }
    }

    return { processed: result.leafCount, errors, ...result, onChain, confirmed, retried };
  });
}
