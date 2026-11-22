"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { applyCurator } from "@/features/curators/actions";
import { Field, inputClass, SubmitButton } from "@/features/physical-wall/components/form-bits";

/**
 * The curator self-serve application form. Rendered only when the signed-in
 * user has no curators row yet — see src/app/curator/apply/page.tsx, which
 * checks `getMyCuratorApplication` first and shows a status message instead
 * of this form once one exists, so a user can never submit a second
 * application from here.
 */
export function CuratorApplyForm() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <form
      className="flex flex-col gap-4"
      action={(formData) => {
        setError(null);
        const displayName = String(formData.get("displayName") ?? "");
        const bio = String(formData.get("bio") ?? "");
        start(async () => {
          const result = await applyCurator({ displayName, bio: bio || undefined });
          if (!result.ok) {
            setError(result.error);
            return;
          }
          router.refresh();
        });
      }}
    >
      <Field label="Display name" htmlFor="curator-display-name" hint="Shown on your curator collections and picks.">
        <input id="curator-display-name" name="displayName" required minLength={2} maxLength={120} className={inputClass} />
      </Field>
      <Field label="Bio (optional)" htmlFor="curator-bio" hint="A short note on your curatorial focus — tell the reviewer why you'd be a good curator.">
        <textarea id="curator-bio" name="bio" maxLength={2000} rows={4} className={`${inputClass} h-auto py-2`} />
      </Field>
      <div>
        <SubmitButton disabled={pending}>Apply to become a curator</SubmitButton>
      </div>
      {error && (
        <p role="alert" className="text-destructive text-small">
          {error}
        </p>
      )}
    </form>
  );
}
