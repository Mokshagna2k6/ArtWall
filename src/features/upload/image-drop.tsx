"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ImageUp, Loader2, X } from "lucide-react";

import { getUploadSignature } from "@/features/upload/actions";
import {
  compressImage,
  uploadToCloudinary,
  type UploadedAsset,
} from "@/features/upload/compress";
import { cn } from "@/lib/utils";

const ACCEPTED = ["image/jpeg", "image/png", "image/webp", "image/avif"];
const MAX_BYTES = 25 * 1024 * 1024;

type State =
  | { phase: "idle" }
  | { phase: "working"; label: string }
  | { phase: "done"; asset: UploadedAsset; preview: string; saved: number }
  | { phase: "error"; message: string };

interface ImageDropProps {
  kind: "artwork" | "selfie";
  label: string;
  hint: string;
  onChange: (asset: UploadedAsset | null) => void;
  required?: boolean;
}

/**
 * Pick an image, compress it locally, upload it straight to Cloudinary.
 *
 * The order matters: compression happens *before* the network, so what crosses
 * a mobile connection is a few hundred KB rather than the 8 MB the camera
 * produced. The saving is shown to the artist, which quietly reassures them the
 * upload is not going to eat their data.
 *
 * Validation is client-side for speed and server-side by signature scope for
 * safety - the browser cannot upload anywhere except the folder the server
 * signed for.
 *
 * Accessibility: the control is a real labelled button (not a bare styled
 * input), progress and errors are announced through a live region, and the
 * whole drop-zone works by click alone - drag-and-drop is an enhancement, never
 * the only route.
 */
export function ImageDrop({
  kind,
  label,
  hint,
  onChange,
  required,
}: ImageDropProps) {
  const [state, setState] = useState<State>({ phase: "idle" });
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const previewUrl = useRef<string | null>(null);

  useEffect(() => {
    return () => {
      if (previewUrl.current) URL.revokeObjectURL(previewUrl.current);
    };
  }, []);

  const handle = useCallback(
    async (file: File | undefined) => {
      if (!file) return;

      if (!ACCEPTED.includes(file.type)) {
        setState({
          phase: "error",
          message: "Use a JPG, PNG, WebP or AVIF image.",
        });
        return;
      }
      if (file.size > MAX_BYTES) {
        setState({ phase: "error", message: "That image is over 25 MB." });
        return;
      }

      try {
        setState({ phase: "working", label: "Preparing your image…" });
        const compressed = await compressImage(file);

        setState({ phase: "working", label: "Uploading…" });
        const signature = await getUploadSignature(kind);
        if (!signature.ok) {
          setState({ phase: "error", message: signature.message });
          onChange(null);
          return;
        }

        const asset = await uploadToCloudinary(compressed, signature);

        if (previewUrl.current) URL.revokeObjectURL(previewUrl.current);
        previewUrl.current = URL.createObjectURL(compressed.blob);

        const saved = Math.max(
          0,
          Math.round(
            (1 - compressed.blob.size / compressed.originalBytes) * 100
          )
        );

        setState({
          phase: "done",
          asset,
          preview: previewUrl.current,
          saved,
        });
        onChange(asset);
      } catch (error) {
        console.error("[upload]", error);
        setState({
          phase: "error",
          message:
            error instanceof Error ? error.message : "That upload didn't work.",
        });
        onChange(null);
      }
    },
    [kind, onChange]
  );

  function reset() {
    if (previewUrl.current) {
      URL.revokeObjectURL(previewUrl.current);
      previewUrl.current = null;
    }
    setState({ phase: "idle" });
    onChange(null);
    if (inputRef.current) inputRef.current.value = "";
  }

  return (
    <div className="flex flex-col gap-2">
      <span className="text-label text-muted-foreground tracking-wider uppercase">
        {label}
        {required && <span className="text-ember ml-1">*</span>}
      </span>

      <div
        onDragOver={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(event) => {
          event.preventDefault();
          setDragging(false);
          void handle(event.dataTransfer.files[0]);
        }}
        className={cn(
          "border-border relative flex min-h-36 flex-col items-center justify-center gap-3 rounded-lg border border-dashed p-5 transition-colors",
          dragging && "border-ember bg-ember/5"
        )}
      >
        {state.phase === "done" ? (
          <>
            {/* Local blob preview, no network round-trip to show it back. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={state.preview}
              alt=""
              className="max-h-40 rounded-md object-contain"
            />
            <button
              type="button"
              onClick={reset}
              className="text-muted-foreground hover:text-foreground text-small inline-flex items-center gap-1.5 transition-colors"
            >
              <X className="size-3.5" aria-hidden />
              Replace
            </button>
          </>
        ) : state.phase === "working" ? (
          <span className="text-muted-foreground text-small inline-flex items-center gap-2">
            <Loader2 className="size-4 animate-spin" aria-hidden />
            {state.label}
          </span>
        ) : (
          <>
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              className="border-border hover:border-ember/50 hover:bg-ember/5 text-small inline-flex h-10 items-center gap-2 rounded-md border px-4 transition-colors"
            >
              <ImageUp className="size-4" aria-hidden />
              Choose image
            </button>
            <span className="text-muted-foreground text-caption text-center">
              {hint}
            </span>
          </>
        )}

        <input
          ref={inputRef}
          type="file"
          accept={ACCEPTED.join(",")}
          className="sr-only"
          onChange={(event) => void handle(event.target.files?.[0])}
        />
      </div>

      <p role="status" aria-live="polite" className="text-caption min-h-4">
        {state.phase === "error" && (
          <span className="text-destructive">{state.message}</span>
        )}
        {state.phase === "done" && state.saved > 0 && (
          <span className="text-muted-foreground">
            Compressed {state.saved}% smaller before upload.
          </span>
        )}
      </p>
    </div>
  );
}
