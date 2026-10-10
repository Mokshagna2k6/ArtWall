import { cn } from "@/lib/utils";

interface ArtWallLogoProps {
  className?: string;
  /**
   * When true the mark is exposed to assistive tech as "ArtWall".
   * Leave false wherever an adjacent wordmark already carries the name.
   */
  titled?: boolean;
}

/**
 * The ArtWall mark, drawn to the brand's own reading of it:
 *
 *   THE WALL - two interlocking L-shapes forming an *open* frame. It is broken
 *              on purpose: an exhibition is an invitation, not an enclosure.
 *   THE LAB  - a sealed square. Closed because immutability is the point.
 *   THE SEED - the amber dot at the origin, where the artist begins.
 *   THE VOID - the overlap. Not emptiness; where creator meets collector.
 *
 * The open/closed contrast is the whole idea, so the wall is drawn as two L
 * strokes with a deliberate gap rather than as a rectangle - a closed wall
 * would say the opposite of what the brand means.
 *
 * Inline SVG rather than a raster asset: sharp at every size, inherits
 * `currentColor` so it works on light and dark surfaces, and costs no request.
 *
 * Every part is drawn from `currentColor` at a different opacity rather than
 * from fixed brand values. A hardcoded near-black seed vanished against the
 * slate footer; deriving from the inherited colour means the mark re-tunes
 * itself to whatever ground it is placed on, with no dark-mode variant.
 */
export function ArtWallLogo({ className, titled = false }: ArtWallLogoProps) {
  return (
    <svg
      viewBox="0 0 32 32"
      fill="none"
      className={cn("size-8", className)}
      role={titled ? "img" : "presentation"}
      aria-label={titled ? "ArtWall" : undefined}
      aria-hidden={titled ? undefined : true}
    >
      {/* THE VOID, the overlap zone, faintly held so it reads as a place */}
      <rect
        x="12.75"
        y="11.75"
        width="7.5"
        height="7.5"
        fill="currentColor"
        fillOpacity="0.12"
      />

      {/* THE LAB, sealed square */}
      <rect
        x="12.75"
        y="11.75"
        width="14.5"
        height="14.5"
        stroke="currentColor"
        strokeOpacity="0.55"
        strokeWidth="1.5"
      />

      {/* THE WALL, two L strokes, open at the corners */}
      <path d="M5.75 13.5V4.75h8.75" stroke="currentColor" strokeWidth="1.5" />
      <path d="M20.25 10.5v8.75H11.5" stroke="currentColor" strokeWidth="1.5" />

      {/* THE SEED, the origin point */}
      <circle cx="5.75" cy="13.5" r="1.9" fill="currentColor" />
    </svg>
  );
}
