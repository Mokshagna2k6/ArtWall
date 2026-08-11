"use client";

/* eslint-disable @next/next/no-img-element -- local object URLs and
   pre-transformed Cloudinary assets; next/image applies to neither. */

import { useActionState, useEffect, useId, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Camera, Check, ImagePlus, Loader2 } from "lucide-react";

import { publishToWall } from "@/features/wall/actions";
import type { PublishState } from "@/features/wall/schema";
import {
  useUpload,
  UploadError,
  type UploadedAsset,
} from "@/features/wall/use-upload";
import type { WallTile } from "@/features/wall/types";
import { practices } from "@/features/waitlist/schema";
import { transition } from "@/lib/motion";
import { cn } from "@/lib/utils";

interface UploadFormProps {
  /** Called the instant a work is published, so the wall can hang it now. */
  onPublished: (tile: WallTile) => void;
}

interface Slot {
  asset: UploadedAsset | null;
  preview: string | null;
  error: string | null;
}

const emptySlot: Slot = { asset: null, preview: null, error: null };

/**
 * Join the wall.
 *
 * The order of the form is the argument: the artwork first, the artist second,
 * the paperwork last. Asking for an email before an artist has seen their own
 * work on the wall gets the incentives backwards.
 *
 * The selfie is optional but strongly encouraged, and the label says plainly
 * that it becomes public. Consent for a photograph of someone's face has to be
 * given knowingly or it is not consent — burying it in terms nobody reads
 * would be the cheap way to do this.
 */
