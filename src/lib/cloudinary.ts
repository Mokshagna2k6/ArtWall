import "server-only";

import { createHash } from "node:crypto";

import { v2 as cloudinarySdk } from "cloudinary";

export class CloudinaryNotConfiguredError extends Error {
  constructor() {
    super("Cloudinary environment variables are not set.");
    this.name = "CloudinaryNotConfiguredError";
  }
}

/**
 * SEC-2.07: every upload path on the site (artwork, selfie/UGC, wall tile,
 * condition photo, identity document) is a photo. One shared allow-list, so
 * `allowed_formats` is never left off a signature by omission the way the
 * artwork/wall/condition folders previously were (only the UGC folder passed
 * it). Cloudinary rejects the upload server-side if the actual file doesn't
 * match, on top of our own magic-byte check for paths that see the bytes.
 */
export const IMAGE_UPLOAD_FORMATS = ["jpg", "jpeg", "png", "webp", "heic", "gif"] as const;

/**
 * Signed direct uploads, without the Cloudinary SDK.
 *
 * Why signed and not an unsigned preset: an unsigned preset is a public write
 * token. Anyone who views source can push arbitrary files into your account
 * until it is disabled. Signing costs one short server round-trip and means
 * only requests our server blessed will be accepted.
 *
 * Why direct-to-Cloudinary and not through our own route: a multi-megabyte
 * photo would otherwise occupy a serverless function for the whole upload,
 * burning execution time and hitting body-size limits. The browser talks to
 * Cloudinary; our server only ever handles a small JSON signature.
 *
 * No SDK dependency: the signature is a SHA-1 of sorted params plus the secret.
 * That is the entire algorithm, and `node:crypto` already ships it - pulling in
 * the SDK for this would be an unjustified dependency.
 */
export interface UploadSignature {
  signature: string;
  timestamp: number;
  apiKey: string;
  cloudName: string;
  folder: string;
  /** Present only when moderation is enabled; must be sent with the upload. */
  moderation?: string;
  /**
   * Present only when the signer restricted file types; must be sent with the
   * upload as `allowed_formats`. Cloudinary rejects any other format.
   */
  allowedFormats?: string;
  /**
   * Present only for a private delivery type (SEC-2.08: identity documents
   * upload as `type: "authenticated"`); must be sent with the upload as
   * `type`. Omitted entirely for the default public `type: "upload"` every
   * other asset in this project uses, so existing callers see no change.
   */
  type?: string;
}

interface CloudinaryCredentials {
  cloudName: string;
  apiKey: string;
  apiSecret: string;
}

/**
 * Credentials, from either shape Cloudinary hands out.
 *
 * Their console gives you a single `CLOUDINARY_URL` of the form
 * `cloudinary://<api_key>:<api_secret>@<cloud_name>`, and that is what most
 * people paste into their environment - including this project. Reading it
 * here means the app works with the variable you already have, and the split
 * `CLOUDINARY_API_KEY` / `_SECRET` form still wins if it is set, so a
 * deployment can override one credential without restating the whole URL.
 */
function readCredentials(): CloudinaryCredentials {
  let cloudName = process.env.CLOUDINARY_CLOUD_NAME;
  let apiKey = process.env.CLOUDINARY_API_KEY;
  let apiSecret = process.env.CLOUDINARY_API_SECRET;

  const url = process.env.CLOUDINARY_URL;
  if (url && (!cloudName || !apiKey || !apiSecret)) {
    try {
      const parsed = new URL(url);
      cloudName ||= decodeURIComponent(parsed.hostname);
      apiKey ||= decodeURIComponent(parsed.username);
      apiSecret ||= decodeURIComponent(parsed.password);
    } catch {
      // A malformed CLOUDINARY_URL is not worth crashing on - fall through to
      // the missing-credentials error below, which says something actionable.
    }
  }

  if (!cloudName || !apiKey || !apiSecret) {
    throw new CloudinaryNotConfiguredError();
  }

  return { cloudName, apiKey, apiSecret };
}

