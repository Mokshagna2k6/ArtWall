"use server";

import { createUploadSignature } from "@/lib/cloudinary";
import { limitRequest, retryIn } from "@/lib/rate-limit";
import { getSessionUser } from "@/lib/session";

export type SignatureResult =
  | {
      ok: true;
      signature: string;
      timestamp: number;
      apiKey: string;
      cloudName: string;
      folder: string;
    }
  | { ok: false; message: string };

/**
 * Mint a short-lived signature so the browser can upload straight to Cloudinary.
 *
 * Rate limited because a signature is permission to write to our Cloudinary
 * account. Without a limit, a script could mint thousands and fill the account.
 * Ten per ten minutes comfortably covers an artist uploading art plus a selfie,
 * retrying a couple of times.
 *
 * The signature only authorises an upload into a fixed folder and expires with
 * its timestamp, so a leaked one is near-worthless.
 */
export async function getUploadSignature(
  kind: "artwork" | "selfie"
): Promise<SignatureResult> {
  const user = await getSessionUser();
  const limit = await limitRequest(
    "upload-signature",
    { limit: 10, windowMs: 10 * 60 * 1000 },
    user?.id
  );

  if (!limit.ok) {
    return {
      ok: false,
      message: `Too many uploads. Try again in ${retryIn(limit)}.`,
    };
  }

  try {
    const signed = createUploadSignature(`artwall/${kind}`);
    return { ok: true, ...signed };
  } catch (error) {
    console.error("[upload] Could not create signature", error);
    return {
      ok: false,
      message: "Uploads aren't available right now. Please try again shortly.",
    };
  }
}
