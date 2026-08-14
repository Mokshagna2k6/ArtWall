"use client";

import { useCallback, useRef, useState } from "react";
import { Eraser } from "lucide-react";

import { cn } from "@/lib/utils";

type Point = { x: number; y: number };
type Stroke = Point[];

const VIEWBOX_WIDTH = 600;
const VIEWBOX_HEIGHT = 200;

/** Catmull-Rom-ish smoothing: turns sampled points into a flowing path. */
function toPath(stroke: Stroke): string {
  if (stroke.length < 2) {
    // A single tap still deserves a mark - render it as a dot.
    const p = stroke[0];
    return p ? `M ${p.x} ${p.y} l 0.1 0` : "";
  }

  let d = `M ${stroke[0].x} ${stroke[0].y}`;
  for (let i = 1; i < stroke.length - 1; i += 1) {
    const midX = (stroke[i].x + stroke[i + 1].x) / 2;
    const midY = (stroke[i].y + stroke[i + 1].y) / 2;
    d += ` Q ${stroke[i].x} ${stroke[i].y} ${midX} ${midY}`;
  }
  const last = stroke[stroke.length - 1];
  return `${d} L ${last.x} ${last.y}`;
}

export interface SignatureValue {
  /** SVG path commands, one per stroke. */
  paths: string[];
  viewBox: string;
}

interface SignatureCanvasProps {
  value: SignatureValue | null;
  onChange: (value: SignatureValue | null) => void;
  className?: string;
  label?: string;
}

/**
 * The Signature Canvas - an artist signs the wall by hand (Phase 1 #21).
 *
 * Why this and not a name field: a typed name is data, a drawn signature is
 * *yours*. It is the one artefact on the site that is unrepeatable, and it is
 * what later carries onto the certificate and the share card. Phase 1 scored
 * it the strongest single idea in the whole blueprint.
 *
 * Implementation: strokes are captured in normalised viewBox coordinates and
 * stored as SVG path data, not as pixels - so the same signature stays crisp
 * on a 40px avatar, a share card, or a printed certificate, at a fraction of
 * the bytes of a raster capture.
 *
 * Accessibility: freehand drawing cannot be done with a keyboard, so this is
 * never the only path forward - the parent always offers a typed alternative,
 * and this control is explicitly optional. Pointer Events cover mouse, touch,
 * and stylus with one code path, and `touch-none` stops the browser from
 * scrolling the page out from under a finger mid-stroke.
 *
 * Performance: the in-progress stroke lives in a ref and is committed to React
 * state only on pointer-up; while drawing, the live path is written straight to
 * the DOM node. That keeps a drag at 60fps instead of re-rendering per sample.
 */
export function SignatureCanvas({
  value,
  onChange,
  className,
  label = "Sign the wall",
}: SignatureCanvasProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const liveRef = useRef<SVGPathElement>(null);
  const current = useRef<Stroke>([]);
  const [drawing, setDrawing] = useState(false);

  const toViewBox = useCallback((event: React.PointerEvent): Point | null => {
    const svg = svgRef.current;
    if (!svg) return null;
    const rect = svg.getBoundingClientRect();
    return {
      x: ((event.clientX - rect.left) / rect.width) * VIEWBOX_WIDTH,
      y: ((event.clientY - rect.top) / rect.height) * VIEWBOX_HEIGHT,
    };
  }, []);

  function handlePointerDown(event: React.PointerEvent<SVGSVGElement>) {
    const point = toViewBox(event);
    if (!point) return;

    event.currentTarget.setPointerCapture(event.pointerId);
    current.current = [point];
    setDrawing(true);
  }

  function handlePointerMove(event: React.PointerEvent<SVGSVGElement>) {
    if (!drawing) return;
    const point = toViewBox(event);
    if (!point) return;

    current.current.push(point);
    // Write directly to the DOM - no React render per pointer sample.
    liveRef.current?.setAttribute("d", toPath(current.current));
  }

  function handlePointerUp() {
    if (!drawing) return;
    setDrawing(false);

    const stroke = current.current;
    current.current = [];
    liveRef.current?.setAttribute("d", "");

    if (stroke.length === 0) return;

    onChange({
      paths: [...(value?.paths ?? []), toPath(stroke)],
      viewBox: `0 0 ${VIEWBOX_WIDTH} ${VIEWBOX_HEIGHT}`,
    });
  }

  const hasSignature = (value?.paths.length ?? 0) > 0;

  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <div className="flex items-baseline justify-between">
        <span
          id="signature-label"
          className="text-label text-muted-foreground tracking-wider uppercase"
        >
          {label}
        </span>
        {hasSignature && (
          <button
            type="button"
            onClick={() => onChange(null)}
            className="text-muted-foreground hover:text-foreground text-small inline-flex items-center gap-1.5 transition-colors"
          >
            <Eraser className="size-3.5" aria-hidden />
            Clear
          </button>
        )}
      </div>

      <svg
        ref={svgRef}
        viewBox={`0 0 ${VIEWBOX_WIDTH} ${VIEWBOX_HEIGHT}`}
        role="img"
        aria-labelledby="signature-label"
        aria-describedby="signature-hint"
        className="border-border bg-wall-charcoal aspect-[3/1] w-full touch-none rounded-lg border"
        style={{ cursor: "crosshair" }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerLeave={handlePointerUp}
        onPointerCancel={handlePointerUp}
      >
        {/* Committed strokes */}
        {value?.paths.map((d, i) => (
          <path
            key={i}
            d={d}
            fill="none"
            stroke="var(--color-ember)"
            strokeWidth={3}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        ))}
        {/* The stroke currently under the pointer */}
        <path
          ref={liveRef}
          fill="none"
          stroke="var(--color-ember)"
          strokeWidth={3}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>

      <p id="signature-hint" className="text-muted-foreground text-caption">
        {hasSignature
          ? "This mark is yours. It stays with your work."
          : "Draw with your mouse, finger, or stylus. Optional."}
      </p>
    </div>
  );
}
