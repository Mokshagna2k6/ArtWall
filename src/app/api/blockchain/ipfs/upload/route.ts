import { NextRequest, NextResponse } from "next/server";
import { pinata } from "@/lib/blockchain/pinata";
import { getApiUser } from "@/lib/blockchain/auth";
import { apiError, handleRouteError, requestId } from "@/lib/blockchain/http";
import { limitRequest, tooManyRequests } from "@/lib/rate-limit";
import { sniffImageType } from "@/lib/blockchain/file-sniff";
import { verifyCid } from "@/lib/blockchain/cid";

export const runtime = "nodejs";

const MAX_BYTES = 25 * 1024 * 1024;

export async function POST(req: NextRequest) {
  const reqId = requestId();
  try {
    const user = await getApiUser();
    if (!user) return apiError("unauthenticated", { reqId });

    // 20/hour per user: each call pushes up to 25 MB into paid Pinata storage.
    // Covers an artist uploading a whole series; stops storage-filling scripts.
    const rl = await limitRequest("ipfs-upload", { limit: 20, windowMs: 60 * 60 * 1000 }, user.id);
    if (!rl.ok) return tooManyRequests(rl, { error: { code: "rate_limited", reqId } });

    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File)) {
      return apiError("validation_failed", { reqId, details: "No file provided" });
    }
    if (file.size > MAX_BYTES) return apiError("payload_too_large", { reqId });

    // BC-1.20: the real file content decides the type, never the client-sent
    // file.type header, which anyone sending the request fully controls.
    const head = new Uint8Array(await file.slice(0, 32).arrayBuffer());
    const detected = sniffImageType(head);
    if (!detected) {
      return apiError("unsupported_media_type", { reqId });
    }

    const upload = await pinata.upload.public.file(file);

    // BC-2.08: don't trust the pinning provider's returned CID blindly —
    // re-derive it locally from the exact uploaded bytes and compare. A
    // mismatch means the pin does not actually correspond to what we sent
    // (compromised/misbehaving provider, or a UnixFS/dag-pb-wrapped CID
    // this function cannot re-derive); either way we must not hand back a
    // CID we have not verified corresponds to our bytes.
    const bytes = new Uint8Array(await file.arrayBuffer());
    const verdict = verifyCid(bytes, upload.cid);
    if (!verdict.verified) {
      console.error("[ipfs-upload] CID verification failed", { reqId, cid: upload.cid, reason: verdict.reason });
      return apiError("internal_error", { reqId, details: `CID verification failed: ${verdict.reason}` });
    }

    return NextResponse.json({ cid: upload.cid });
  } catch (err) {
    return handleRouteError(err, { route: "POST /api/blockchain/ipfs/upload", reqId });
  }
}
