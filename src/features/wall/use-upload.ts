"use client";

import { useCallback, useState } from "react";

import { requestUploadSignature } from "@/features/wall/actions";
import { ACCEPTED_IMAGE_TYPES, MAX_UPLOAD_BYTES } from "@/features/wall/schema";

export interface UploadedAsset {
  url: string;
  publicId: string;
  width: number;
  height: number;
  /** Cloudinary's own verdict. Advisory here; the server re-checks it. */
  moderation: string | null;
}

export class UploadError extends Error {}

/**
 * Direct-to-Cloudinary upload with real progress.
 *
 * `XMLHttpRequest` rather than `fetch` for one reason only: fetch still has no
 * upload progress event in any shipping browser, and an artist on a slow
 * connection uploading a 12MB phone photo needs to see the bar move or they
 * will assume it hung and press the button again.
 *
 * The file never touches our server - the browser gets a short-lived signature
 * and posts straight to Cloudinary. That keeps a multi-megabyte body out of a
 * serverless function and off the request-size limit entirely.
 */
export function useUpload() {
  const [progress, setProgress] = useState(0);
  const [busy, setBusy] = useState(false);

  const upload = useCallback(async (file: File): Promise<UploadedAsset> => {
    if (!ACCEPTED_IMAGE_TYPES.includes(file.type as never)) {
      throw new UploadError(
        "That file type isn't supported. Use a JPEG, PNG, WebP, or HEIC image."
      );
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      throw new UploadError(
        `That image is ${(file.size / 1024 / 1024).toFixed(1)}MB. Please keep it under ${MAX_UPLOAD_BYTES / 1024 / 1024}MB.`
      );
    }

    setBusy(true);
    setProgress(0);

    try {
      const signed = await requestUploadSignature();
      if (!signed.ok) throw new UploadError(signed.message);

      const { signature, timestamp, apiKey, cloudName, folder, moderation } =
        signed.signature;

      const body = new FormData();
      body.append("file", file);
      body.append("api_key", apiKey);
      body.append("timestamp", String(timestamp));
      body.append("folder", folder);
      body.append("signature", signature);
      // Every signed param must be sent, and only signed params may be sent -
      // Cloudinary rejects the upload if the two sets disagree.
      if (moderation) body.append("moderation", moderation);

      const result = await new Promise<UploadedAsset>((resolve, reject) => {
        const request = new XMLHttpRequest();
        request.open(
          "POST",
          `https://api.cloudinary.com/v1_1/${cloudName}/image/upload`
        );
        request.timeout = 120_000;

        request.upload.addEventListener("progress", (event) => {
          if (event.lengthComputable) {
            setProgress(Math.round((event.loaded / event.total) * 100));
          }
        });

        request.addEventListener("load", () => {
          if (request.status < 200 || request.status >= 300) {
            reject(
              new UploadError("The upload was rejected. Please try again.")
            );
            return;
          }
          try {
            const data = JSON.parse(request.responseText) as {
              secure_url: string;
              public_id: string;
              width: number;
              height: number;
              moderation?: { status?: string }[];
            };
            resolve({
              url: data.secure_url,
              publicId: data.public_id,
              width: data.width,
              height: data.height,
              moderation: data.moderation?.[0]?.status ?? null,
            });
          } catch {
            reject(new UploadError("We couldn't read the upload response."));
          }
        });

        request.addEventListener("error", () =>
          reject(new UploadError("The upload failed. Check your connection."))
        );
        request.addEventListener("timeout", () =>
          reject(new UploadError("The upload timed out. Please try again."))
        );

        request.send(body);
      });

      setProgress(100);
      return result;
    } finally {
      setBusy(false);
    }
  }, []);

  return { upload, progress, busy };
}
