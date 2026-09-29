import { NextResponse } from "next/server";

import { physicalWallEnabled } from "@/features/physical-wall/feature-gate";

import { requestUgcUploadSignature } from "@/features/physical-wall/actions/upload";
import { tooManyRequests } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

const disabled = () =>
  physicalWallEnabled() ? null : NextResponse.json({ error: "Not found" }, { status: 404 });

export async function POST() {
  const off = disabled();
  if (off) return off;
  const result = await requestUgcUploadSignature();
  if (!result.ok) {
    if (result.rateLimit) return tooManyRequests(result.rateLimit, { error: result.message });
    return NextResponse.json({ error: result.message }, { status: 400 });
  }
  return NextResponse.json({ ok: true, signature: result.signature });
}