/** The cloud name alone, for building delivery URLs on the server. */
export function getCloudName(): string | null {
  try {
    return readCredentials().cloudName;
  } catch {
    return (
      process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME ??
      process.env.CLOUDINARY_CLOUD_NAME ??
      null
    );
  }
}

/**
 * Which moderation add-on to ask Cloudinary to run, if any.
 *
 * Deliberately opt-in through the environment. Sending `moderation=aws_rek`
 * when the add-on is not enabled on the account makes Cloudinary reject the
 * upload outright - so defaulting it on would break every upload for anyone
 * who has not subscribed. Unset means uploads simply are not machine-checked,
 * and the admin takedown route remains the backstop.
 */
export function moderationKind(): string | undefined {
  return process.env.CLOUDINARY_MODERATION?.trim() || undefined;
}

function sign(params: Record<string, string>, apiSecret: string): string {
  // Cloudinary signs the alphabetically sorted, &-joined param string.
  // Every param sent with the upload must be included here or it is rejected.
  const toSign = Object.keys(params)
    .sort()
    .map((key) => `${key}=${params[key]}`)
    .join("&");

  return createHash("sha1").update(`${toSign}${apiSecret}`).digest("hex");
}

export function createUploadSignature(
  folder: string,
  options: { allowedFormats?: readonly string[]; type?: string } = {}
): UploadSignature {
  const { cloudName, apiKey, apiSecret } = readCredentials();
  const timestamp = Math.floor(Date.now() / 1000);
  const moderation = moderationKind();
  const allowedFormats = options.allowedFormats?.join(",");

  const params: Record<string, string> = {
    folder,
    timestamp: String(timestamp),
  };
  if (moderation) params.moderation = moderation;
  if (allowedFormats) params.allowed_formats = allowedFormats;
  if (options.type) params.type = options.type;

  return {
    signature: sign(params, apiSecret),
    timestamp,
    apiKey,
    cloudName,
    folder,
    moderation,
    allowedFormats,
    type: options.type,
  };
}

/**
 * Is this URL genuinely an asset in our own Cloudinary account?
 *
 * The browser uploads directly and then tells our server the resulting URL, so
 * that URL is attacker-controlled input: without this check anyone could POST
 * a link to any image anywhere on the internet and have it hung on the public
 * wall under their name. Host and cloud name must both match, and the path
 * must sit inside the folder we signed for.
 */
export function isOwnAsset(url: string, folder: string): boolean {
  const cloudName = getCloudName();
  if (!cloudName) return false;

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }

  return (
    parsed.protocol === "https:" &&
    parsed.hostname === "res.cloudinary.com" &&
    parsed.pathname.startsWith(`/${cloudName}/`) &&
    parsed.pathname.includes(`/${folder}/`)
  );
}

export type ModerationVerdict = "approved" | "rejected" | "pending" | "none";

/**
 * Ask Cloudinary what its moderation add-on decided about an asset.
 *
 * Deliberately re-asked server-side. The browser also receives the verdict in
 * the upload response and posts it back to us, but that value is trivially
 * editable in devtools - trusting it would mean the moderation layer could be
 * switched off by anyone motivated enough to open the network tab. This costs
 * one Admin API call per upload and makes the check real.
 *
 * Failure is reported as `pending` rather than `approved`: if we cannot reach
 * Cloudinary we should not be asserting that an image is clean.
 */
export async function fetchModerationVerdict(
  publicId: string
): Promise<ModerationVerdict> {
  if (!moderationKind()) return "none";

  let credentials: CloudinaryCredentials;
  try {
    credentials = readCredentials();
  } catch {
    return "pending";
  }

  const { cloudName, apiKey, apiSecret } = credentials;
  const auth = Buffer.from(`${apiKey}:${apiSecret}`).toString("base64");

  try {
    const response = await fetch(
      `https://api.cloudinary.com/v1_1/${cloudName}/resources/image/upload/${encodeURIComponent(
        publicId
      )}?moderations=true`,
      {
        headers: { Authorization: `Basic ${auth}` },
        signal: AbortSignal.timeout(8_000),
        cache: "no-store",
      }
    );

    if (!response.ok) return "pending";

    const data = (await response.json()) as {
      moderation?: { status?: string }[];
    };
    const status = data.moderation?.[0]?.status;

    if (status === "rejected") return "rejected";
    if (status === "approved") return "approved";
    return "pending";
  } catch {
    return "pending";
  }
}

