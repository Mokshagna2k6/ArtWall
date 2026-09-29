import { NextRequest, NextResponse } from "next/server";
import type { Hex } from "viem";
import { eq, and, lt, isNotNull } from "drizzle-orm";

import { expireCatalog } from "@/lib/catalog-cache";
import { deadline } from "@/lib/cron";
import { db } from "@/lib/db/index";
import { coaCertificates } from "@/lib/db/schema";
import { verifyMintTx } from "@/lib/blockchain/chain";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

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

  for (const cert of stale) {
    if (Date.now() > until) break; // still "minting", reconciled next run
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
      console.error("[reconcile]", cert.id, err instanceof Error ? err.message : err);
    }
  }

  // Status shows on /verify and /artwork (catalogue cache, PERF-2.07).
  if (minted + failed > 0) expireCatalog();
  return NextResponse.json({ scanned: stale.length, minted, failed, pending });
}
