import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";

import { db } from "@/lib/db/index";
import { mintCommitments, merkleRoots } from "@/lib/db/schema";
import { buildMerkleTree } from "@/features/coa/merkle";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const pending = await db
    .select({ id: mintCommitments.id, leafHash: mintCommitments.leafHash })
    .from(mintCommitments)
    .where(eq(mintCommitments.status, "pending"));

  if (pending.length === 0) {
    return NextResponse.json({ message: "No pending commitments", root: null });
  }

  const leaves = pending.map((p) => p.leafHash);
  const { root } = buildMerkleTree(leaves);

  const rootId = `mr_${Date.now().toString(36)}`;
  await db.insert(merkleRoots).values({
    id: rootId,
    rootHash: root,
    leafCount: leaves.length,
    status: "pending",
  });

  // Link commitments to this root
  for (const p of pending) {
    await db
      .update(mintCommitments)
      .set({ status: "committed", merkleRootId: rootId })
      .where(eq(mintCommitments.id, p.id));
  }

  // ponytail: blockchain submission is a separate step (gateway).
  // This cron only builds the tree and stores the root.
  // The gateway cron submits the root on-chain when DEPLOYER_PRIVATE_KEY is set.

  return NextResponse.json({ root, rootId, leafCount: leaves.length });
}
