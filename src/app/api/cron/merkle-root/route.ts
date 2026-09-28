import { NextResponse } from "next/server";

import { isCronAuthorized } from "@/lib/cron";
import { commitPendingMerkleRoot } from "@/features/coa/merkle-commit";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Batch pending mint commitments into a Merkle root and store each leaf's
 * proof (mint_commitments.merkle_proof). On-chain submission of the root is a
 * separate step (features/blockchain/gateway.ts).
 */
export async function GET(request: Request) {
  if (!isCronAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const result = await commitPendingMerkleRoot();
  if (!result) return NextResponse.json({ message: "No pending commitments", root: null });
  return NextResponse.json(result);
}
