"use client";

/* eslint-disable @next/next/no-img-element --
   Cloudinary delivers these at an exact pixel size in AVIF/WebP with q_auto.
   next/image would re-optimise an already-optimal asset and add a hop for
   nothing. Every region has a fixed width and height, so there is no layout
   shift for next/image to prevent. */

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { gsap } from "gsap";
import { useReducedMotion } from "framer-motion";

import { DissolveBurst } from "@/features/wall/dissolve-burst";
import { GenesisTile } from "@/features/wall/genesis-tile";
import { WallAtmosphere } from "@/features/wall/wall-atmosphere";
import {
  composeWall,
  findRegion,
  type WallRegion,
} from "@/features/wall/wall-layout";
import type { WallTile } from "@/features/wall/types";
import { blurSrc, tileSrc } from "@/lib/cloudinary-url";
import { cn } from "@/lib/utils";

interface MuseumWallProps {
  tiles: WallTile[];
  /** A work just uploaded, hung before the server cache has caught up. */
  pending?: WallTile | null;
  onOpen: (tile: WallTile) => void;
}

interface Camera {
  x: number;
  y: number;
  scale: number;
}

const MAX_SCALE = 2.4;
/** Render this far beyond the viewport, so panning never reveals a hole. */
const CULL_MARGIN = 500;

/**
 * The wall, as a room you move through.
 *
 * Three things make this a museum rather than a gallery of thumbnails:
 *
 *   The composition is justified and irregular - mixed portrait, square and
 *   landscape work, rows that line up at the edges but never repeat a size.
 *   The camera is yours - drag to walk along the wall, scroll to lean in.
 *   The surface is lit and dusty and slightly crooked, because real walls are.
 *
 * Performance is the reason for most of the structure here. The camera writes
 * its transform straight to the DOM in a pointer handler rather than through
 * React state - a wall of two hundred regions re-rendering on every
 * pointermove would drop frames on any device. React is only told about the
 * camera when it settles, and only so it can cull: regions outside the
 * viewport plus a margin are never mounted at all, which keeps the DOM at a
 * few dozen nodes no matter how large the community grows.
 */
