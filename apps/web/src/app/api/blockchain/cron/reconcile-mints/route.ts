import type { Address, Hex } from "viem";
import { getAddress } from "viem";
import { eq, and, lt, isNotNull } from "drizzle-orm";

import { expireCatalog } from "@/lib/catalog-cache";
import { deadline } from "@/lib/cron";
import { db } from "@/lib/db/index";
import { coaCertificates, artistProfiles } from "@/lib/db/schema";
import { verifyMintTx } from "@/lib/blockchain/chain";
import { runCron } from "@/lib/cron";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

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

  const until = deadline(maxDuration);
  let minted = 0;
  let failed = 0;
  let pending = 0;
  let errors = 0;

  for (const cert of stale) {
    if (Date.now() > until) break; // still "minting", reconciled next run
    try {
      let expected: { to: Address; uri: string } | undefined;
      if (cert.metadataUri) {
        const [profile] = await db
          .select({ walletAddress: artistProfiles.walletAddress })
          .from(artistProfiles)
          .where(eq(artistProfiles.userId, cert.userId));
        if (profile?.walletAddress) {
          expected = { to: getAddress(profile.walletAddress), uri: cert.metadataUri };
        }
      }

      const verdict = await verifyMintTx(
        cert.txHash as Hex,
        cert.chainId ?? undefined,
        expected,
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

  // Status shows on /verify and /artwork (catalogue cache, PERF-2.07).
  if (minted + failed > 0) expireCatalog();
  return { processed: stale.length, errors, scanned: stale.length, minted, failed, pending };
}
