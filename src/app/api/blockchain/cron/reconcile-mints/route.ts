import type { Hex } from "viem";
import { eq, and, lt, isNotNull } from "drizzle-orm";

import { db } from "@/lib/db/index";
import { coaCertificates } from "@/lib/db/schema";
import { verifyMintTx } from "@/lib/blockchain/chain";
import { runCron } from "@/lib/cron";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Auth moved into runCron: the old inline check compared the header with !==
// (not constant-time); isCronAuthorized uses timingSafeEqual like the others.
export async function GET(request: Request) {
  return runCron("reconcile-mints", request, reconcile);
}

async function reconcile() {
  const stale = await db
    .select()
    .from(coaCertificates)
    .where(
      and(
        eq(coaCertificates.status, "minting"),
        isNotNull(coaCertificates.txHash),
        lt(coaCertificates.mintRequestedAt, new Date(Date.now() - 2 * 60 * 1000)),
      ),
    )
    .limit(50);

  let minted = 0;
  let failed = 0;
  let pending = 0;
  let errors = 0;

  for (const cert of stale) {
    try {
      const verdict = await verifyMintTx(
        cert.txHash as Hex,
        cert.chainId ?? undefined,
      );
      if (verdict.state === "pending") {
        pending++;
        continue;
      }
      if (verdict.state === "failed") {
        await db
          .update(coaCertificates)
          .set({ status: "failed", mintError: verdict.reason })
          .where(eq(coaCertificates.id, cert.id));
        failed++;
      } else {
        await db
          .update(coaCertificates)
          .set({
            status: "minted",
            tokenId: verdict.tokenId,
            contractAddr: verdict.contractAddr,
            chainId: verdict.chainId,
            mintedAt: new Date(),
          })
          .where(eq(coaCertificates.id, cert.id));
        minted++;
      }
    } catch (err) {
      errors++;
      console.error("[reconcile]", cert.id, err instanceof Error ? err.message : err);
    }
  }

  return { processed: stale.length, errors, scanned: stale.length, minted, failed, pending };
}
