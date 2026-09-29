import { NextResponse } from "next/server";
import { z } from "zod";

import { getCertificateProof } from "@/features/coa/merkle-commit";

export const dynamic = "force-dynamic";

const idSchema = z.string().trim().min(1).max(64);

/**
 * GET /api/coa/:certificateId/proof → { leaf, proof, root, rootStatus, verified }.
 * Public: the leaf and sibling hashes are published on-chain anyway, and hold
 * no personal data. 404 until the certificate's commitment is in a root.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const id = idSchema.safeParse((await params).id);
  if (!id.success) return NextResponse.json({ error: "Invalid certificate id" }, { status: 400 });
  try {
    const proof = await getCertificateProof(id.data);
    if (!proof) return NextResponse.json({ error: "No Merkle proof for this certificate yet" }, { status: 404 });
    return NextResponse.json(proof);
  } catch (error) {
    console.error("[coa] proof", error);
    return NextResponse.json({ error: "Could not load the proof" }, { status: 500 });
  }
}
