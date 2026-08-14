export interface CompressedImage {
  blob: Blob;
  width: number;
  height: number;
  /** Original size in bytes, for showing the saving. */
  originalBytes: number;
}

const MAX_EDGE = 1800;
const QUALITY = 0.82;

/**
 * Shrink an image in the browser before it is uploaded.
 *
 * This is the single biggest performance lever in the upload path. Phone
 * cameras produce 4–12 MB files; on Indian mobile data an uncompressed upload
 * is slow enough that people abandon it. Resizing the long edge to 1800px and
 * re-encoding typically cuts that by 80–95% with no visible loss at the sizes
 * the wall ever displays.
 *
 * It also protects the wall's render performance: Cloudinary still transforms
 * on delivery, but a smaller original means faster first transform and less
 * storage.
 *
 * `createImageBitmap` decodes off the main thread where supported, so a large
 * photo does not freeze the page while it is being read. WebP is preferred when
 * the browser can encode it (smaller at equal quality) with JPEG as fallback.
 *
 * EXIF is intentionally dropped by the canvas round-trip - camera files carry
 * GPS coordinates, and an artist uploading from home should not be publishing
 * their address along with their painting.
 */
export async function compressImage(file: File): Promise<CompressedImage> {
  const bitmap = await createImageBitmap(file);

  const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
  const width = Math.round(bitmap.width * scale);
  const height = Math.round(bitmap.height * scale);

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;

  const context = canvas.getContext("2d");
  if (!context) {
    bitmap.close();
    throw new Error("Could not read that image.");
  }

  context.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();

  const type = canvas.toDataURL("image/webp").startsWith("data:image/webp")
    ? "image/webp"
    : "image/jpeg";

  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, type, QUALITY)
  );

  if (!blob) throw new Error("Could not process that image.");

  return { blob, width, height, originalBytes: file.size };
}

export interface UploadedAsset {
  url: string;
  publicId: string;
  width: number;
  height: number;
}

/**
 * Send the compressed blob straight to Cloudinary with a server-minted
 * signature. Nothing large passes through our own server.
 */
export async function uploadToCloudinary(
  image: CompressedImage,
  signature: {
    signature: string;
    timestamp: number;
    apiKey: string;
    cloudName: string;
    folder: string;
  }
): Promise<UploadedAsset> {
  const body = new FormData();
  body.append("file", image.blob);
  body.append("api_key", signature.apiKey);
  body.append("timestamp", String(signature.timestamp));
  body.append("signature", signature.signature);
  body.append("folder", signature.folder);

  const response = await fetch(
    `https://api.cloudinary.com/v1_1/${signature.cloudName}/image/upload`,
    { method: "POST", body }
  );

  if (!response.ok) {
    throw new Error("Upload failed. Please try again.");
  }

  const data = (await response.json()) as {
    secure_url: string;
    public_id: string;
    width: number;
    height: number;
  };

  return {
    url: data.secure_url,
    publicId: data.public_id,
    width: data.width,
    height: data.height,
  };
}
