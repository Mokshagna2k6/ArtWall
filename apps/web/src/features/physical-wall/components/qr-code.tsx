import "server-only";

import QRCode from "qrcode";

/**
 * A QR code, rendered server-side as inline SVG.
 *
 * SVG rather than a data-URI PNG for two reasons that both matter here: these
 * codes get **printed** onto labels beside artworks, and vector scales to any
 * label size without going soft; and inline SVG needs no image host, so nothing
 * about the code leaves our origin.
 *
 * Error-correction level M — the middle setting. A label on a restaurant wall
 * picks up fingerprints and the odd splash, and M tolerates roughly 15% damage
 * while staying dense enough to scan from a metre away.
 */
export async function QrCode({
  value,
  size = 180,
  label,
}: {
  value: string;
  size?: number;
  /** Accessible description. The code itself is meaningless to a screen reader. */
  label: string;
}) {
  let svg: string;
  try {
    svg = await QRCode.toString(value, {
      type: "svg",
      errorCorrectionLevel: "M",
      margin: 1,
      width: size,
    });
  } catch (error) {
    console.error("[physical-wall] Could not render QR", error);
    return (
      <p className="text-destructive text-small">
        This code could not be drawn. The link still works: {value}
      </p>
    );
  }

  return (
    <div
      role="img"
      aria-label={label}
      className="[&>svg]:h-auto [&>svg]:w-full [&>svg]:max-w-full"
      style={{ width: size }}
      // The input is a URL we constructed from a token we minted, and qrcode
      // emits only <svg>/<path> elements — there is no untrusted content here.
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}
