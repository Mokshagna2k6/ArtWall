"use server";

import { features } from "@/config/site";
import { limitRequest, retryIn, type RateLimitResult } from "@/lib/rate-limit";
import { getSessionUser } from "@/lib/session";
import {
  requestUgcUploadSignature as createUgcUploadSignature,
  type UgcUploadSignature,
} from "@/features/physical-wall/image-validation";

/**
 * 10 signatures per hour per visitor (user id when signed in, else IP). A
 * signature is a write token for our Cloudinary account; a selfie plus a few
 * retakes fits, a script filling the account does not. (This used to be one
 * global bucket shared by every visitor.)
 */
const UGC_SIGNATURE_LIMIT = { limit: 10, windowMs: 60 * 60 * 1000 };

export async function requestUgcUploadSignature(): Promise<
  { ok: true; signature: UgcUploadSignature } | { ok: false; message: string; rateLimit?: RateLimitResult }
> {
  if (!features.physicalWall) return { ok: false, message: "Uploads are unavailable right now." };
  const user = await getSessionUser();
  const limit = await limitRequest("pw-ugc-upload", UGC_SIGNATURE_LIMIT, user?.id);
  if (!limit.ok) {
    return { ok: false, message: `Too many uploads. Try again in ${retryIn(limit)}.`, rateLimit: limit };
  }

  try {
    const sig = await createUgcUploadSignature();
    return { ok: true, signature: sig };
  } catch {
    return { ok: false, message: "Uploads are unavailable right now." };
  }
}
