/**
 * Genesis tiles - the art the wall is made of before artists arrive.
 *
 * The brief is explicit that the wall must never look empty, and it is right:
 * an empty grid reads as an unfinished product, while a wall of real work reads
 * as a gallery that is already alive. Crucially this is not fake data - no
 * invented artist, no borrowed artwork, nothing scraped. It is generative work
 * we draw ourselves, openly labelled as ours, and the narrative depends on that:
 * each tile is later *replaced* by a real artist until the wall belongs
 * entirely to the community.
 *
 * Each tile is a nod to a living Indian tradition - Warli, Madhubani, Phad,
 * Gond, Ajrakh, kolam, Jaipur blue pottery, mandala, Pattachitra, and the
 * Rajput jharokha. They are respectful abstractions in each form's own palette
 * and grammar, not reproductions of anyone's work.
 *
 * Rendered as inline SVG with a deterministic seed rather than as images:
 * hundreds of tiles cost no network requests, scale to any size, animate on the
 * GPU, and stay byte-cheap on a 4G connection. A seeded generator (never
 * Math.random) means server and client draw exactly the same wall, so
 * hydration matches and a returning visitor sees the wall they remember.
 */

/** Small deterministic PRNG (mulberry32) - same seed, same tile, every time. */
function rng(seed: number) {
  let t = seed + 0x6d2b79f5;
  return () => {
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type Random = () => number;

/**
 * Round a coordinate to a stable precision.
 *
 * ECMAScript does not require `Math.sin`/`Math.cos` to be bit-identical
 * across implementations, and Node and Chrome genuinely disagree in the last
 * few bits: the server rendered `cy="24.885263290251284"` where the browser
 * computed `24.885263290251288`, and React reported it as a hydration
 * mismatch on every tile using trigonometry.
 *
 * Three decimals on a 100-unit viewBox is a thousandth of a tile, far below
 * anything visible, and many orders of magnitude coarser than the
 * disagreement, so both runtimes land on the same number.
 */
function p3(n: number): number {
  return Math.round(n * 1000) / 1000;
}

/** Pick one item deterministically. */
function pick<T>(random: Random, items: readonly T[]): T {
  return items[Math.floor(random() * items.length)];
}

/* ── Pigments, by tradition ────────────────────────────────────────────────
   Each form carries its own ground and palette, because the ground is half of
   what makes a tradition recognisable: Warli is white on cow-dung mud, Ajrakh
   is madder and indigo on resist-cream, Gond is vivid line on dark. A single
   shared palette across all ten would flatten them into one house style, which
   is precisely the homogenising we say the platform exists to resist. */

const INK = "#171A1F";
const CHALK = "#F4EADA";
const CREAM = "#EFE2C4";
const INDIGO = "#243B6B";
const MADDER = "#B0452F";
const TURMERIC = "#D9A125";
const VERDIGRIS = "#3F7A62";
const COBALT = "#1C4FA1";
const MUD = "#9C5334";
const SAFFRON = "#E07B2C";
const LOTUS = "#C2426A";

interface FormProps {
  seed: number;
}

/**
 * Each form's own generator, derived from the tile seed.
 *
 * Forms used to receive a single shared `Random` closure created by
 * `GenesisTile`. That closure carries mutable state, so anything that invoked
 * a form's body twice - React StrictMode double-renders in development -
 * continued the number stream instead of restarting it, and the second pass
 * drew different colours than the server had. The result was a hydration
 * mismatch that swapped a tile's ground and motif.
 *
 * Building the generator inside the form makes each render a pure function of
 * the seed, so server and client cannot diverge no matter how many times
 * React chooses to call it.
 *
 * Offset by 1 so a form's palette does not correlate with the single draw
 * that selected which form to use.
 */
function formRandom(seed: number): Random {
  return rng(seed + 1);
}

/* ── 01 · Warli ───────────────────────────────────────────────────────────
   Chalk-white figures on mud. The whole tradition is built from two triangles
   and a circle, so the abstraction is honest rather than lossy. */
function Warli({ seed }: FormProps) {
  const random = formRandom(seed);
  const dancers = 3 + Math.floor(random() * 2);
  const baseline = 68 + random() * 8;

  return (
    <>
      <rect width="100" height="100" fill={MUD} />
      {/* Sun, always present in a Warli field */}
      <circle
        cx={78}
        cy={22}
        r={7}
        fill="none"
        stroke={CHALK}
        strokeWidth={1.4}
      />
      {Array.from({ length: 8 }).map((_, i) => {
        const angle = (i / 8) * Math.PI * 2;
        return (
          <line
            key={i}
            x1={p3(78 + Math.cos(angle) * 9)}
            y1={p3(22 + Math.sin(angle) * 9)}
            x2={p3(78 + Math.cos(angle) * 12.5)}
            y2={p3(22 + Math.sin(angle) * 12.5)}
            stroke={CHALK}
            strokeWidth={1}
          />
        );
      })}

      {Array.from({ length: dancers }).map((_, i) => {
        const x = 16 + i * (68 / dancers);
        const lean = (i % 2 === 0 ? 1 : -1) * 3;
        return (
          <g
            key={i}
            stroke={CHALK}
            strokeWidth={1.6}
            fill="none"
            strokeLinecap="round"
          >
            <circle
              cx={x}
              cy={baseline - 26}
              r={3.2}
              fill={CHALK}
              stroke="none"
            />
            {/* Two triangles, apex to apex, the Warli body */}
            <path
              d={`M${x - 5} ${baseline - 22} L${x + 5} ${baseline - 22} L${x} ${baseline - 13} Z`}
            />
            <path
              d={`M${x} ${baseline - 13} L${x - 5} ${baseline - 4} L${x + 5} ${baseline - 4} Z`}
            />
            {/* Arms, joined to the next dancer */}
            <path
              d={`M${x - 5} ${baseline - 20} L${x - 11 + lean} ${baseline - 25}`}
            />
            <path
              d={`M${x + 5} ${baseline - 20} L${x + 11 + lean} ${baseline - 25}`}
            />
            {/* Legs */}
            <path d={`M${x - 3} ${baseline - 4} L${x - 6} ${baseline + 5}`} />
            <path d={`M${x + 3} ${baseline - 4} L${x + 6} ${baseline + 5}`} />
          </g>
        );
      })}

      <line
        x1="0"
        y1={baseline + 6}
        x2="100"
        y2={baseline + 6}
        stroke={CHALK}
        strokeWidth={1}
        opacity={0.7}
      />
    </>
  );
}

/* ── 02 · Madhubani ───────────────────────────────────────────────────────
   A fish, double-outlined and hatched, inside the dense border the form is
   never without. */
function Madhubani({ seed }: FormProps) {
  const random = formRandom(seed);
  const body = pick(random, [MADDER, INDIGO, VERDIGRIS, LOTUS]);

  return (
    <>
      <rect width="100" height="100" fill={CREAM} />

      {/* The border: Madhubani leaves no ground unworked */}
      <rect
        x="4"
        y="4"
        width="92"
        height="92"
        fill="none"
        stroke={INK}
        strokeWidth={1.6}
      />
      <rect
        x="9"
        y="9"
        width="82"
        height="82"
        fill="none"
        stroke={MADDER}
        strokeWidth={2.4}
      />
      {Array.from({ length: 20 }).map((_, i) => (
        <line
          key={i}
          x1={9 + i * 4.2}
          y1={4}
          x2={9 + i * 4.2}
          y2={9}
          stroke={INK}
          strokeWidth={0.9}
        />
      ))}

      {/* Fish */}
      <g transform="translate(50 52)">
        <path
          d="M-26 0 C -16 -16, 14 -16, 24 0 C 14 16, -16 16, -26 0 Z"
          fill={body}
          stroke={INK}
          strokeWidth={2}
        />
        <path
          d="M24 0 L34 -10 L32 0 L34 10 Z"
          fill={TURMERIC}
          stroke={INK}
          strokeWidth={1.6}
        />
        {/* Hatching, the fill that makes it Madhubani rather than a logo */}
        {Array.from({ length: 7 }).map((_, i) => (
          <line
            key={i}
            x1={-20 + i * 6}
            y1={-11 + (i % 2) * 2}
            x2={-20 + i * 6}
            y2={11 - (i % 2) * 2}
            stroke={INK}
            strokeWidth={0.8}
            opacity={0.7}
          />
        ))}
        <circle
          cx={-16}
          cy={-3}
          r={3.4}
          fill={CREAM}
          stroke={INK}
          strokeWidth={1.4}
        />
        <circle cx={-16} cy={-3} r={1.3} fill={INK} />
      </g>

      {/* Lotus buds, filling the field as the form demands */}
      {Array.from({ length: 3 }).map((_, i) => (
        <circle
          key={i}
          cx={22 + i * 28}
          cy={80}
          r={3}
          fill={LOTUS}
          stroke={INK}
          strokeWidth={1}
        />
      ))}
    </>
  );
}

/* ── 03 · Phad ────────────────────────────────────────────────────────────
   Rajasthan's narrative scroll: flat red and saffron grounds, figures in
   profile, the horse of Pabuji at the centre. */
function Phad({ seed }: FormProps) {
  const random = formRandom(seed);
  const ground = pick(random, [MADDER, SAFFRON]);

  return (
    <>
      <rect width="100" height="100" fill={ground} />
      <rect y="0" width="100" height="14" fill={TURMERIC} opacity={0.85} />
      <rect y="86" width="100" height="14" fill={TURMERIC} opacity={0.85} />

      {/* The horse, in profile */}
      <g transform="translate(50 54)" stroke={INK} strokeWidth={1.6}>
        <path
          d="M-24 8 C -22 -4, -10 -8, 0 -8 L12 -8 C 18 -8, 22 -14, 24 -20 L28 -14 C 27 -6, 22 -2, 16 0 L16 10 L10 10 L10 2 L-6 2 L-6 10 L-12 10 L-12 2 C -18 2, -22 6, -24 8 Z"
          fill={CREAM}
        />
        <circle cx={23} cy={-16} r={1.4} fill={INK} stroke="none" />
        {/* Caparison dots, Phad horses are never plain */}
        {Array.from({ length: 6 }).map((_, i) => (
          <circle
            key={i}
            cx={-14 + i * 5}
            cy={-3}
            r={1.3}
            fill={LOTUS}
            stroke="none"
          />
        ))}
      </g>

      {/* Narrative border of standing figures */}
      {Array.from({ length: 6 }).map((_, i) => (
        <g key={i} transform={`translate(${10 + i * 16} 92)`}>
          <circle cx={0} cy={-6} r={2} fill={INK} />
          <path d="M0 -4 L0 2 M-3 0 L3 0" stroke={INK} strokeWidth={1.2} />
        </g>
      ))}
    </>
  );
}

/* ── 04 · Gond ────────────────────────────────────────────────────────────
   A tree of life built from the signature dot-and-dash fill. */
function Gond({ seed }: FormProps) {
  const random = formRandom(seed);
  const canopy = pick(random, [VERDIGRIS, COBALT, LOTUS, TURMERIC]);

  return (
    <>
      <rect width="100" height="100" fill="#14161B" />
      <path
        d="M47 92 L47 58 C 47 50, 40 46, 36 40 M53 92 L53 62 C 53 54, 60 50, 66 44"
        stroke={MUD}
        strokeWidth={3}
        fill="none"
        strokeLinecap="round"
      />
      <rect x="45" y="58" width="10" height="34" fill={MUD} />

      <circle cx={50} cy={40} r={26} fill={canopy} opacity={0.9} />
      <circle
        cx={50}
        cy={40}
        r={26}
        fill="none"
        stroke={CHALK}
        strokeWidth={1.2}
      />

      {/* Dot rows, the Gond signature */}
      {Array.from({ length: 5 }).map((_, row) =>
        Array.from({ length: 9 }).map((__, i) => {
          const y = 24 + row * 8;
          const x = 28 + i * 5.5;
          const inside = (x - 50) ** 2 + (y - 40) ** 2 < 22 ** 2;
          if (!inside) return null;
          return (
            <circle
              key={`${row}-${i}`}
              cx={x}
              cy={y}
              r={row % 2 === 0 ? 1.5 : 1}
              fill={CHALK}
              opacity={0.85}
            />
          );
        })
      )}

      {/* A bird, as Gond canopies almost always carry one */}
      <path d="M70 22 q5 -4 9 0 q-4 2 -9 0 Z" fill={TURMERIC} />
    </>
  );
}

/* ── 05 · Ajrakh ──────────────────────────────────────────────────────────
   Resist block printing from Kachchh: madder, indigo, and undyed cream in a
   strict geometric repeat. */
function Ajrakh({ seed }: FormProps) {
  const random = formRandom(seed);
  const ground = pick(random, [INDIGO, MADDER]);
  const motif = ground === INDIGO ? MADDER : INDIGO;

  return (
    <>
      <rect width="100" height="100" fill={ground} />
      {Array.from({ length: 3 }).map((_, row) =>
        Array.from({ length: 3 }).map((__, col) => {
          const cx = 16.6 + col * 33.3;
          const cy = 16.6 + row * 33.3;
          return (
            <g key={`${row}-${col}`} transform={`translate(${cx} ${cy})`}>
              {/* Eight-point star: two squares at 45° */}
              <rect
                x={-9}
                y={-9}
                width={18}
                height={18}
                fill={CREAM}
                opacity={0.92}
              />
              <rect
                x={-9}
                y={-9}
                width={18}
                height={18}
                fill={motif}
                opacity={0.85}
                transform="rotate(45)"
              />
              <circle cx={0} cy={0} r={3.2} fill={CREAM} />
              <circle cx={0} cy={0} r={1.4} fill={INK} />
            </g>
          );
        })
      )}
      {/* Grid rules between the repeats */}
      {[33.3, 66.6].map((p) => (
        <g key={p}>
          <line
            x1={p}
            y1={0}
            x2={p}
            y2={100}
            stroke={CREAM}
            strokeWidth={0.7}
            opacity={0.5}
          />
          <line
            x1={0}
            y1={p}
            x2={100}
            y2={p}
            stroke={CREAM}
            strokeWidth={0.7}
            opacity={0.5}
          />
        </g>
      ))}
    </>
  );
}

/* ── 06 · Kolam ───────────────────────────────────────────────────────────
   The rice-flour threshold drawing: a dot grid, and one continuous line
   looping around every dot without lifting. */
function Kolam({ seed }: FormProps) {
  const random = formRandom(seed);
  const line = pick(random, [CHALK, TURMERIC]);

  return (
    <>
      <rect width="100" height="100" fill="#101216" />
      {Array.from({ length: 5 }).map((_, row) =>
        Array.from({ length: 5 }).map((__, col) => (
          <circle
            key={`${row}-${col}`}
            cx={18 + col * 16}
            cy={18 + row * 16}
            r={1.3}
            fill={line}
            opacity={0.55}
          />
        ))
      )}
      <path
        d="M50 14 C 70 14, 86 30, 86 50 C 86 70, 70 86, 50 86 C 30 86, 14 70, 14 50 C 14 30, 30 14, 50 14 Z"
        fill="none"
        stroke={line}
        strokeWidth={1.5}
      />
      <path
        d="M50 26 C 62 34, 66 38, 74 50 C 66 62, 62 66, 50 74 C 38 66, 34 62, 26 50 C 34 38, 38 34, 50 26 Z"
        fill="none"
        stroke={line}
        strokeWidth={1.5}
      />
      <circle
        cx={50}
        cy={50}
        r={6}
        fill="none"
        stroke={line}
        strokeWidth={1.5}
      />
    </>
  );
}

/* ── 07 · Jaipur blue pottery ─────────────────────────────────────────────
   Cobalt on quartz-white, the one Indian pottery tradition that uses no clay
   at all, and the Pink City's own. */
function BluePottery({ seed }: FormProps) {
  const random = formRandom(seed);
  const petals = 6 + Math.floor(random() * 3);

  return (
    <>
      <rect width="100" height="100" fill="#F2F0E9" />
      <circle
        cx="50"
        cy="50"
        r="44"
        fill="none"
        stroke={COBALT}
        strokeWidth={2}
      />
      <circle
        cx="50"
        cy="50"
        r="38"
        fill="none"
        stroke={COBALT}
        strokeWidth={0.8}
      />

      {Array.from({ length: petals }).map((_, i) => {
        const angle = (i / petals) * 360;
        return (
          <path
            key={i}
            d="M50 50 C 44 34, 44 24, 50 16 C 56 24, 56 34, 50 50 Z"
            fill={COBALT}
            opacity={0.85}
            transform={`rotate(${angle} 50 50)`}
          />
        );
      })}

      <circle cx="50" cy="50" r="7" fill={VERDIGRIS} />
      <circle cx="50" cy="50" r="3" fill="#F2F0E9" />

      {/* Vine, curling the way blue-pottery borders always do */}
      <path
        d="M12 78 q10 -8 20 0 q10 8 20 0 q10 -8 20 0 q10 8 16 0"
        fill="none"
        stroke={COBALT}
        strokeWidth={1.4}
      />
    </>
  );
}

/* ── 08 · Mandala ─────────────────────────────────────────────────────────
   Concentric symmetry, drawn in turmeric and copper on a dark ground. */
function Mandala({ seed }: FormProps) {
  const random = formRandom(seed);
  const tint = pick(random, [TURMERIC, SAFFRON, LOTUS]);
  const rings = 3;

  return (
    <>
      <rect width="100" height="100" fill="#121319" />
      {Array.from({ length: rings }).map((_, ring) => {
        const count = 8 + ring * 4;
        const radius = 16 + ring * 13;
        return (
          <g key={ring} opacity={0.9 - ring * 0.14}>
            {Array.from({ length: count }).map((_, i) => {
              const angle = (i / count) * Math.PI * 2;
              return (
                <circle
                  key={i}
                  cx={p3(50 + Math.cos(angle) * radius)}
                  cy={p3(50 + Math.sin(angle) * radius)}
                  r={ring === 0 ? 3.4 : ring === 1 ? 2.4 : 1.6}
                  fill={ring % 2 === 0 ? tint : CHALK}
                />
              );
            })}
            <circle
              cx="50"
              cy="50"
              r={radius}
              fill="none"
              stroke={tint}
              strokeWidth={0.6}
              opacity={0.5}
            />
          </g>
        );
      })}
      <circle cx="50" cy="50" r="6" fill={tint} />
    </>
  );
}

/* ── 09 · Pattachitra ─────────────────────────────────────────────────────
   Odisha's palm-leaf painting: an unbroken decorated border, and the great
   elongated eye. */
function Pattachitra({ seed }: FormProps) {
  const random = formRandom(seed);
  const iris = pick(random, [INK, INDIGO]);

  return (
    <>
      <rect width="100" height="100" fill="#E8D9AE" />

      {/* The border band, which in Pattachitra is never merely a frame */}
      <rect
        x="3"
        y="3"
        width="94"
        height="94"
        fill="none"
        stroke={MADDER}
        strokeWidth={6}
      />
      {Array.from({ length: 16 }).map((_, i) => (
        <circle key={i} cx={6 + i * 6} cy={6} r={1.2} fill={CREAM} />
      ))}
      {Array.from({ length: 16 }).map((_, i) => (
        <circle key={`b${i}`} cx={6 + i * 6} cy={94} r={1.2} fill={CREAM} />
      ))}

      {/* The eye */}
      <g transform="translate(50 52)">
        <path
          d="M-30 0 C -18 -16, 18 -16, 30 0 C 18 16, -18 16, -30 0 Z"
          fill={CREAM}
          stroke={INK}
          strokeWidth={2.2}
        />
        <circle cx={0} cy={0} r={10} fill={iris} />
        <circle cx={0} cy={0} r={4} fill={INK} />
        <circle cx={-3} cy={-3} r={1.6} fill={CREAM} />
        {/* Lashes */}
        {Array.from({ length: 7 }).map((_, i) => (
          <line
            key={i}
            x1={-21 + i * 7}
            y1={-11 + Math.abs(i - 3) * 1.6}
            x2={-21 + i * 7}
            y2={-17 + Math.abs(i - 3) * 1.6}
            stroke={INK}
            strokeWidth={1.4}
          />
        ))}
      </g>
    </>
  );
}

/* ── 10 · Jharokha ────────────────────────────────────────────────────────
   The Rajput cusped window a miniature is framed by, sandstone, and a garden
   glimpsed through it. */
function Jharokha({ seed }: FormProps) {
  const random = formRandom(seed);
  const sky = pick(random, [INDIGO, VERDIGRIS, "#2A2350"]);

  return (
    <>
      <rect width="100" height="100" fill="#C99A5B" />
      <rect x="8" y="8" width="84" height="84" fill="#B5813F" />

      {/* Cusped arch opening */}
      <path
        d="M22 88 L22 46 C 22 32, 34 20, 50 20 C 66 20, 78 32, 78 46 L78 88 Z"
        fill={sky}
      />
      <path
        d="M22 88 L22 46 C 22 32, 34 20, 50 20 C 66 20, 78 32, 78 46 L78 88"
        fill="none"
        stroke={CREAM}
        strokeWidth={2}
      />

      {/* A cypress, as in every garden miniature */}
      <path
        d="M50 80 C 44 64, 44 52, 50 40 C 56 52, 56 64, 50 80 Z"
        fill={VERDIGRIS}
      />
      <rect x="49" y="78" width="2" height="8" fill={MUD} />

      {/* Moon */}
      <circle cx="66" cy="36" r="5" fill={CREAM} opacity={0.9} />

      {/* Chhajja bracket detail */}
      <rect x="14" y="86" width="72" height="4" fill={CREAM} opacity={0.75} />
      {Array.from({ length: 9 }).map((_, i) => (
        <rect
          key={i}
          x={16 + i * 8}
          y={90}
          width={4}
          height={4}
          fill="#8E6330"
        />
      ))}
    </>
  );
}

const FORMS = [
  Warli,
  Madhubani,
  Phad,
  Gond,
  Ajrakh,
  Kolam,
  BluePottery,
  Mandala,
  Pattachitra,
  Jharokha,
] as const;

/** Names in tile order, so the wall can name what a visitor is looking at. */
export const GENESIS_FORM_NAMES = [
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

/** Which tradition a given seed will draw. */
export function genesisFormName(seed: number): string {
  const random = rng(seed);
  return GENESIS_FORM_NAMES[Math.floor(random() * FORMS.length)];
}

interface GenesisTileProps {
  seed: number;
  className?: string;
}

export function GenesisTile({ seed, className }: GenesisTileProps) {
  // A fresh generator, and exactly one draw from it, so re-invoking this
  // component always selects the same form.
  const Form = FORMS[Math.floor(rng(seed)() * FORMS.length)];

  return (
    <svg
      viewBox="0 0 100 100"
      className={className}
      aria-hidden
      preserveAspectRatio="xMidYMid slice"
    >
      <Form seed={seed} />

      {/* A whisper of the wall's own darkness over everything, so a grid of
          ten traditions still reads as one wall rather than ten posters. Kept
          low: these are meant to be looked at, not to sit back politely. */}
      <rect width="100" height="100" fill="#06070A" opacity="0.12" />
    </svg>
  );
}
