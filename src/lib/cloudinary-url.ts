/**
 * Delivery URLs - where the compression actually happens.
 *
 * An artist photographs a canvas on a phone and hands us 6MB. We do not
 * re-encode that at upload: Cloudinary transforms on delivery and caches the
 * result, so the *original* stays pristine (it is the archival record behind a
 * provenance claim) while every visitor is served a small, modern-format,
 * correctly-sized image.
 *
 * `f_auto` picks AVIF or WebP per browser, `q_auto` picks a quality that holds
 * up on the specific image rather than a blanket number, and `dpr_auto` covers
 * retina without shipping 2× pixels to everyone. On the wall grid that is
 * typically 6MB down to roughly 30–60KB.
 *
 * No secrets here on purpose - this is pure string building, so it is safe in
 * client components. Signing lives in `cloudinary.ts`, which is server-only.
 */

const UPLOAD_MARKER = "/image/upload/";

/**
 * Insert a transformation into a stored Cloudinary URL.
 *
 * Works off the URL Cloudinary returned rather than rebuilding one from the
 * public_id, so the version segment and file extension come along untouched -
 * rebuilding by hand is how you end up serving 404s for assets that exist.
 */
function transform(url: string, transformation: string): string {
  const index = url.indexOf(UPLOAD_MARKER);
  if (index === -1) return url;

  const cut = index + UPLOAD_MARKER.length;
  return `${url.slice(0, cut)}${transformation}/${url.slice(cut)}`;
}

/** A square tile on the wall grid. Cropped smartly rather than squashed. */
export function tileSrc(url: string, size = 480): string {
  return transform(
    url,
    `f_auto,q_auto:good,c_fill,g_auto,w_${size},h_${size},dpr_auto`
  );
}

/** The full work, when a tile is opened. Never upscaled past its original. */
export function fullSrc(url: string, width = 1200): string {
  return transform(url, `f_auto,q_auto:good,c_limit,w_${width}`);
}

/** The artist, framed on their face rather than centre-cropped at the neck. */
export function portraitSrc(url: string, size = 400): string {
  return transform(
    url,
    `f_auto,q_auto:good,c_fill,g_face,w_${size},h_${size},dpr_auto`
  );
}

/**
 * A tiny blurred stand-in, inlined as the tile's background while the real
 * image decodes. Costs about a kilobyte and removes the grey-rectangle flash
 * that makes a wall of art feel like a loading screen.
 */
export function blurSrc(url: string): string {
  return transform(url, "f_auto,q_auto:low,e_blur:1200,w_40");
}
