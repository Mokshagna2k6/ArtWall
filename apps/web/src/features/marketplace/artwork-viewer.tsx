"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { useState } from "react";

import { CloudinaryImage as Image } from "@/components/media/cloudinary-image";
import { cn } from "@/lib/utils";

/**
 * The artwork page's image viewer (§8.7): large frame, thumbnail strip,
 * prev/next.
 *
 * shortcut: `artworks` stores one image (imageUrl/imagePublicId) and PR 6 adds
 * no tables, so today this almost always receives a single image and renders
 * just the frame — the strip and arrows appear from the second image onward.
 * Upgrade when a per-artwork image table (or an image array column) lands:
 * pass the extra urls in and nothing here changes.
 */
export function ArtworkViewer({
  images,
  title,
}: {
  images: string[];
  title: string;
}) {
  const [index, setIndex] = useState(0);
  const count = images.length;
  const current = images[Math.min(index, Math.max(count - 1, 0))];

  const go = (delta: number) => setIndex((i) => (i + delta + count) % count);

  return (
    <div className="flex flex-col gap-3">
      <div className="bg-band relative aspect-square overflow-hidden rounded-lg">
        {current ? (
          <Image
            src={current}
            alt={title}
            fill
            className="object-contain"
            sizes="(min-width: 1024px) 50vw, 100vw"
            priority
          />
        ) : (
          <div className="text-ink-muted flex h-full items-center justify-center">No image</div>
        )}

        {count > 1 && (
          <>
            <button
              type="button"
              onClick={() => go(-1)}
              aria-label="Previous image"
              className="absolute top-1/2 left-3 -translate-y-1/2 rounded-full bg-white/90 p-2 shadow-sm hover:bg-white"
            >
              <ChevronLeft aria-hidden className="size-5" />
            </button>
            <button
              type="button"
              onClick={() => go(1)}
              aria-label="Next image"
              className="absolute top-1/2 right-3 -translate-y-1/2 rounded-full bg-white/90 p-2 shadow-sm hover:bg-white"
            >
              <ChevronRight aria-hidden className="size-5" />
            </button>
            <p className="text-ink-muted absolute right-3 bottom-3 rounded bg-white/90 px-2 py-1 text-xs">
              {index + 1} / {count}
            </p>
          </>
        )}
      </div>

      {count > 1 && (
        <ul className="flex flex-wrap gap-2" aria-label="Image thumbnails">
          {images.map((src, i) => (
            <li key={src}>
              <button
                type="button"
                onClick={() => setIndex(i)}
                aria-label={`Show image ${i + 1}`}
                aria-current={i === index ? "true" : undefined}
                className={cn(
                  "bg-band relative size-16 overflow-hidden rounded border",
                  i === index ? "border-ink" : "border-hairline opacity-70 hover:opacity-100"
                )}
              >
                <Image src={src} alt="" fill className="object-cover" sizes="64px" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
