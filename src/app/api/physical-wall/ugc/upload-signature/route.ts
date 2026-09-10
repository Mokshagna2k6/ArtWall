import { NextResponse } from "next/server";

import { requestUgcUploadSignature } from "@/features/physical-wall/actions/upload";

export const dynamic = "force-dynamic";

export async function POST() {
  const result = await requestUgcUploadSignature();
  if (!result.ok) {
    return NextResponse.json({ error: result.message }, { status: 400 });
  }
  return NextResponse.json({ ok: true, signature: result.signature });
}
