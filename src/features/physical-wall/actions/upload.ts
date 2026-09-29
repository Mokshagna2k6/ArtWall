"use server";

import { headers } from "next/headers";

import { checkRateLimit } from "@/lib/rate-limit";
import {
  requestUgcUploadSignature as createUgcUploadSignature,
  type UgcUploadSignature,
} from "@/features/physical-wall/image-validation";

/**
 * A signature for one selfie upload, into the caller's own folder (BE-2.08).
 * Send every field back to Cloudinary, including `allowedFormats` as
 * `allowed_formats` (and `moderation` when present), or the upload is rejected.
 */
export async function requestUgcUploadSignature(): Promise<
  { ok: true; signature: UgcUploadSignature } | { ok: false; message: string }
> {
  // Per client IP. The key used to be the constant "pw-ugc-upload", which
  // made it 10 uploads an hour for the whole site, not per visitor.
  const ip = (await headers()).get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  const limit = checkRateLimit(`pw-ugc-upload:${ip}`, { limit: 10, windowMs: 60 * 60 * 1000 });
  if (!limit.ok) {
    return { ok: false, message: `Too many uploads. Try again in ${Math.ceil(limit.retryAfter / 60)} minutes.` };
  }

  try {
    const sig = await createUgcUploadSignature();
    return { ok: true, signature: sig };
  } catch {
    return { ok: false, message: "Uploads are unavailable right now." };
  }
}
