import { NextRequest, NextResponse } from "next/server";
import { pinata } from "@/lib/blockchain/pinata";
import { getApiUser } from "@/lib/blockchain/auth";
import { apiError, handleRouteError, requestId } from "@/lib/blockchain/http";
import { limitRequest, tooManyRequests } from "@/lib/rate-limit";

export const runtime = "nodejs";

const MAX_BYTES = 25 * 1024 * 1024;
const ALLOWED_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "image/tiff",
  "image/avif",
]);

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
    if (!ALLOWED_TYPES.has(file.type)) {
      return apiError("unsupported_media_type", { reqId });
    }

    const upload = await pinata.upload.public.file(file);
    return NextResponse.json({ cid: upload.cid });
  } catch (err) {
    return handleRouteError(err, { route: "POST /api/blockchain/ipfs/upload", reqId });
  }
}
