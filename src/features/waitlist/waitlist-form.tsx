"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowRight, Loader2 } from "lucide-react";

import { ImageDrop } from "@/features/upload/image-drop";
import type { UploadedAsset } from "@/features/upload/compress";
import { joinWaitlist } from "@/features/waitlist/actions";
import { FounderCertificate } from "@/features/waitlist/founder-certificate";
import {
  practices,
  type WaitlistInput,
  type WaitlistState,
} from "@/features/waitlist/schema";
import { cn } from "@/lib/utils";

const initialState: WaitlistState = { status: "idle" };

function fieldError(state: WaitlistState, field: keyof WaitlistInput) {
  return state.status === "error" ? state.fieldErrors?.[field] : undefined;
}

function SubmitButton() {
  // Reads the parent form's pending state - no extra state to keep in sync.
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      className="bg-foreground inline-flex h-12 items-center justify-center gap-2 px-6 text-sm font-medium text-white transition-colors hover:bg-[#2b3245] disabled:opacity-60"
    >
      {pending ? (
        <>
          <Loader2 className="size-4 animate-spin" aria-hidden />
          Taking your place…
        </>
      ) : (
        <>
          Take my place
          <ArrowRight className="size-4" aria-hidden />
        </>
      )}
    </button>
  );
}

/**
 * Joining, as a ceremony rather than a form submission.
 *
 * The success state does not say "thanks, we'll be in touch" - it hands over a
 * number. Becoming Founding Artist #1 is a thing you *are*, where a confirmed
 * email address is a thing you gave away. That difference is the entire reason
 * this section exists.
 *
 * Architecture: `useActionState` posts to a Server Action, so the form works
 * before hydration - a real progressive-enhancement win on the mid-range
 * Android phones that make up most of this audience.
 *
 * Accessibility: every input has a real label; errors are tied to their field
 * with `aria-describedby` and `aria-invalid`; the result region is a polite
 * live region so success and failure are announced, not just recoloured.
 */
interface WaitlistFormProps {
  /** Prefilled from the signed-in account, so nobody retypes what they just gave us. */
  defaultName?: string;
  /** The verified address the place is held against. Shown, never edited. */
  accountEmail?: string;
}

