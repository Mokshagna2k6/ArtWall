"use client";

import { useEffect, useRef } from "react";
import { useReducedMotion } from "framer-motion";

interface DissolveBurstProps {
  /** Restarts the burst whenever this changes. */
  trigger: string | null;
  onDone?: () => void;
  className?: string;
}

/** Total run, in seconds. Long enough to read as an event, short enough that
 *  an artist waiting to see their own work never feels held up. */
const DURATION = 2.1;

/**
 * The moment a region of our wall becomes someone's artwork.
 *
 * This is the single most important animation in the product, so it is worth
 * saying what it is doing: the old surface cracks, lifts into embers, and
 * drifts off - and what is underneath is a real artist's work. Nothing pops
 * into existence. The wall was ours; now this part of it is theirs, and you
 * watched the handover.
 *
 * Canvas, not DOM: this throws about four hundred particles for two seconds.
 * Four hundred divs would mean four hundred composited layers and a stutter on
 * exactly the mid-range phone we most want this to land on. One canvas, one
 * rAF loop, and the whole burst stays inside a single frame budget.
 *
 * Under `prefers-reduced-motion` the burst does not run at all and `onDone`
 * fires immediately, so the artwork simply is there - which is the correct
 * fallback for an animation whose only job is ceremony.
 */
export function DissolveBurst({
  trigger,
  onDone,
  className,
}: DissolveBurstProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const prefersReducedMotion = useReducedMotion();

  /* Held in a ref so a re-render mid-burst cannot restart or orphan the loop:
     the burst effect must not depend on the identity of a callback the parent
     re-creates every render. Synced in its own effect rather than assigned
     during render, because a ref write during render is exactly the kind of
     side effect that breaks under concurrent rendering. */
  const doneRef = useRef(onDone);
  useEffect(() => {
    doneRef.current = onDone;
  }, [onDone]);

  useEffect(() => {
    if (!trigger) return;

    if (prefersReducedMotion) {
      doneRef.current?.();
      return;
    }

    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context) {
      doneRef.current?.();
      return;
    }

    const rect = canvas.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const width = rect.width;
    const height = rect.height;
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    context.setTransform(dpr, 0, 0, dpr, 0, 0);

    interface Ember {
      x: number;
      y: number;
      vx: number;
      vy: number;
      size: number;
      life: number;
      hue: number;
      spin: number;
    }

    // Particles start spread across the whole region, because the surface is
    // dissolving everywhere at once rather than exploding from a point.
    const count = Math.min(420, Math.round((width * height) / 90));
    const embers: Ember[] = Array.from({ length: count }, () => {
      const x = Math.random() * width;
      const y = Math.random() * height;
      // Drift outward from the centre, plus a consistent upward lift - embers
      // rise, and that read is what separates this from confetti.
      const cx = width / 2;
      const cy = height / 2;
      const angle = Math.atan2(y - cy, x - cx);
      const speed = 12 + Math.random() * 46;
      return {
        x,
        y,
        vx: Math.cos(angle) * speed * (0.4 + Math.random() * 0.8),
        vy: Math.sin(angle) * speed * 0.5 - (24 + Math.random() * 46),
        size: 0.8 + Math.random() * 2.6,
        life: 0.45 + Math.random() * 0.55,
        hue: 28 + Math.random() * 22,
        spin: (Math.random() - 0.5) * 2,
      };
    });

    let start: number | null = null;
    let frame = 0;

    function draw(now: number) {
      start ??= now;
      const elapsed = (now - start) / 1000;
      const t = Math.min(1, elapsed / DURATION);

      context!.clearRect(0, 0, width, height);

      // A crack of light sweeping the region, brightest at the handover.
      const sweep = Math.sin(Math.min(1, t * 1.6) * Math.PI);
      if (sweep > 0.01) {
        const gradient = context!.createLinearGradient(0, 0, width, height);
        gradient.addColorStop(0, "rgba(232,163,61,0)");
        gradient.addColorStop(
          Math.min(0.95, t * 1.2),
          `rgba(244,200,122,${0.5 * sweep})`
        );
        gradient.addColorStop(1, "rgba(232,163,61,0)");
        context!.fillStyle = gradient;
        context!.fillRect(0, 0, width, height);
      }

      context!.globalCompositeOperation = "lighter";
      for (const ember of embers) {
        // Particles hold, then release - the surface resists before it gives.
        const local = Math.max(0, (t - (1 - ember.life)) / ember.life);
        if (local <= 0) continue;

        const alpha = Math.max(0, 1 - local) * 0.9;
        if (alpha <= 0.01) continue;

        const x = ember.x + ember.vx * local;
        const y = ember.y + ember.vy * local + 40 * local * local;
        const size = ember.size * (1 - local * 0.5);

        context!.beginPath();
        context!.arc(x, y + ember.spin, Math.max(0.2, size), 0, Math.PI * 2);
        context!.fillStyle = `hsla(${ember.hue}, 92%, ${58 + local * 20}%, ${alpha})`;
        context!.fill();
      }
      context!.globalCompositeOperation = "source-over";

      if (t < 1) {
        frame = requestAnimationFrame(draw);
      } else {
        context!.clearRect(0, 0, width, height);
        doneRef.current?.();
      }
    }

    frame = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(frame);
  }, [trigger, prefersReducedMotion]);

  if (!trigger) return null;

  return (
    <canvas
      ref={canvasRef}
      aria-hidden
      className={className}
      style={{ pointerEvents: "none" }}
    />
  );
}
