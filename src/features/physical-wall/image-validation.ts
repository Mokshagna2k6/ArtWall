import "server-only";

import { createHash } from "node:crypto";

import { createUploadSignature } from "@/lib/cloudinary";

const UGC_UPLOAD_FOLDER = "artwall/ugc";

export interface UgcUploadSignature {
  signature: string;
  timestamp: number;
  apiKey: string;
  cloudName: string;
  folder: string;
}

/**
 * Signed direct upload for UGC selfies (F25).
 *
 * Same pattern as the digital wall: short-lived signature scoped to a dedicated
 * folder so a leaked token cannot be used to overwrite artwork uploads.
 */
export async function requestUgcUploadSignature(): Promise<UgcUploadSignature> {
  return createUploadSignature(UGC_UPLOAD_FOLDER) as UgcUploadSignature;
}

/**
 * Magic-byte MIME validation for uploaded images (F09).
 *
 * Checks the first 12 bytes against known image signatures. This catches
 * renamed EXE files, PDFs with image extensions, and other spoofed uploads
 * that a MIME type from the browser cannot.
 */
const SIGNATURES: { bytes: number[]; mime: string }[] = [
  { bytes: [0xFF, 0xD8, 0xFF], mime: "image/jpeg" },
  { bytes: [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A], mime: "image/png" },
  { bytes: [0x52, 0x49, 0x46, 0x46], mime: "image/webp" }, // RIFF (WebP container)
  { bytes: [0x00, 0x00, 0x00, 0x20, 0x66, 0x74, 0x79, 0x70], mime: "image/heic" }, // HEIC ftyp
  { bytes: [0x47, 0x49, 0x46, 0x38], mime: "image/gif" },
];

export function validateImageMagicBytes(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  for (const sig of SIGNATURES) {
    if (bytes.length >= sig.bytes.length) {
      const match = sig.bytes.every((b, i) => bytes[i] === b);
      if (match) return sig.mime;
    }
  }
  throw new Error("That file does not look like a valid image.");
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
