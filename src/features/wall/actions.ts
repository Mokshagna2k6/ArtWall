"use server";

import { updateTag } from "next/cache";
import { headers } from "next/headers";

import { WALL_TAG } from "@/features/wall/data";
import {
  publishSchema,
  type PublishInput,
  type PublishState,
} from "@/features/wall/schema";
import { publishArtwork, searchWallTiles } from "@/features/wall/store";
import { WALL_UPLOAD_FOLDER, type WallTile } from "@/features/wall/types";
import { ROSTER_TAG } from "@/features/waitlist/roster";
import {
  createUploadSignature,
  fetchModerationVerdict,
  isOwnAsset,
  type UploadSignature,
} from "@/lib/cloudinary";
import { DatabaseNotConfiguredError } from "@/lib/db";
import { checkRateLimit } from "@/lib/rate-limit";
import { getSessionUser } from "@/lib/session";

/** Uploads are far heavier than a form post, so the ceiling is lower. */
const UPLOAD_LIMIT = { limit: 8, windowMs: 10 * 60 * 1000 };
const PUBLISH_LIMIT = { limit: 4, windowMs: 10 * 60 * 1000 };
const SEARCH_LIMIT = { limit: 40, windowMs: 60 * 1000 };

async function clientKey(): Promise<string> {
  const headerList = await headers();
  const forwarded = headerList.get("x-forwarded-for");
  return (
    forwarded?.split(",")[0]?.trim() || headerList.get("x-real-ip") || "unknown"
  );
}

/**
 * Mint a short-lived signature so the browser can upload straight to
 * Cloudinary.
 *
 * Rate limited because this is, in effect, a write token to our media account.
 * The signature is scoped to one folder and expires with its timestamp, so the
 * worst a leaked one buys is a handful of files in a folder we already watch.
 */
export async function requestUploadSignature(): Promise<
  { ok: true; signature: UploadSignature } | { ok: false; message: string }
> {
  if (!(await getSessionUser())) {
    return { ok: false, message: "Please sign in to upload your work." };
  }

  const limit = checkRateLimit(`upload:${await clientKey()}`, UPLOAD_LIMIT);
  if (!limit.ok) {
    return {
      ok: false,
      message: `Too many uploads. Try again in ${Math.ceil(limit.retryAfter / 60)} minutes.`,
    };
  }

  try {
    return { ok: true, signature: createUploadSignature(WALL_UPLOAD_FOLDER) };
  } catch (error) {
    console.error("[wall] Cloudinary is not configured", error);
    return {
      ok: false,
      message: "Uploads are unavailable right now. Please try again later.",
    };
  }
}

/**
 * Hang a work on the wall.
 *
 * Security posture, in the order it matters:
 *  - Everything is re-validated server-side. The browser uploaded the image
 *    directly, so the URL and public_id arriving here were chosen by the
 *    client and are assumed hostile.
 *  - `isOwnAsset` rejects any URL that is not in our own Cloudinary cloud and
 *    inside the folder we signed. Without it, anyone could POST a link to an
 *    arbitrary image on the internet and have it published under their name.
 *  - The moderation verdict is re-fetched from Cloudinary rather than taken
 *    from the form, and a rejected image is stored hidden. The artist is told
 *    it is under review - not that they were flagged, which would be both
 *    accusatory and useless if the classifier was wrong.
 *  - Rate limited, honeypotted, and CSRF-protected by Server Actions' own
 *    origin checking.
 */
