import { NextRequest, NextResponse } from "next/server";
import { getAddress } from "viem";
import { eq, and } from "drizzle-orm";

import { db } from "@/lib/db/index";
import { expireCatalog } from "@/lib/catalog-cache";
import { coaCertificates, artistProfiles } from "@/lib/db/schema";
import { getApiUser } from "@/lib/blockchain/auth";
import { apiError, handleRouteError, requestId } from "@/lib/blockchain/http";
import { limitRequest, tooManyRequests } from "@/lib/rate-limit";
import { newVoucherNonce, signMintVoucher } from "@/lib/blockchain/mint-voucher";
import { getActiveCommissionPolicy } from "@/features/policy/commission";
import { canMint } from "@/features/policy/engine";
import { logPolicyDecision } from "@/features/policy/log";
import { loadTrustDimensions } from "@/features/policy/trust";
import { recordAudit } from "@/features/physical-wall/audit";

export const runtime = "nodejs";

const WALLET_RE = /^0x[0-9a-fA-F]{40}$/;

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const reqId = requestId();
  try {
    const user = await getApiUser();
    if (!user) return apiError("unauthenticated", { reqId });

    // 10/hour per user: a voucher is a server signature authorising an on-chain
    // mint. One per certificate is normal and a few retries after wallet errors
    // is generous; beyond that someone is farming signatures.
    const rl = await limitRequest("mint-voucher", { limit: 10, windowMs: 60 * 60 * 1000 }, user.id);
    if (!rl.ok) return tooManyRequests(rl, { error: { code: "rate_limited", reqId } });

    const { id } = await params;
    const [cert] = await db
      .select()
      .from(coaCertificates)
      .where(and(eq(coaCertificates.id, id), eq(coaCertificates.userId, user.id)));

    if (!cert) return apiError("not_found", { reqId });
    if (!cert.metadataUri) {
      return apiError("conflict", { reqId, details: "metadata not pinned yet" });
    }
    if (cert.status === "minted") {
      return apiError("conflict", { reqId, details: "already minted" });
    }
    // A voucher resets status to metadata_pinned; from 'revoked' that would
    // un-revoke the certificate. The DB guard (0029) refuses it too.
    if (cert.status === "revoked" || cert.status === "issued") {
      return apiError("conflict", { reqId, details: `cannot mint a ${cert.status} certificate` });
    }
    // BC-1.17: at most one active (unexpired) voucher per certificate. The
    // voucher's own on-chain deadline is the expiry; a certificate already
    // sitting in 'minting' has a voucher in flight (recorded via PATCH after
    // signing) and must not get a second, independent one.
    if (cert.status === "minting") {
      return apiError("conflict", { reqId, details: "a mint is already in progress for this certificate" });
    }

    // BE-3.03/BE-3.05: the PolicyEngine gate, reading from the five real trust
    // dimensions (never a collapsed status shortcut).
    const trust = await loadTrustDimensions(cert.artworkId);
    const decision = canMint({ trust, alreadyMinted: cert.status === "minted" });
    await logPolicyDecision({
      gate: "canMint",
      subjectType: "certificate",
      subjectId: id,
      actorId: user.id,
      decision,
      inputs: { trust, alreadyMinted: cert.status === "minted" },
    });
    if (!decision.allow) {
      return apiError("conflict", {
        reqId,
        details: `not eligible to mint: ${decision.reasons.join(", ")}`,
      });
    }

    // BC-1.15: recipient and royalty receiver come from verified DB state only
    // (the certificate owner's own registered wallet) — never from the
    // request body, which a client fully controls.
    const [profile] = await db
      .select({ walletAddress: artistProfiles.walletAddress })
      .from(artistProfiles)
      .where(eq(artistProfiles.userId, user.id));

    const wallet = profile?.walletAddress?.trim() ?? "";
    if (!WALLET_RE.test(wallet) || /^0x0{40}$/.test(wallet)) {
      return apiError("conflict", { reqId, details: "connect a wallet before minting" });
    }
    const to = getAddress(wallet);
    const royaltyReceiver = to; // same wallet receives the token and its royalties

    // BC-1.16: royalty bps from the real commission policy, never the request
    // body — a client cannot raise it, and the on-chain contract also caps it
    // (ArtwallCOA.MAX_ROYALTY_BPS) as a second line of defence.
    const { rateBps: royaltyFeeBps } = await getActiveCommissionPolicy("mint_royalty");

    const nonce = newVoucherNonce();
    const deadline = Math.floor(Date.now() / 1000) + 30 * 60;

    const { voucher, signature } = await signMintVoucher({
      to,
      uri: cert.metadataUri,
      royaltyReceiver,
      royaltyFeeBps,
      nonce,
      deadline,
    });

    await db
      .update(coaCertificates)
      .set({ mintNonce: nonce, status: "metadata_pinned", mintError: null })
      .where(eq(coaCertificates.id, id));
    expireCatalog();

    // SEC-2.11: a mint voucher is a server signature authorising an on-chain
    // mint — accountable the same way a refund or role grant is.
    await recordAudit({
      actor: user,
      action: "certificate.mint_voucher_issued",
      subjectType: "coa_certificate",
      subjectId: id,
      after: { to, royaltyReceiver, royaltyFeeBps, nonce, deadline },
    });

    return NextResponse.json({ voucher, signature });
  } catch (err) {
    return handleRouteError(err, { route: "POST /api/blockchain/certificates/[id]/mint-voucher", reqId });
  }
}
