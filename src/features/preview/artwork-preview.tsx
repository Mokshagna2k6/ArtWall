"use client";

/* eslint-disable @next/next/no-img-element -- local object URLs are never sent to a server. */

import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import {
  Check,
  ImageUp,
  LockKeyhole,
  MoveRight,
  Sparkles,
  X,
} from "lucide-react";

import { rooms } from "@/features/preview/rooms";
import { cn } from "@/lib/utils";

const MAX_BYTES = 12 * 1024 * 1024;
const ACCEPTED = ["image/jpeg", "image/png", "image/webp", "image/avif"];

type Status =
  | { state: "empty" }
  | { state: "ready"; src: string; name: string }
  | { state: "error"; message: string };

/** A private, client-only exhibition mockup for an artist's work. */
export function ArtworkPreview() {
  const [status, setStatus] = useState<Status>({ state: "empty" });
  const [roomId, setRoomId] = useState(rooms[0].id);
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const objectUrl = useRef<string | null>(null);
  const reduceMotion = useReducedMotion();
  const room = rooms.find((candidate) => candidate.id === roomId) ?? rooms[0];
  const isVirtualRoom = room.id === "hotel";

  const release = useCallback(() => {
    if (objectUrl.current) URL.revokeObjectURL(objectUrl.current);
    objectUrl.current = null;
  }, []);

  useEffect(() => release, [release]);

  const accept = useCallback(
    (file: File | undefined) => {
      if (!file) return;
      if (!ACCEPTED.includes(file.type)) {
        setStatus({
          state: "error",
          message: "Use a JPG, PNG, WebP or AVIF image.",
        });
        return;
      }
      if (file.size > MAX_BYTES) {
        setStatus({
          state: "error",
          message: "That image is over 12 MB. Try a smaller export.",
        });
        return;
      }
      release();
      const src = URL.createObjectURL(file);
      objectUrl.current = src;
      setStatus({ state: "ready", src, name: file.name });
    },
    [release]
  );

  function reset() {
    release();
    setStatus({ state: "empty" });
    if (inputRef.current) inputRef.current.value = "";
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_18rem] lg:items-start">
      <div className="overflow-hidden rounded-[2rem] border border-[#f0f0f0] bg-white shadow-[0_20px_60px_rgb(16_17_20/0.10)]">
        <div
          className="relative aspect-[16/10] overflow-hidden"
          style={{ background: room.wall }}
        >
          <AnimatePresence mode="wait">
            <motion.div
              key={room.id}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: reduceMotion ? 0 : 0.45 }}
              className="absolute inset-0"
            >
              <div className="absolute inset-x-[7%] top-[9%] h-px bg-black/10" />
              <div className="absolute inset-y-0 left-[9%] w-px bg-white/15" />
              <div className="absolute inset-y-0 right-[9%] w-px bg-black/8" />
              {isVirtualRoom ? (
                <VirtualExhibitionArchitecture floor={room.floor} />
              ) : (
                <>
                  <div
                    className="absolute inset-x-0 bottom-0 h-[23%]"
                    style={{ background: room.floor }}
                  />
                  <div className="pointer-events-none absolute inset-x-0 bottom-[22.6%] h-2 bg-black/10 blur-sm" />
                </>
              )}
              <div
                className="pointer-events-none absolute inset-0"
                style={{ background: room.light }}
              />
            </motion.div>
          </AnimatePresence>

          <div className="absolute top-5 left-5 flex items-center gap-2 rounded-full border border-white/20 bg-black/20 px-3 py-1.5 text-[10px] font-semibold tracking-[0.16em] text-white uppercase backdrop-blur-md">
            <span
              className="size-1.5 rounded-full"
              style={{ background: room.accent }}
            />
            {room.eyebrow}
          </div>
          {room.id === "hotel" && (
            <div className="absolute top-5 right-5 rounded-full border border-[#8a8a8a]/45 bg-[#0f0f0f]/60 px-3 py-1.5 text-[10px] font-semibold tracking-[0.14em] text-[#8a8a8a] uppercase backdrop-blur-md">
              3D exhibition preview
            </div>
          )}
          <div className="absolute right-5 bottom-[28%] hidden text-right text-[10px] font-medium tracking-[0.12em] text-white/60 uppercase sm:block">
            ArtWall preview
            <br />
            Private to your device
          </div>

          <div className="absolute inset-0 flex items-center justify-center pb-[9%]">
            <AnimatePresence mode="wait">
              {status.state === "ready" ? (
                <motion.figure
                  key={`${status.src}-${room.id}`}
                  initial={
                    reduceMotion
                      ? { opacity: 0 }
                      : { opacity: 0, y: -24, scale: 0.94, rotate: -1.2 }
                  }
                  animate={{ opacity: 1, y: 0, scale: 1, rotate: 0 }}
                  exit={{ opacity: 0, scale: 0.98 }}
                  transition={
                    reduceMotion
                      ? { duration: 0.15 }
                      : {
                          opacity: { duration: 0.3 },
                          scale: { duration: 0.55, ease: [0.22, 1, 0.36, 1] },
                          y: { duration: 0.55, ease: [0.22, 1, 0.36, 1] },
                          rotate: { duration: 0.55, ease: [0.22, 1, 0.36, 1] },
                        }
                  }
                  className={cn(
                    "relative max-h-[61%] max-w-[50%]",
                    room.frame === "thin-dark" && "bg-[#0f0f0f] p-[1.4%]",
                    room.frame === "wide-light" && "bg-[#f7f7f7] p-[3%]"
                  )}
                  style={{
                    boxShadow:
                      "0 24px 45px rgb(0 0 0 / 0.34), 0 3px 7px rgb(0 0 0 / 0.22)",
                  }}
                >
                  <img
                    src={status.src}
                    alt={`Your artwork previewed in a ${room.label.toLowerCase()}`}
                    className="block max-h-full max-w-full object-contain"
                  />
                </motion.figure>
              ) : (
                <motion.div
                  key="empty-frame"
                  initial={{ opacity: 0, scale: 0.98 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.3 }}
                  className="flex h-[51%] w-[41%] flex-col items-center justify-center border border-dashed border-black/25 bg-white/8 text-center backdrop-blur-[1px]"
                >
                  <Sparkles
                    className="size-5"
                    style={{ color: room.accent }}
                    aria-hidden
                  />
                  <span className="mt-3 px-4 text-xs font-medium text-black/50">
                    Your work belongs here
                  </span>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>

        <div className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6">
          <div>
            <p className="text-[11px] font-semibold tracking-[0.16em] text-[#0f0f0f] uppercase">
              {room.label}
            </p>
            <p className="font-heading text-card mt-1">{room.caption}</p>
            <p className="mt-1 text-sm text-[#5a5a5a]">{room.detail}</p>
          </div>
          <p className="inline-flex shrink-0 items-center gap-2 text-xs text-[#5a5a5a]">
            <LockKeyhole className="size-3.5 text-[#0f0f0f]" aria-hidden />{" "}
            Never uploaded
          </p>
        </div>
      </div>

      <aside className="rounded-[1.5rem] border border-[#f0f0f0] bg-[#ffffff] p-4 lg:sticky lg:top-28">
        <p className="px-2 text-[11px] font-semibold tracking-[0.16em] text-[#5a5a5a] uppercase">
          Choose a setting
        </p>
        <div
          role="tablist"
          aria-label="Preview setting"
          className="mt-3 flex gap-2 overflow-x-auto pb-1 lg:flex-col lg:overflow-visible"
        >
          {rooms.map((candidate) => {
            const selected = candidate.id === roomId;
            return (
              <button
                key={candidate.id}
                role="tab"
                type="button"
                aria-selected={selected}
                onClick={() => setRoomId(candidate.id)}
                className={cn(
                  "flex min-w-34 items-center justify-between gap-3 rounded-xl border px-3 py-3 text-left transition lg:w-full",
                  selected
                    ? "border-[#d4d4d4] bg-[#f7f7f7] shadow-[0_4px_12px_rgb(67_133_244/0.08)]"
                    : "border-transparent hover:border-[#f0f0f0] hover:bg-white"
                )}
              >
                <span>
                  <span className="block text-sm font-semibold text-[#0f0f0f]">
                    {candidate.label}
                  </span>
                  <span className="mt-0.5 block text-[11px] text-[#8a8a8a]">
                    {candidate.detail.split(" · ")[0]}
                  </span>
                </span>
                <span
                  className={cn(
                    "size-2 shrink-0 rounded-full",
                    selected && "animate-pulse"
                  )}
                  style={{ background: candidate.accent }}
                />
              </button>
            );
          })}
        </div>
      </aside>

      <div className="lg:col-span-2">
        <div
          onDragOver={(event) => {
            event.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(event) => {
            event.preventDefault();
            setDragging(false);
            accept(event.dataTransfer.files[0]);
          }}
          className={cn(
            "flex flex-col gap-4 rounded-2xl border border-dashed p-5 transition sm:flex-row sm:items-center sm:justify-between",
            dragging
              ? "border-[#0f0f0f] bg-[#f7f7f7]"
              : "border-[#e6e6e6] bg-white hover:border-[#d4d4d4]"
          )}
        >
          <div className="flex items-start gap-3">
            <span className="inline-flex size-10 shrink-0 items-center justify-center rounded-xl bg-[#f7f7f7] text-[#0f0f0f]">
              <ImageUp className="size-5" aria-hidden />
            </span>
            <div>
              <p className="font-semibold">Try your own artwork</p>
              <p className="mt-1 text-sm text-[#5a5a5a]">
                JPG, PNG, WebP or AVIF · up to 12 MB · stays on your device
              </p>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {status.state === "ready" && (
              <button
                type="button"
                onClick={reset}
                className="inline-flex h-10 items-center gap-1.5 rounded-lg px-3 text-sm text-[#5a5a5a] transition hover:bg-[#f7f7f7] hover:text-[#0f0f0f]"
              >
                <X className="size-4" aria-hidden /> Remove
              </button>
            )}
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              className="inline-flex h-10 items-center gap-2 rounded-lg bg-[#0f0f0f] px-4 text-sm font-semibold text-white transition hover:bg-[#2b3245]"
            >
              <ImageUp className="size-4" aria-hidden />{" "}
              {status.state === "ready" ? "Change artwork" : "Choose artwork"}
            </button>
            <input
              ref={inputRef}
              type="file"
              accept={ACCEPTED.join(",")}
              className="sr-only"
              onChange={(event) => accept(event.target.files?.[0])}
            />
          </div>
        </div>
        <p role="status" aria-live="polite" className="mt-3 min-h-5 text-sm">
          {status.state === "error" && (
            <span className="text-destructive">{status.message}</span>
          )}
          {status.state === "ready" && (
            <span className="inline-flex items-center gap-2 text-[#5a5a5a]">
              <Check className="size-4 text-[#0f0f0f]" aria-hidden /> Showing{" "}
              <strong className="font-medium text-[#0f0f0f]">
                {status.name}
              </strong>
              <MoveRight className="size-3.5" aria-hidden /> Try another room.
            </span>
          )}
        </p>
      </div>
    </div>
  );
}

/** A furniture-free gallery room with walls, ceiling light, and exhibition floor. */
function VirtualExhibitionArchitecture({ floor }: { floor: string }) {
  return (
    <>
      <div className="absolute inset-x-0 top-0 h-[16%] bg-[linear-gradient(180deg,rgba(255,255,255,0.9),transparent)]" />
      <div
        className="absolute inset-y-0 left-0 w-[18%] bg-[linear-gradient(90deg,rgba(74,78,84,0.12),transparent)]"
        style={{ clipPath: "polygon(0 0, 100% 12%, 100% 100%, 0 100%)" }}
      />
      <div
        className="absolute inset-y-0 right-0 w-[18%] bg-[linear-gradient(270deg,rgba(74,78,84,0.14),transparent)]"
        style={{ clipPath: "polygon(0 12%, 100% 0, 100% 100%, 0 100%)" }}
      />
      <div
        className="absolute inset-x-0 bottom-0 h-[28%]"
        style={{
          background: `${floor}, repeating-linear-gradient(90deg, rgb(255 255 255 / 0.12) 0 1px, transparent 1px 14%)`,
          clipPath: "polygon(8% 0, 92% 0, 100% 100%, 0 100%)",
        }}
      />
      <div className="pointer-events-none absolute inset-x-[8%] bottom-[27.6%] h-px bg-[#5a5a5a]/35" />
    </>
  );
}
