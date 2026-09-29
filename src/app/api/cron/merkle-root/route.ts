import { runCron } from "@/lib/cron";
import { commitPendingMerkleRoot } from "@/features/coa/merkle-commit";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Batch pending mint commitments into a Merkle root and store each leaf's
 * proof (mint_commitments.merkle_proof). On-chain submission of the root is a
 * separate step (features/blockchain/gateway.ts).
 */
export async function GET(request: Request) {
  return runCron("merkle-root", request, async () => {
    const result = await commitPendingMerkleRoot();
    return result
      ? { processed: result.leafCount, errors: 0, ...result }
      : { processed: 0, errors: 0, root: null };
  });
}
