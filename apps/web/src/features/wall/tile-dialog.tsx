"use client";

/* eslint-disable @next/next/no-img-element -- see the note in wall-canvas.tsx:
   these are pre-transformed Cloudinary assets and must not be re-optimised. */

import { Dialog } from "@base-ui/react/dialog";
import { MapPin, X } from "lucide-react";

import type { WallTile } from "@/features/wall/types";
import { fullSrc, portraitSrc } from "@/lib/cloudinary-url";

interface TileDialogProps {
  tile: WallTile | null;
  onClose: () => void;
}

/**
 * A tile, opened.
 *
 * This is the payoff for the selfie: the work on the left, the person who made
 * it on the right. A wall of images is a catalogue; a wall of images with the
 * maker beside each one is the argument the whole company is making - that
 * there is a real person at the end of every transaction, and you can see them.
 *
 * Built on Base UI's Dialog rather than a hand-rolled modal so focus trapping,
 * scroll locking, Escape, and `aria-modal` are handled by something that has
 * been tested against screen readers, instead of by us at the end of a long
 * file.
 */
export function TileDialog({ tile, onClose }: TileDialogProps) {
  return (
    <Dialog.Root
      open={tile !== null}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <Dialog.Portal>
        <Dialog.Backdrop className="bg-wall-black/85 fixed inset-0 z-300 backdrop-blur-sm" />

        <Dialog.Popup className="border-border bg-wall-charcoal fixed top-1/2 left-1/2 z-400 max-h-[90svh] w-[min(64rem,92vw)] -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-xl border shadow-[0_24px_64px_rgb(0_0_0/0.6)]">
          {tile && (
            <div className="grid gap-0 md:grid-cols-[1.4fr_1fr]">
              {/* The work */}
              <div className="bg-wall-black flex items-center justify-center p-4 sm:p-8">
                <img
                  src={fullSrc(tile.artworkUrl)}
                  alt={
                    tile.artworkTitle
                      ? `${tile.artworkTitle} by ${tile.name}`
                      : `Artwork by ${tile.name}`
                  }
                  className="max-h-[70svh] w-auto max-w-full rounded-sm object-contain"
                />
              </div>

              {/* The placard */}
              <div className="flex flex-col gap-6 p-6 sm:p-8">
                <div className="flex items-start justify-between gap-4">
                  <span className="text-label text-ember tracking-[0.18em] uppercase tabular-nums">
                    Founding artist #{tile.founderNumber}
                  </span>
                  <Dialog.Close
                    aria-label="Close"
                    className="text-muted-foreground hover:text-foreground -mt-1 -mr-1 inline-flex size-9 shrink-0 items-center justify-center rounded-md transition-colors"
                  >
                    <X className="size-4" aria-hidden />
                  </Dialog.Close>
                </div>

                <div className="flex flex-col gap-2">
                  <Dialog.Title className="font-heading text-h3 tracking-tight text-balance">
                    {tile.artworkTitle || "Untitled"}
                  </Dialog.Title>

                  <div className="flex items-center gap-3">
                    {tile.selfieUrl && (
                      <img
                        src={portraitSrc(tile.selfieUrl, 96)}
                        alt={`${tile.name}, with their work`}
                        className="border-ember/30 size-12 shrink-0 rounded-full border object-cover"
                        loading="lazy"
                        decoding="async"
                      />
                    )}
                    <div className="flex flex-col">
                      <span className="text-body font-medium">{tile.name}</span>
                      {(tile.city || tile.practice) && (
                        <span className="text-muted-foreground text-small flex items-center gap-1">
                          {tile.city && (
                            <>
                              <MapPin className="size-3" aria-hidden />
                              {tile.city}
                            </>
                          )}
                          {tile.city && tile.practice && <span>·</span>}
                          {tile.practice}
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {tile.quote && (
                  <Dialog.Description
                    render={
                      <blockquote className="border-ember/40 text-body text-muted-foreground border-l-2 pl-4 italic" />
                    }
                  >
                    {tile.quote}
                  </Dialog.Description>
                )}

                {/* The larger portrait, when there is room for it. */}
                {tile.selfieUrl && (
                  <figure className="mt-auto flex flex-col gap-2">
                    <img
                      src={portraitSrc(tile.selfieUrl, 480)}
                      alt={`${tile.name} with their work`}
                      className="border-border aspect-square w-full rounded-lg border object-cover"
                      loading="lazy"
                      decoding="async"
                    />
                    <figcaption className="text-caption text-ink-muted">
                      The artist, with the work. Shared by {tile.name} at
                      upload.
                    </figcaption>
                  </figure>
                )}
              </div>
            </div>
          )}
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
