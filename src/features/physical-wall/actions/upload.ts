"use server";

import { checkRateLimit } from "@/lib/rate-limit";
import { requestUgcUploadSignature as createUgcUploadSignature } from "@/features/physical-wall/image-validation";

export async function requestUgcUploadSignature(): Promise<
  { ok: true; signature: { signature: string; timestamp: number; apiKey: string; cloudName: string; folder: string } } | { ok: false; message: string }
> {
  const limit = checkRateLimit("pw-ugc-upload", { limit: 10, windowMs: 60 * 60 * 1000 });
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
