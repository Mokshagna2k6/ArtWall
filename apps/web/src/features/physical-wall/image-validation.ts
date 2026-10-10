import "server-only";

import { createHmac, randomBytes } from "node:crypto";
import { cookies } from "next/headers";

import { sniffImageType } from "@/lib/blockchain/file-sniff";
import { createUploadSignature, IMAGE_UPLOAD_FORMATS, type UploadSignature } from "@/lib/cloudinary";
import { getSessionUser } from "@/lib/session";

export const UGC_UPLOAD_FOLDER = "artwall/ugc";
/** What Cloudinary will accept for a selfie; enforced by the signed upload. */
export const UGC_FORMATS = IMAGE_UPLOAD_FORMATS;
/** httpOnly cookie that ties a signed-out visitor's upload to their submit. */
export const UGC_GUEST_COOKIE = "pw_ugc_guest";

export type UgcUploadSignature = UploadSignature;

/**
 * The upload folder for one uploader (BE-2.08): artwall/ugc/<tag>, where tag is
 * an HMAC of the uploader's identity — the user id when signed in, else a
 * random token kept in an httpOnly cookie. Cloudinary only accepts a signed
 * upload into the folder we signed, so a public_id under this folder was
 * uploaded with a signature issued to this uploader, and nobody else can
 * compute the folder (it needs the server secret, and a guest's token never
 * reaches JavaScript).
 */
export function ugcOwnerFolder(identity: string): string {
  const secret = process.env.BETTER_AUTH_SECRET;
  if (!secret) throw new Error("BETTER_AUTH_SECRET is required to sign UGC uploads.");
  const tag = createHmac("sha256", secret).update(`ugc-owner:${identity}`).digest("base64url").slice(0, 24);
  return `${UGC_UPLOAD_FOLDER}/${tag}`;
}

/**
 * This request's UGC folder. `create` mints the guest cookie when there is
 * none (the signature route); submit passes false, so a request with neither a
 * session nor the cookie owns no folder at all.
 */
export async function currentUgcFolder(create: boolean): Promise<string | null> {
  const user = await getSessionUser();
  if (user) return ugcOwnerFolder(`user:${user.id}`);

  const jar = await cookies();
  let token = jar.get(UGC_GUEST_COOKIE)?.value;
  if (!token && create) {
    token = randomBytes(18).toString("base64url");
    jar.set(UGC_GUEST_COOKIE, token, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 60 * 60 * 24,
    });
  }
  return token ? ugcOwnerFolder(`guest:${token}`) : null;
}

/**
 * Signed direct upload for UGC selfies (F25), into this uploader's own folder,
 * restricted to image formats.
 */
export async function requestUgcUploadSignature(): Promise<UgcUploadSignature> {
  const folder = await currentUgcFolder(true);
  if (!folder) throw new Error("Could not assign an upload folder.");
  return createUploadSignature(folder, { allowedFormats: UGC_FORMATS });
}

/**
 * Magic-byte MIME validation for uploaded images (F09, SEC-2.07).
 *
 * Thin wrapper over the shared `sniffImageType` (BC-1.20) rather than a second,
 * independently-maintained signature table — one file-type detector for every
 * upload path (IPFS, UGC, identity documents, artwork images), not two.
 */
export function validateImageMagicBytes(buffer: ArrayBuffer): string {
  const mime = sniffImageType(new Uint8Array(buffer));
  if (!mime) throw new Error("That file does not look like a valid image.");
  return mime;
}

/**
 * Derive a safe filename extension from a MIME type.
 */
export function extensionForMime(mime: string): string {
  switch (mime) {
    case "image/jpeg":
      return "jpg";
    case "image/png":
      return "png";
    case "image/webp":
      return "webp";
    case "image/heic":
      return "heic";
    case "image/gif":
      return "gif";
    default:
      return "bin";
  }
}