/**
 * Remove an asset. Used when a tile is taken down, so hidden images do not sit
 * in the account indefinitely - and so a takedown request can be honoured
 * properly rather than merely hidden from the UI.
 */
export async function destroyAsset(publicId: string): Promise<void> {
  const { cloudName, apiKey, apiSecret } = readCredentials();
  const timestamp = Math.floor(Date.now() / 1000);

  const signature = sign(
    { public_id: publicId, timestamp: String(timestamp) },
    apiSecret
  );

  const body = new URLSearchParams({
    public_id: publicId,
    timestamp: String(timestamp),
    api_key: apiKey,
    signature,
  });

  const response = await fetch(
    `https://api.cloudinary.com/v1_1/${cloudName}/image/destroy`,
    { method: "POST", body, signal: AbortSignal.timeout(10_000) }
  );

  if (!response.ok) {
    throw new Error(`Cloudinary destroy failed: ${response.status}`);
  }
}

/**
 * Where identity documents (government ID uploads) live. SEC-2.08: uploaded
 * with `type: "authenticated"` (readIdentityUploadOptions below), so the
 * asset is never resolvable by its public id alone - only through a signed,
 * expiring URL minted here and handed out by an owner/admin-gated route.
 */
export const IDENTITY_DOC_FOLDER = "artwall/identity";

/** Pass as `type` to {@link createUploadSignature} for an identity document. */
export const IDENTITY_DELIVERY_TYPE = "authenticated";

/**
 * A short-lived signed URL for a private (`type: "authenticated"`) asset.
 *
 * Uses the official Cloudinary SDK's `private_download_url`, which calls
 * Cloudinary's Admin API `/download` endpoint with an `expires_at` Cloudinary
 * itself enforces - this is a genuinely time-limited URL, not merely an HMAC
 * we compute and hope is honoured. (Cloudinary's other private-asset signing
 * path, `url({ sign_url: true })`, only adds a permanent signature; making it
 * time-limited needs a separate "auth token" key configured on the account,
 * which this project does not have, so it is not used here.)
 *
 * Deliberately not wired through global `cloudinary.config()` - credentials
 * are passed per call, same as every other function in this file, so there is
 * no hidden mutable SDK state shared across requests.
 */
export async function createSignedIdentityViewUrl(
  publicId: string,
  options: { format?: string; expiresInSeconds?: number } = {}
): Promise<string> {
  const { cloudName, apiKey, apiSecret } = readCredentials();
  const expiresInSeconds = options.expiresInSeconds ?? 300; // 5 minutes
  const expiresAt = Math.floor(Date.now() / 1000) + expiresInSeconds;

  // The SDK's own type for this options bag only lists resource_type/type/
  // expires_at/attachment, but its implementation (lib/utils/index.js) also
  // reads cloud_name/api_key/api_secret straight off it - the same shape
  // config() would otherwise supply globally. Casting here avoids calling
  // cloudinary.config() just to satisfy TypeScript.
  type PrivateDownloadUrlOptions = Parameters<
    typeof cloudinarySdk.utils.private_download_url
  >[2];

  return cloudinarySdk.utils.private_download_url(publicId, options.format ?? "jpg", {
    resource_type: "image",
    type: IDENTITY_DELIVERY_TYPE,
    expires_at: expiresAt,
    cloud_name: cloudName,
    api_key: apiKey,
    api_secret: apiSecret,
  } as PrivateDownloadUrlOptions & { cloud_name: string; api_key: string; api_secret: string });
}
