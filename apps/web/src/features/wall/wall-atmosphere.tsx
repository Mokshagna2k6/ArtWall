"use client";

import { useEffect, useRef } from "react";
import { useReducedMotion } from "framer-motion";

/**
 * The air in the room.
 *
 * Dust drifting through a gallery's light is the cheapest, most convincing
 * signal that a space is real rather than rendered - it is the thing your eye
 * uses to tell a photograph of a room from a flat image of a wall. It is also
 * the easiest thing to overdo: this is deliberately sparse, slow, and dim
 * enough that most visitors will never consciously notice it.
 *
 * One `<canvas>` and one rAF loop rather than N animated DOM nodes. Sixty
 * absolutely-positioned divs with CSS transforms would each earn a compositor
 * layer and would visibly cost frames on the mid-range Android a lot of our
 * artists are browsing on; a canvas costs one layer regardless of mote count.
 *
 * Pauses entirely when off-screen or when the tab is hidden - an invisible
 * animation that keeps burning battery is a bug, not an ambience.
 */
export function WallAtmosphere({ className }: { className?: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const prefersReducedMotion = useReducedMotion();

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || prefersReducedMotion) return;

    const context = canvas.getContext("2d");
    if (!context) return;

    let width = 0;
    let height = 0;
    let frame = 0;
    let running = true;

    interface Mote {
      x: number;
      y: number;
      radius: number;
      drift: number;
      rise: number;
      alpha: number;
      phase: number;
    }

    let motes: Mote[] = [];

    // Density scales with area, so a wide desktop is not sparse and a phone is
    // not choked. Capped, because past ~90 the eye stops reading it as dust.
    function seed() {
      const count = Math.min(90, Math.round((width * height) / 16000));
      motes = Array.from({ length: count }, (_, i) => ({
        x: Math.random() * width,
        y: Math.random() * height,
        radius: 0.4 + Math.random() * 1.4,
        drift: (Math.random() - 0.5) * 0.16,
        rise: -0.05 - Math.random() * 0.16,
        alpha: 0.08 + Math.random() * 0.24,
        phase: i,
      }));
    }

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      width = rect.width;
      height = rect.height;
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      context.setTransform(dpr, 0, 0, dpr, 0, 0);
      seed();
    };

    resize();

    const observer = new ResizeObserver(resize);
    observer.observe(canvas);

    let time = 0;
    function draw() {
      if (!running) return;
      time += 0.016;
      context!.clearRect(0, 0, width, height);

      for (const mote of motes) {
        mote.x += mote.drift + Math.sin(time * 0.4 + mote.phase) * 0.08;
        mote.y += mote.rise;

        // Wrap rather than respawn, so density never visibly pulses.
        if (mote.y < -4) {
          mote.y = height + 4;
          mote.x = Math.random() * width;
        }
        if (mote.x < -4) mote.x = width + 4;
        if (mote.x > width + 4) mote.x = -4;

        const twinkle = 0.7 + Math.sin(time * 1.1 + mote.phase) * 0.3;
        context!.beginPath();
        context!.arc(mote.x, mote.y, mote.radius, 0, Math.PI * 2);
        context!.fillStyle = `rgba(244, 200, 122, ${mote.alpha * twinkle})`;
        context!.fill();
      }

      frame = requestAnimationFrame(draw);
    }

    frame = requestAnimationFrame(draw);

    // Stop when nobody is looking.
    const visibility = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && !running) {
          running = true;
          frame = requestAnimationFrame(draw);
        } else if (!entry.isIntersecting) {
          running = false;
          cancelAnimationFrame(frame);
        }
      },
      { threshold: 0 }
    );
    visibility.observe(canvas);

    const onVisibilityChange = () => {
      if (document.hidden) {
        running = false;
        cancelAnimationFrame(frame);
      } else if (!running) {
        running = true;
        frame = requestAnimationFrame(draw);
      }
    };
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      running = false;
      cancelAnimationFrame(frame);
      observer.disconnect();
      visibility.disconnect();
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [prefersReducedMotion]);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden
      className={className}
      // The canvas is decoration over a scrollable, draggable wall - it must
      // never intercept a pointer.
      style={{ pointerEvents: "none" }}
    />
  );
}