export function UploadForm({ onPublished }: UploadFormProps) {
  const [state, formAction, pending] = useActionState<PublishState, FormData>(
    publishToWall,
    { status: "idle" }
  );

  const [artwork, setArtwork] = useState<Slot>(emptySlot);
  const [selfie, setSelfie] = useState<Slot>(emptySlot);
  const [name, setName] = useState("");
  const [title, setTitle] = useState("");
  const [city, setCity] = useState("");

  const artworkUpload = useUpload();
  const selfieUpload = useUpload();

  const formRef = useRef<HTMLFormElement>(null);
  const nameId = useId();
  const emailId = useId();
  const titleId = useId();
  const cityId = useId();
  const practiceId = useId();
  const quoteId = useId();

  // Revoke object URLs so a long session picking several images does not leak
  // a blob per attempt.
  useEffect(() => {
    return () => {
      if (artwork.preview) URL.revokeObjectURL(artwork.preview);
      if (selfie.preview) URL.revokeObjectURL(selfie.preview);
    };
  }, [artwork.preview, selfie.preview]);

  /**
   * Hand the finished tile up the moment the server confirms, so the wall can
   * animate it into place before this form has even finished collapsing.
   */
  useEffect(() => {
    if (state.status !== "success" || !artwork.asset) return;
    onPublished({
      founderNumber: state.founderNumber,
      name: state.name,
      city: city || null,
      practice: null,
      artworkUrl: artwork.asset.url,
      artworkWidth: artwork.asset.width,
      artworkHeight: artwork.asset.height,
      selfieUrl: selfie.asset?.url ?? null,
      artworkTitle: title || null,
      quote: null,
    });
    // Only ever fire on the transition into success.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  async function handleFile(
    file: File | undefined,
    kind: "artwork" | "selfie"
  ) {
    if (!file) return;

    const setSlot = kind === "artwork" ? setArtwork : setSelfie;
    const uploader = kind === "artwork" ? artworkUpload : selfieUpload;
    const preview = URL.createObjectURL(file);

    setSlot({ asset: null, preview, error: null });

    try {
      const asset = await uploader.upload(file);
      setSlot({ asset, preview, error: null });
    } catch (error) {
      setSlot({
        asset: null,
        preview: null,
        error:
          error instanceof UploadError
            ? error.message
            : "Something went wrong with that upload.",
      });
      URL.revokeObjectURL(preview);
    }
  }

  const fieldClass =
    "h-10 rounded-lg border border-[#e7e7e7] bg-[#fcfbf8] px-3 text-sm text-[#17181a] placeholder:text-[#9a9da3] transition-colors focus-visible:border-[#4385f4] focus-visible:bg-white";

  if (state.status === "success") {
    return (
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={transition.moderate}
        className="border-ember/30 bg-ember/5 flex flex-col items-start gap-3 rounded-xl border p-8"
      >
        <span className="bg-ember text-wall-black inline-flex size-10 items-center justify-center rounded-full">
          <Check className="size-5" aria-hidden />
        </span>
        <h3 className="font-heading text-h3 tracking-tight">
          It&rsquo;s on the wall, {state.name}.
        </h3>
        <p className="text-muted-foreground text-body">
          You are founding artist{" "}
          <span className="text-ember font-medium tabular-nums">
            #{state.founderNumber}
          </span>
          .{" "}
          {state.hidden
            ? "Your work is queued for a quick human check before it appears publicly — we'll email you when it's live."
            : "Scroll up: your work is hanging there now."}
        </p>
      </motion.div>
    );
  }

  return (
    <form
      ref={formRef}
      action={formAction}
      className="flex flex-col gap-5 rounded-2xl border border-[#e8e8e7] bg-white p-5 shadow-[0_16px_48px_rgb(16_17_20/0.06)] sm:p-6"
    >
      {/* Hidden fields carrying what the browser already uploaded. */}
      <input type="hidden" name="artworkUrl" value={artwork.asset?.url ?? ""} />
      <input
        type="hidden"
        name="artworkPublicId"
        value={artwork.asset?.publicId ?? ""}
      />
      <input
        type="hidden"
        name="artworkWidth"
        value={artwork.asset?.width ?? ""}
      />
      <input
        type="hidden"
        name="artworkHeight"
        value={artwork.asset?.height ?? ""}
      />
      <input type="hidden" name="selfieUrl" value={selfie.asset?.url ?? ""} />
      <input
        type="hidden"
        name="selfiePublicId"
        value={selfie.asset?.publicId ?? ""}
      />
      <input
        type="hidden"
        name="artworkModeration"
        value={artwork.asset?.moderation ?? ""}
      />
      {/* Honeypot — off-screen, not display:none, so bots still fill it. */}
      <input
        type="text"
        name="website"
        tabIndex={-1}
        autoComplete="off"
        aria-hidden
        className="pointer-events-none absolute -left-[9999px] size-0 opacity-0"
      />

      <div className="grid gap-4 sm:grid-cols-2">
        <DropSlot
          label="Your artwork"
          hint="The piece itself. Photograph it straight on, in daylight if you can."
          icon={<ImagePlus className="size-6" aria-hidden />}
          slot={artwork}
          progress={artworkUpload.progress}
          busy={artworkUpload.busy}
          onFile={(file) => handleFile(file, "artwork")}
          required
        />
        <DropSlot
          label="You, with your work"
          hint="Optional — and public. This is what turns a picture into a person."
          icon={<Camera className="size-6" aria-hidden />}
          slot={selfie}
          progress={selfieUpload.progress}
          busy={selfieUpload.busy}
          onFile={(file) => handleFile(file, "selfie")}
          capture
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field id={nameId} label="Your name">
          <input
            id={nameId}
            name="name"
            required
            maxLength={80}
            value={name}
            onChange={(event) => setName(event.target.value)}
            autoComplete="name"
            className={fieldClass}
          />
        </Field>

        <Field id={emailId} label="Email" hint="So we can reach you at launch.">
          <input
            id={emailId}
            name="email"
            type="email"
            required
            autoComplete="email"
            className={fieldClass}
          />
        </Field>

        <Field id={titleId} label="Title of the work" optional>
          <input
            id={titleId}
            name="artworkTitle"
            maxLength={120}
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="Untitled"
            className={fieldClass}
          />
        </Field>

        <Field id={cityId} label="City" optional>
          <input
            id={cityId}
            name="city"
            maxLength={80}
            value={city}
            onChange={(event) => setCity(event.target.value)}
            placeholder="Jaipur"
            autoComplete="address-level2"
            className={fieldClass}
          />
        </Field>

        <Field id={practiceId} label="Practice" optional>
          <select id={practiceId} name="practice" className={fieldClass}>
            <option value="">Choose one</option>
            {practices.map((practice) => (
              <option key={practice} value={practice}>
                {practice}
              </option>
            ))}
          </select>
        </Field>

        <Field id={quoteId} label="One line about it" optional>
          <input
            id={quoteId}
            name="quote"
            maxLength={280}
            placeholder="What were you making it for?"
            className={fieldClass}
          />
        </Field>
      </div>

      <AnimatePresence>
        {state.status === "error" && (
          <motion.p
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            role="alert"
            className="text-destructive text-small"
          >
            {state.message}
          </motion.p>
        )}
      </AnimatePresence>

      <div className="flex flex-col gap-3">
        <button
          type="submit"
          disabled={pending || !artwork.asset}
          className="inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-[#17181a] text-sm font-semibold text-white transition hover:bg-[#33353a] disabled:cursor-not-allowed disabled:bg-[#ebe8e3] disabled:text-[#a5a19a]"
        >
          {pending ? (
            <>
              <Loader2 className="size-4 animate-spin" aria-hidden />
              Hanging it&hellip;
            </>
          ) : (
            "Hang it on the wall"
          )}
        </button>
        <p className="text-caption text-ink-muted">
          Your work and, if you add one, your photo appear publicly on the wall
          straight away. You keep every right to the work — we only display it.
          Write to us any time and we will take it down.
        </p>
      </div>
    </form>
  );
}

function Field({
  id,
  label,
  hint,
  optional,
  children,
}: {
  id: string;
  label: string;
  hint?: string;
  optional?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label
        htmlFor={id}
        className="text-label text-muted-foreground tracking-wider uppercase"
      >
        {label}
        {optional && <span className="text-ink-muted/60"> · optional</span>}
      </label>
      {children}
      {hint && <span className="text-caption text-ink-muted">{hint}</span>}
    </div>
  );
}

function DropSlot({
  label,
  hint,
  icon,
  slot,
  progress,
  busy,
  onFile,
  required,
  capture,
}: {
  label: string;
  hint: string;
  icon: React.ReactNode;
  slot: Slot;
  progress: number;
  busy: boolean;
  onFile: (file: File | undefined) => void;
  required?: boolean;
  capture?: boolean;
}) {
  const inputId = useId();

  return (
    <div className="flex flex-col gap-2">
      <label
        htmlFor={inputId}
        className={cn(
          "group relative flex h-28 cursor-pointer flex-col items-center justify-center gap-1.5 overflow-hidden rounded-xl border border-dashed border-[#dfe1e5] bg-[#fcfbf8] transition-all duration-300 hover:-translate-y-0.5 hover:border-[#4385f4] hover:bg-[#f6f8ff] hover:shadow-[0_12px_24px_rgb(67_133_244/0.10)] sm:h-32",
          slot.asset && "border-solid border-[#4385f4]"
        )}
      >
        {slot.preview ? (
          <>
            <img
              src={slot.preview}
              alt=""
              className="absolute inset-0 size-full object-cover"
            />
            {busy && (
              <div className="bg-wall-black/70 absolute inset-0 flex flex-col items-center justify-center gap-2">
                <span className="text-caption tabular-nums">{progress}%</span>
                <span className="bg-wall-elevated h-1 w-2/3 overflow-hidden rounded-full">
                  <span
                    className="bg-ember block h-full transition-[width] duration-200"
                    style={{ width: `${progress}%` }}
                  />
                </span>
              </div>
            )}
            {slot.asset && !busy && (
              <span className="absolute top-3 right-3 inline-flex size-6 items-center justify-center rounded-full bg-[#4385f4] text-white shadow-sm">
                <Check className="size-3.5" aria-hidden />
              </span>
            )}
          </>
        ) : (
          <>
            <span className="text-[#7d828b] transition-colors group-hover:text-[#4385f4]">
              {icon}
            </span>
            <span className="text-small font-semibold text-[#17181a]">
              {label}
              {required && <span className="text-[#db861b]"> *</span>}
            </span>
          </>
        )}
      </label>

      <input
        id={inputId}
        type="file"
        accept="image/*"
        {...(capture ? { capture: "user" as const } : {})}
        onChange={(event) => onFile(event.target.files?.[0])}
        className="sr-only"
      />

      <span
        className={cn(
          "text-caption",
          slot.error ? "text-destructive" : "text-ink-muted"
        )}
      >
        {slot.error ?? hint}
      </span>
    </div>
  );
}
