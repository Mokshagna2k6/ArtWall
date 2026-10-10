import { GenesisTile } from "@/features/wall/genesis-tile";
import { cn } from "@/lib/utils";

/**
 * A band of the wall's own artwork, drifting slowly across the page.
 *
 * The marketing pages had no imagery at all, an art platform arguing for
 * itself entirely in prose. This is the fix, and it deliberately does not
 * reach for stock photography or for artists' uploaded work:
 *
 *  - Stock would be a lie about what is on the platform.
 *  - Real uploads are the artists' work, shown at our convenience, and right
 *    now the roster is mostly test rows.
 *
 * `GenesisTile` is neither. It is the generative work the wall is built from
 * before artists arrive: openly ours, drawn from ten living Indian
 * traditions, deterministic from a seed, and free of network cost.
 *
 * The drift is the argument, not an effect. A static strip is a decorative
 * header; a wall that keeps moving past you is the thing the copy describes,
 * and it lets twenty tiles live in the space of twelve. It pauses on hover
 * and stops entirely under `prefers-reduced-motion`.
 *
 * Seeds are fixed literals rather than random or index-derived, so the band
 * renders identically on the server and the client and does not shift between
 * deploys. Server Component: pure SVG and CSS, no JavaScript.
 */

/** Chosen by eye so adjacent tiles never repeat a tradition or a ground. */
const SEEDS = [
  1204, 87, 3391, 512, 2087, 46, 1750, 928, 4103, 271, 1566, 733, 2914, 158,
  3702, 641, 2233, 419, 1888, 55,
] as const;

/**
 * The ten forms the generator draws from.
 *
 * Named in the caption rather than left as decoration. An artist scanning this
 * page is looking for their own practice in it, and "Warli, Madhubani, Phad"
 * answers that question in a way "generative artwork" never will.
 */
const TRADITIONS = [
  "Warli",
  "Madhubani",
  "Phad",
  "Gond",
  "Ajrakh",
  "Kolam",
  "Blue pottery",
  "Mandala",
  "Pattachitra",
  "Jharokha",
] as const;

export function ArtworkBand({
  className,
  label = "Generative work from ten Indian traditions, the wall before artists arrive",
  caption = true,
}: {
  className?: string;
  /** Describes the band for assistive tech; the tiles themselves are decorative. */
  label?: string;
  /** Set false where a second caption on the same page would be noise. */
  caption?: boolean;
}) {
  return (
    <div className={className}>
      <div
        role="img"
        aria-label={label}
        className="wall-drift-track border-border overflow-hidden border-y"
      >
        {/* The track carries the tile set twice so the loop can reset at -50%
            with no visible seam. The second copy is presentational only. */}
        <div className="wall-drift flex w-max">
          {[0, 1].map((copy) => (
            <div key={copy} className="flex" aria-hidden={copy === 1}>
              {SEEDS.map((seed) => (
                <div
                  key={`${copy}-${seed}`}
                  // Fixed width rather than a grid cell: the track has to be
                  // wider than the viewport for a marquee to have anywhere
                  // to travel.
                  className="border-border relative size-24 shrink-0 border-r sm:size-28 lg:size-32"
                >
                  <GenesisTile seed={seed} className="size-full" />
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>

      {caption && (
        // The gallery label under the work. Naming the forms is the difference
        // between decoration and an invitation: an artist reads this list
        // looking for their own practice.
        <div className="max-w-page mx-auto px-5 pt-5 sm:px-8 lg:px-16">
          <p className="text-muted-foreground text-sm leading-7">
            <span className="text-eyebrow text-signal mr-3 align-middle">
              The wall so far
            </span>
            {TRADITIONS.join(" · ")}. Generative work drawn by ArtWall, replaced
            one tile at a time as artists arrive.
          </p>
        </div>
      )}
    </div>
  );
}

/**
 * A single tile, for use as a small motif beside a heading.
 *
 * Exported so pages stop reaching into `GenesisTile` directly and picking
 * their own seeds, which is how a "random" set ends up repeating a tradition
 * three times on one screen.
 */
export function ArtworkMark({
  seed,
  className,
}: {
  seed: number;
  className?: string;
}) {
  return (
    <span
      aria-hidden
      className={cn("border-border block overflow-hidden border", className)}
    >
      <GenesisTile seed={seed} className="size-full" />
    </span>
  );
}
