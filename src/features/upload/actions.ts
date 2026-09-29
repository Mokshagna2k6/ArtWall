"use server";

import { headers } from "next/headers";
import { z } from "zod";

import { createUploadSignature } from "@/lib/cloudinary";
import { checkRateLimit } from "@/lib/rate-limit";

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

async function clientKey(): Promise<string> {
  const headerList = await headers();
  return (
    headerList.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    headerList.get("x-real-ip") ||
    "unknown"
  );
}

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
  // The folder is built from this argument, and a Server Action argument is
  // whatever the caller sends: without the enum, getUploadSignature("wall")
  // or ("ugc/<someone's folder>") signed uploads into folders this action was
  // never meant to reach.
  const parsed = z.enum(["artwork", "selfie"]).safeParse(kind);
  if (!parsed.success) return { ok: false, message: "Unknown upload type." };

  const limit = checkRateLimit(`upload:${await clientKey()}`, {
    limit: 10,
    windowMs: 10 * 60 * 1000,
  });

  if (!limit.ok) {
    return {
      ok: false,
      message: `Too many uploads. Try again in ${Math.ceil(limit.retryAfter / 60)} minutes.`,
    };
  }

  try {
    const signed = createUploadSignature(`artwall/${parsed.data}`);
    return { ok: true, ...signed };
  } catch (error) {
    console.error("[upload] Could not create signature", error);
    return {
      ok: false,
      message: "Uploads aren't available right now. Please try again shortly.",
    };
  }
}