export async function publishToWall(
  _previous: PublishState,
  formData: FormData
): Promise<PublishState> {
  // Hanging a work requires an account. The form is only rendered to signed-in
  // artists, but a Server Action is a public endpoint, so this is the check
  // that actually holds.
  const user = await getSessionUser();
  if (!user) {
    return {
      status: "error",
      message: "Please sign in to hang your work on the wall.",
    };
  }

  const raw = {
    ...(Object.fromEntries(formData) as Record<string, unknown>),
    // Bind the roster row to the verified account, not to whatever address was
    // typed in. One account, one place.
    email: user.email,
  };
  const parsed = publishSchema.safeParse(raw);

  if (!parsed.success) {
    const fieldErrors: Partial<Record<keyof PublishInput, string>> = {};
    for (const issue of parsed.error.issues) {
      const field = issue.path[0] as keyof PublishInput | undefined;
      if (field && !fieldErrors[field]) fieldErrors[field] = issue.message;
    }
    return {
      status: "error",
      message: "Please check the highlighted fields.",
      fieldErrors,
    };
  }

  const data = parsed.data;

  // Honeypot: answer like success so bots learn nothing, persist nothing.
  if (data.website) {
    return {
      status: "success",
      founderNumber: 0,
      name: data.name,
      hidden: false,
    };
  }

  const limit = checkRateLimit(`publish:${await clientKey()}`, PUBLISH_LIMIT);
  if (!limit.ok) {
    return {
      status: "error",
      message: `Too many submissions. Try again in ${Math.ceil(limit.retryAfter / 60)} minutes.`,
    };
  }

  // The image must genuinely be ours.
  if (!isOwnAsset(data.artworkUrl, WALL_UPLOAD_FOLDER)) {
    console.warn("[wall] Rejected a foreign artwork URL");
    return {
      status: "error",
      message: "That image could not be verified. Please upload it again.",
    };
  }

  const hasSelfie = Boolean(data.selfieUrl && data.selfiePublicId);
  if (hasSelfie && !isOwnAsset(data.selfieUrl!, WALL_UPLOAD_FOLDER)) {
    console.warn("[wall] Rejected a foreign selfie URL");
    return {
      status: "error",
      message: "That photo could not be verified. Please upload it again.",
    };
  }

  // Ask Cloudinary directly what its classifier decided.
  const verdicts = await Promise.all([
    fetchModerationVerdict(data.artworkPublicId),
    hasSelfie
      ? fetchModerationVerdict(data.selfiePublicId!)
      : Promise.resolve("none" as const),
  ]);
  const rejected = verdicts.includes("rejected");

  try {
    const { founderNumber } = await publishArtwork({
      userId: user.id,
      foundingMember: formData.get("foundingMember") === "on",
      name: data.name,
      email: data.email,
      city: data.city || undefined,
      practice: data.practice,
      artworkUrl: data.artworkUrl,
      artworkPublicId: data.artworkPublicId,
      artworkWidth: data.artworkWidth,
      artworkHeight: data.artworkHeight,
      selfieUrl: hasSelfie ? data.selfieUrl! : null,
      selfiePublicId: hasSelfie ? data.selfiePublicId! : null,
      artworkTitle: data.artworkTitle || null,
      quote: data.quote || null,
      status: rejected ? "hidden" : "visible",
      userAgent: (await headers()).get("user-agent"),
    });

    // Read-your-own-writes: the artist must see their own work on the wall on
    // the very next render, which is the entire promise of "instantly".
    updateTag(WALL_TAG);
    updateTag(ROSTER_TAG);

    return {
      status: "success",
      founderNumber,
      name: data.name,
      hidden: rejected,
    };
  } catch (error) {
    if (error instanceof DatabaseNotConfiguredError) {
      console.error("[wall] DATABASE_URL is not set, nothing was saved.");
    } else {
      console.error("[wall] Failed to publish", error);
    }
    return {
      status: "error",
      message: "We couldn't hang your work just now. Please try again.",
    };
  }
}

/**
 * Find an artist on the wall.
 *
 * A server action rather than a route handler so the query never becomes a
 * shareable URL - searching for your own name should not leave a link in
 * someone's history that says who you were looking for.
 */
export async function searchWall(
  query: string
): Promise<{ tiles: WallTile[]; limited: boolean }> {
  if (query.trim().length < 2) return { tiles: [], limited: false };

  const limit = checkRateLimit(`wallsearch:${await clientKey()}`, SEARCH_LIMIT);
  if (!limit.ok) return { tiles: [], limited: true };

  return { tiles: await searchWallTiles(query), limited: false };
}