export function WaitlistForm({ defaultName, accountEmail }: WaitlistFormProps) {
  const [state, formAction] = useActionState(joinWaitlist, initialState);
  const [artwork, setArtwork] = useState<UploadedAsset | null>(null);
  const [selfie, setSelfie] = useState<UploadedAsset | null>(null);

  if (state.status === "success") {
    return (
      <FounderCertificate name={state.name} number={state.founderNumber} />
    );
  }

  return (
    <form action={formAction} className="flex flex-col gap-5">
      {/* Honeypot: off-screen, unfocusable, never announced. */}
      <div aria-hidden className="sr-only">
        <label htmlFor="website">Website</label>
        <input
          id="website"
          name="website"
          type="text"
          tabIndex={-1}
          autoComplete="off"
        />
      </div>

      <fieldset className="flex flex-col gap-3">
        <legend className="text-muted-foreground mb-1 text-xs tracking-[0.14em] uppercase">
          I am here as
        </legend>
        <div className="flex gap-3">
          {(
            [
              { value: "artist", label: "An artist" },
              { value: "collector", label: "A collector" },
            ] as const
          ).map((option, index) => (
            <label
              key={option.value}
              className="border-border has-checked:border-foreground has-checked:bg-foreground flex h-11 flex-1 cursor-pointer items-center justify-center border text-sm transition-colors has-checked:text-white"
            >
              <input
                type="radio"
                name="role"
                value={option.value}
                defaultChecked={index === 0}
                className="sr-only"
              />
              {option.label}
            </label>
          ))}
        </div>
      </fieldset>

      <Field
        id="name"
        name="name"
        label="Your name"
        autoComplete="name"
        required
        defaultValue={defaultName}
        error={fieldError(state, "name")}
      />

      {/* The address is taken from the session on the server, so it is shown
          rather than asked for, one account, one place. */}
      <div className="flex flex-col gap-2">
        <span className="text-muted-foreground text-eyebrow">Email</span>
        <p className="border-border flex h-11 items-center border px-3 text-sm">
          {accountEmail}
        </p>
      </div>

      <div className="grid gap-5 sm:grid-cols-2">
        <div className="flex flex-col gap-2">
          <label
            htmlFor="practice"
            className="text-muted-foreground text-eyebrow"
          >
            What you make
          </label>
          <select
            id="practice"
            name="practice"
            defaultValue=""
            className="border-input focus:border-foreground h-11 border bg-white px-3 transition-colors outline-none"
          >
            <option value="">Prefer not to say</option>
            {practices.map((practice) => (
              <option key={practice} value={practice}>
                {practice}
              </option>
            ))}
          </select>
        </div>

        <Field
          id="city"
          name="city"
          label="City"
          autoComplete="address-level2"
          error={fieldError(state, "city")}
        />
      </div>

      {/* Uploads. Optional, an artist can hold a place without one, and add
          their work later. The artwork is what becomes their tile. */}
      <fieldset className="border-border flex flex-col gap-5 border p-4">
        <legend className="text-muted-foreground px-1 text-xs tracking-[0.14em] uppercase">
          Your place on the wall
        </legend>

        <div className="grid gap-5 sm:grid-cols-2">
          <ImageDrop
            kind="artwork"
            label="Your artwork"
            hint="This becomes your tile on the wall."
            onChange={setArtwork}
          />
          <ImageDrop
            kind="selfie"
            label="You (optional)"
            hint="Shown with your work. Only add it if you're happy for it to be public."
            onChange={setSelfie}
          />
        </div>

        <Field
          id="artworkTitle"
          name="artworkTitle"
          label="Title of the work"
        />

        <div className="flex flex-col gap-2">
          <label htmlFor="quote" className="text-muted-foreground text-eyebrow">
            One line about it
          </label>
          <textarea
            id="quote"
            name="quote"
            rows={2}
            maxLength={280}
            placeholder="Why you made it, or what it's of."
            className="border-input focus:border-foreground placeholder:text-muted-foreground border bg-white p-3 leading-7 transition-colors outline-none"
          />
        </div>

        {/* Upload results travel with the form post and are re-validated
            server-side against Cloudinary's host. */}
        <input type="hidden" name="artworkUrl" value={artwork?.url ?? ""} />
        <input
          type="hidden"
          name="artworkPublicId"
          value={artwork?.publicId ?? ""}
        />
        <input type="hidden" name="artworkWidth" value={artwork?.width ?? ""} />
        <input
          type="hidden"
          name="artworkHeight"
          value={artwork?.height ?? ""}
        />
        <input type="hidden" name="selfieUrl" value={selfie?.url ?? ""} />
        <input
          type="hidden"
          name="selfiePublicId"
          value={selfie?.publicId ?? ""}
        />
      </fieldset>

      {/* Founding Membership is opt-in. Everyone who joins gets a numbered
          place; claiming founding status is a separate, deliberate yes, so it
          is unticked by default and never pre-selected for anyone. */}
      <label className="border-border hover:border-foreground flex cursor-pointer items-start gap-4 border p-4 transition-colors">
        <input
          type="checkbox"
          name="foundingMember"
          className="accent-foreground mt-1 size-4 shrink-0"
        />
        <span>
          <span className="block text-sm font-medium">
            Be a Founding Member (optional)
          </span>
          <span className="text-muted-foreground mt-1 block text-sm leading-6">
            A say in what we build, first access at launch, and a permanent
            badge on your profile. You keep your numbered place either way.
          </span>
        </span>
      </label>

      <SubmitButton />

      <div aria-live="polite" role="status" className="min-h-5">
        <AnimatePresence>
          {state.status === "error" && (
            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="text-destructive text-sm"
            >
              {state.message}
            </motion.p>
          )}
        </AnimatePresence>
      </div>

      <p className="text-muted-foreground text-xs leading-6">
        We use your details to hold your place and tell you when we open.
        Nothing else, and never sold.
      </p>
    </form>
  );
}

interface FieldProps {
  id: string;
  name: string;
  label: string;
  type?: string;
  autoComplete?: string;
  required?: boolean;
  error?: string;
  defaultValue?: string;
}

function Field({
  id,
  name,
  label,
  type = "text",
  autoComplete,
  required,
  error,
  defaultValue,
}: FieldProps) {
  const errorId = `${id}-error`;

  return (
    <div className="flex flex-col gap-2">
      <label htmlFor={id} className="text-muted-foreground text-eyebrow">
        {label}
        {required && <span className="text-muted-foreground ml-1">*</span>}
      </label>
      <input
        id={id}
        name={name}
        type={type}
        autoComplete={autoComplete}
        required={required}
        defaultValue={defaultValue}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errorId : undefined}
        className={cn(
          "border-input focus:border-foreground h-11 border bg-white px-3 transition-colors outline-none",
          error && "border-destructive"
        )}
      />
      {error && (
        <p id={errorId} className="text-destructive text-sm">
          {error}
        </p>
      )}
    </div>
  );
}