export function MuseumWall({ tiles, pending = null, onOpen }: MuseumWallProps) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const breatheRef = useRef<HTMLDivElement>(null);
  const cameraRef = useRef<HTMLDivElement>(null);
  const prefersReducedMotion = useReducedMotion();

  const realTiles = useMemo(() => {
    if (!pending) return tiles;
    const rest = tiles.filter((tile) => tile.artworkUrl !== pending.artworkUrl);
    return [pending, ...rest];
  }, [tiles, pending]);

  const composition = useMemo(() => composeWall(realTiles), [realTiles]);

  /* The live camera. A ref because it is written on every pointer frame; the
     `settled` state below is the throttled copy React is allowed to see. */
  const camera = useRef<Camera>({ x: 0, y: 0, scale: 1 });
  const [settled, setSettled] = useState<Camera>({ x: 0, y: 0, scale: 1 });
  const [viewport, setViewport] = useState({ width: 0, height: 0 });
  const [dragging, setDragging] = useState(false);
  const [hasMoved, setHasMoved] = useState(false);

  /** Smallest scale that still covers the viewport - the wall never letterboxes. */
  const minScale = useMemo(() => {
    if (!viewport.width || !viewport.height) return 1;
    return Math.max(
      viewport.width / composition.width,
      viewport.height / composition.height
    );
  }, [viewport, composition]);

  const clamp = useCallback(
    (next: Camera): Camera => {
      const scale = Math.min(MAX_SCALE, Math.max(minScale, next.scale));
      const spanX = composition.width * scale;
      const spanY = composition.height * scale;
      return {
        scale,
        x: Math.min(0, Math.max(viewport.width - spanX, next.x)),
        y: Math.min(0, Math.max(viewport.height - spanY, next.y)),
      };
    },
    [minScale, composition, viewport]
  );

  const paint = useCallback(() => {
    const node = cameraRef.current;
    if (!node) return;
    const { x, y, scale } = camera.current;
    node.style.transform = `translate3d(${x}px, ${y}px, 0) scale(${scale})`;
  }, []);

  /* Tell React where the camera is, but not on every frame. Culling only needs
     to be right by the time the next paint matters, and a state write per
     pointermove is exactly the cost this architecture exists to avoid. */
  const settleTimer = useRef<number | null>(null);
  const scheduleSettle = useCallback(() => {
    if (settleTimer.current !== null) return;
    settleTimer.current = window.setTimeout(() => {
      settleTimer.current = null;
      setSettled({ ...camera.current });
    }, 90);
  }, []);

  // Measure, and centre the wall the first time we know how big we are.
  useLayoutEffect(() => {
    const node = viewportRef.current;
    if (!node) return;

    const measure = () => {
      const rect = node.getBoundingClientRect();
      setViewport({ width: rect.width, height: rect.height });
    };

    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  const centred = useRef(false);
  useLayoutEffect(() => {
    if (centred.current || !viewport.width || !viewport.height) return;
    centred.current = true;

    const scale = minScale;
    camera.current = clamp({
      scale,
      x: (viewport.width - composition.width * scale) / 2,
      y: (viewport.height - composition.height * scale) / 2,
    });
    paint();
    setSettled({ ...camera.current });
  }, [viewport, minScale, clamp, composition, paint]);

  /* Arrival: the slow walk up to the wall, then a breath that never stops.
     The breathing lives on a wrapper rather than on the camera itself so that
     dragging and idle motion cannot fight over one transform. */
  useLayoutEffect(() => {
    const breathe = breatheRef.current;
    if (!breathe || prefersReducedMotion || !viewport.width) return;

    const context = gsap.context(() => {
      gsap.fromTo(
        breathe,
        { scale: 1.14, opacity: 0 },
        { scale: 1, opacity: 1, duration: 2.2, ease: "power3.out" }
      );
      gsap.to(breathe, {
        scale: 1.012,
        duration: 9,
        ease: "sine.inOut",
        yoyo: true,
        repeat: -1,
        delay: 2.2,
      });
    }, breathe);

    return () => context.revert();
  }, [prefersReducedMotion, viewport.width]);

  // ── Pointer: drag to walk the wall ──────────────────────────────────────
  const dragState = useRef<{ id: number; x: number; y: number } | null>(null);

  function onPointerDown(event: React.PointerEvent<HTMLDivElement>) {
    if (event.button !== 0 && event.pointerType === "mouse") return;
    dragState.current = {
      id: event.pointerId,
      x: event.clientX,
      y: event.clientY,
    };
    setDragging(true);
    setHasMoved(true);
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function onPointerMove(event: React.PointerEvent<HTMLDivElement>) {
    const drag = dragState.current;
    if (!drag || drag.id !== event.pointerId) return;

    camera.current = clamp({
      ...camera.current,
      x: camera.current.x + (event.clientX - drag.x),
      y: camera.current.y + (event.clientY - drag.y),
    });
    drag.x = event.clientX;
    drag.y = event.clientY;
    paint();
    scheduleSettle();
  }

  function endDrag(event: React.PointerEvent<HTMLDivElement>) {
    if (dragState.current?.id !== event.pointerId) return;
    dragState.current = null;
    setDragging(false);
    setSettled({ ...camera.current });
  }

  // ── Wheel: lean in and out, anchored on the cursor ──────────────────────
  useEffect(() => {
    const node = viewportRef.current;
    if (!node) return;

    function onWheel(event: WheelEvent) {
      // Only take over the page's scroll when the visitor is actually zooming.
      if (!event.ctrlKey && Math.abs(event.deltaY) < 2) return;
      event.preventDefault();

      const rect = node!.getBoundingClientRect();
      const pointerX = event.clientX - rect.left;
      const pointerY = event.clientY - rect.top;

      const current = camera.current;
      const factor = Math.exp(-event.deltaY * 0.0016);
      const next = clamp({
        scale: current.scale * factor,
        // Keep whatever is under the cursor under the cursor.
        x:
          pointerX -
          ((pointerX - current.x) / current.scale) * (current.scale * factor),
        y:
          pointerY -
          ((pointerY - current.y) / current.scale) * (current.scale * factor),
      });

      camera.current = next;
      setHasMoved(true);
      paint();
      scheduleSettle();
    }

    node.addEventListener("wheel", onWheel, { passive: false });
    return () => node.removeEventListener("wheel", onWheel);
  }, [clamp, paint, scheduleSettle]);

  // ── The handover: pan to the new work, then dissolve our surface off it ──

  /* Which region is mid-handover is a *function* of what was just published -
     derived, not stored. Storing it would mean an effect that writes state the
     moment `pending` changes, which is a cascading render and leaves a frame
     where the wall disagrees with itself about what is dissolving. */
  const dissolvingRegion = useMemo(
    () => (pending ? findRegion(composition, pending.artworkUrl) : null),
    [pending, composition]
  );

  /* Only the completion is state, and it is written from the burst's own
     callback, an event, not a render side effect. A stale id from a previous
     handover simply never matches the current region, so nothing needs
     resetting. */
  const [revealed, setRevealed] = useState<string | null>(null);

  useEffect(() => {
    const region = dissolvingRegion;
    if (!region || !viewport.width || prefersReducedMotion) return;

    // Walk the camera to where their work has just been hung.
    const target = clamp({
      scale: Math.min(MAX_SCALE, Math.max(minScale, 1.15)),
      x: viewport.width / 2 - (region.x + region.width / 2) * 1.15,
      y: viewport.height / 2 - (region.y + region.height / 2) * 1.15,
    });

    const tween = gsap.to(camera.current, {
      ...target,
      duration: 1.5,
      ease: "power3.inOut",
      onUpdate: paint,
      onComplete: () => setSettled({ ...camera.current }),
    });

    return () => {
      tween.kill();
    };
  }, [
    dissolvingRegion,
    viewport,
    minScale,
    clamp,
    paint,
    prefersReducedMotion,
  ]);

  // ── Culling ─────────────────────────────────────────────────────────────
  const visible = useMemo(() => {
    if (!viewport.width) return composition.regions.slice(0, 60);

    const left = (-settled.x - CULL_MARGIN) / settled.scale;
    const top = (-settled.y - CULL_MARGIN) / settled.scale;
    const right = (-settled.x + viewport.width + CULL_MARGIN) / settled.scale;
    const bottom = (-settled.y + viewport.height + CULL_MARGIN) / settled.scale;

    return composition.regions.filter(
      (region) =>
        region.x + region.width > left &&
        region.x < right &&
        region.y + region.height > top &&
        region.y < bottom
    );
  }, [composition, settled, viewport]);

  return (
    <div
      ref={viewportRef}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      className={cn(
        "bg-wall-black relative h-[28rem] touch-none overflow-hidden select-none sm:h-[34rem] lg:h-[42rem]",
        dragging ? "cursor-grabbing" : "cursor-grab"
      )}
    >
      {/* Layer 1, the gallery wall itself: plaster, tint, and grain. */}
      <div aria-hidden className="absolute inset-0 bg-[#0f0f0f]" />
      <div
        aria-hidden
        className="absolute inset-0 opacity-[0.5]"
        style={{ backgroundImage: PLASTER, backgroundSize: "180px 180px" }}
      />

      {/* Layers 2 & 3, the mural, and the artworks replacing it. */}
      <div ref={breatheRef} className="absolute inset-0 will-change-transform">
        <div
          ref={cameraRef}
          className="absolute top-0 left-0 will-change-transform"
          style={{
            width: composition.width,
            height: composition.height,
            transformOrigin: "0 0",
          }}
        >
          {visible.map((region) => (
            <Region
              key={region.id}
              region={region}
              onOpen={onOpen}
              dissolving={dissolvingRegion?.id === region.id}
              revealed={prefersReducedMotion || revealed === region.id}
              onDissolved={() => setRevealed(region.id)}
            />
          ))}
        </div>
      </div>

      {/* Layer 5, atmosphere. */}
      <WallAtmosphere className="absolute inset-0 z-20 size-full" />

      {/* The room's single light source, high and central. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 z-20"
        style={{
          background:
            "radial-gradient(ellipse 60% 55% at 50% -8%, rgb(244 200 122 / 0.22), transparent 60%)",
        }}
      />
      {/* Vignette, so the wall reads as continuing past the frame. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 z-20"
        style={{
          background:
            "radial-gradient(ellipse 78% 72% at 50% 42%, transparent 12%, rgb(6 7 10 / 0.55) 55%, rgb(6 7 10 / 0.97) 100%)",
        }}
      />

      {/* Layer 4, the one instruction anybody needs, until they use it. */}
      {!hasMoved && (
        <p className="border-border bg-wall-charcoal/80 text-caption text-muted-foreground pointer-events-none absolute bottom-4 left-1/2 z-30 -translate-x-1/2 rounded-full border px-4 py-2 backdrop-blur-md">
          Drag to walk the wall &middot; scroll to lean in
        </p>
      )}
    </div>
  );
}

/* ── One region of the wall ─────────────────────────────────────────────── */

function Region({
  region,
  onOpen,
  dissolving,
  revealed,
  onDissolved,
}: {
  region: WallRegion;
  onOpen: (tile: WallTile) => void;
  dissolving: boolean;
  revealed: boolean;
  onDissolved: () => void;
}) {
  const tile = region.tile;

  const box = {
    left: region.x,
    top: region.y,
    width: region.width,
    height: region.height,
    transform: `rotate(${region.tilt}deg) translateZ(${region.depth}px)`,
    /* The room's light, falling unevenly. Applied as a filter on the frame
       rather than baked into each drawing, so one wall of ten traditions reads
       as one lit surface instead of ten posters at full brightness. */
    filter: `brightness(${region.tone}) saturate(${region.saturation})`,
  } as const;

  // Ours, for now.
  if (!tile) {
    return (
      <div
        aria-hidden
        className="absolute overflow-hidden rounded-[2px] shadow-[0_10px_28px_rgb(0_0_0/0.55)] ring-1 ring-white/5"
        style={box}
      >
        <GenesisTile seed={region.seed} className="size-full" />
        {/* Every frame catches the overhead light on its top edge. */}
        <span className="pointer-events-none absolute inset-x-0 top-0 h-px bg-white/20" />
        <span className="pointer-events-none absolute inset-0 bg-linear-to-b from-white/5 to-black/25" />
      </div>
    );
  }

  const showArtwork = !dissolving || revealed;

  return (
    <button
      type="button"
      onClick={() => onOpen(tile)}
      className="group hover:ring-ember/60 focus-visible:ring-ember absolute overflow-hidden rounded-[2px] shadow-[0_14px_36px_rgb(0_0_0/0.6)] ring-1 ring-white/10 transition-shadow duration-500 hover:z-10 hover:shadow-[0_22px_60px_rgb(0_0_0/0.75)]"
      style={{
        ...box,
        backgroundImage: `url(${blurSrc(tile.artworkUrl)})`,
        backgroundSize: "cover",
        backgroundPosition: "center",
      }}
    >
      <img
        src={tileSrc(tile.artworkUrl, 480)}
        alt={
          tile.artworkTitle
            ? `${tile.artworkTitle} by ${tile.name}`
            : `Artwork by ${tile.name}`
        }
        loading="lazy"
        decoding="async"
        className={cn(
          "size-full object-cover transition-all duration-700 group-hover:scale-[1.04]",
          showArtwork ? "opacity-100" : "opacity-0"
        )}
      />

      {/* Our surface, burning off to reveal theirs. */}
      {dissolving && !revealed && (
        <span className="absolute inset-0">
          <GenesisTile seed={region.seed} className="size-full" />
        </span>
      )}
      <DissolveBurst
        trigger={dissolving && !revealed ? region.id : null}
        onDone={onDissolved}
        className="absolute inset-0 z-10 size-full"
      />

      <span className="pointer-events-none absolute inset-x-0 top-0 h-px bg-white/20" />

      {/* The placard, on approach. */}
      <span className="from-wall-black/95 pointer-events-none absolute inset-x-0 bottom-0 translate-y-full bg-linear-to-t to-transparent p-2 text-left transition-transform duration-300 group-hover:translate-y-0 group-focus-visible:translate-y-0">
        <span className="text-caption block truncate font-medium">
          {tile.name}
        </span>
        {tile.artworkTitle && (
          <span className="text-ink-muted block truncate text-[10px]">
            {tile.artworkTitle}
          </span>
        )}
      </span>
    </button>
  );
}

/**
 * Plaster: fractal noise baked into a data URI.
 *
 * An SVG filter rather than a texture file - it is under a kilobyte, scales to
 * any density without going soft, and costs no network request on a wall that
 * is already asking a lot of a 4G connection.
 */
const PLASTER = `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='180' height='180'%3E%3Cfilter id='p'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3CfeColorMatrix type='saturate' values='0'/%3E%3C/filter%3E%3Crect width='180' height='180' filter='url(%23p)' opacity='0.35'/%3E%3C/svg%3E")`;
