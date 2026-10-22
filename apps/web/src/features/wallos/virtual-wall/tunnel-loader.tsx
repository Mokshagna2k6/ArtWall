"use client";

import { useEffect, useMemo, useState, type CSSProperties } from "react";

/**
 * The entry sequence: light streaks rushing toward a vanishing point while the
 * building loads.
 *
 * Pure CSS on plain divs, not a second 3D scene. It has to be on screen
 * *before* three.js has been fetched (it covers the `next/dynamic` chunk load
 * as well as texture loading), so it cannot itself depend on the renderer it
 * is waiting for — and a few dozen animated divs cost nothing next to the
 * scene behind them.
 *
 * Never a trap: `percent` is advisory only. The overlay is removed by its
 * owner when the scene is ready, and it always offers "Enter now" so a stalled
 * or failed asset load cannot leave a visitor staring at a black screen.
 */

/** How many streaks. Enough to read as motion, few enough to stay cheap. */
const STREAK_COUNT = 44;

export function TunnelLoader({
  percent,
  onSkip,
  label,
}: {
  /** 0-100. Advisory: the overlay is dismissed by its owner, not by this. */
  percent: number;
  /** Shown as "Enter now" when provided — the escape hatch from a stall. */
  onSkip?: () => void;
  label?: string;
}) {
  // Deterministic, not Math.random(): a golden-angle spread gives even cover
  // with no two streaks overlapping, and it is pure, so it is safe to compute
  // in render (React Compiler forbids impure calls there) and renders the same
  // on every pass instead of jittering.
  const streaks = useMemo(
    () =>
      Array.from({ length: STREAK_COUNT }, (_, i) => {
        const t = i / STREAK_COUNT;
        return {
          key: i,
          angle: (i * 137.508) % 360,
          // Off the exact centre, so none degenerates to a dot.
          distance: 12 + ((i * 17) % 47),
          // Spread the phases so the tunnel is already full on the first frame.
          delay: -(t * 2.6),
          duration: 1.5 + ((i * 7) % 16) / 10,
        };
      }),
    []
  );

  const clamped = Math.max(0, Math.min(100, Math.round(percent)));

  return (
    <div
      className="absolute inset-0 z-10 overflow-hidden rounded-lg bg-black"
      role="status"
      aria-live="polite"
      aria-label={`${label ?? "Entering the gallery"}, ${clamped}%`}
    >
      {/* The tunnel. `motion-reduce:hidden` leaves the black field and the
          progress text for anyone who asked for less motion. */}
      <div className="absolute inset-0 motion-reduce:hidden" aria-hidden>
        {streaks.map((s) => (
          <span
            key={s.key}
            className="absolute top-1/2 left-1/2 block h-px w-[22vmax] origin-left bg-gradient-to-r from-transparent via-white/70 to-white"
            style={
              {
                // The keyframes read `--a` so each streak keeps its own
                // direction: an inline `transform` would just be overridden by
                // the animation's own transform.
                "--a": `${s.angle}deg`,
                "--d": `${s.distance}%`,
                animation: `artwall-warp ${s.duration}s linear ${s.delay}s infinite`,
              } as CSSProperties
            }
          />
        ))}
      </div>

      {/* Haze at the vanishing point, so the streaks read as coming *from*
          somewhere. */}
      <div
        aria-hidden
        className="absolute top-1/2 left-1/2 h-40 w-40 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white/20 blur-3xl"
      />

      <div className="absolute inset-x-0 bottom-10 flex flex-col items-center gap-3 px-6 text-center">
        <p className="text-xs tracking-[0.3em] text-white/80 uppercase">
          {label ?? "Entering the gallery"}
        </p>
        <div className="h-px w-48 max-w-full overflow-hidden bg-white/20">
          <div
            className="h-full bg-white transition-[width] duration-300 ease-out"
            style={{ width: `${clamped}%` }}
          />
        </div>
        <p className="text-[11px] text-white/50 tabular-nums">{clamped}%</p>
        {onSkip && (
          <button
            type="button"
            onClick={onSkip}
            className="mt-1 rounded-full border border-white/40 px-4 py-1.5 text-xs text-white hover:bg-white/10"
          >
            Enter now
          </button>
        )}
      </div>

      {/* Scoped here rather than in the global sheet: this is the only thing
          that uses it, and it dies with the component. */}
      <style>{`
        @keyframes artwall-warp {
          0%   { opacity: 0; transform: rotate(var(--a, 0deg)) translateX(var(--d, 0%)) scaleX(0.08); }
          12%  { opacity: 1; }
          100% { opacity: 0; transform: rotate(var(--a, 0deg)) translateX(220%) scaleX(1); }
        }
      `}</style>
    </div>
  );
}

/**
 * Fake-but-honest progress for the phase before three.js exists.
 *
 * `useProgress` cannot report on the `next/dynamic` chunk fetch — it lives
 * inside the renderer being fetched. This eases toward 90% and stops there, so
 * the bar never claims to be finished while it is still waiting.
 */
export function useChunkProgress(): number {
  const [percent, setPercent] = useState(8);
  useEffect(() => {
    const id = setInterval(() => setPercent((p) => (p >= 90 ? p : p + (90 - p) * 0.12)), 180);
    return () => clearInterval(id);
  }, []);
  return percent;
}

/** The dynamic-import fallback: the same tunnel, driven by the eased estimate. */
export function TunnelLoaderFallback() {
  const percent = useChunkProgress();
  return (
    <div className="bg-band relative h-[70vh] min-h-[420px] w-full overflow-hidden rounded-lg">
      <TunnelLoader percent={percent} label="Loading the building" />
    </div>
  );
}
