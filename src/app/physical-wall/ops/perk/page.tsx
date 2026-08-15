import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { requireRolePage } from "@/features/physical-wall/authorize";
import {
  Field,
  inputClass,
} from "@/features/physical-wall/components/form-bits";

export const metadata: Metadata = {
  title: "Counter",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

/**
 * The counter's manual entry (RP01 offline fallback).
 *
 * Normally the QR takes staff straight to /ops/perk/[token]. This page exists
 * for the case the spec calls out: a camera that will not focus, a cracked
 * screen, a code printed too small. Typing the string under the QR gets to the
 * same place, and the same eligibility checks run there.
 */
export default async function PerkEntryPage() {
  await requireRolePage("staff", "/physical-wall/ops/perk");

  async function go(formData: FormData) {
    "use server";
    const token = String(formData.get("token") ?? "").trim();
    if (!token) return;
    redirect(`/physical-wall/ops/perk/${encodeURIComponent(token)}`);
  }

  return (
    <main className="mx-auto max-w-md px-5 pt-24 pb-24 sm:px-8 sm:pt-32">
      <p className="text-signal text-eyebrow">Ric Platter counter</p>
      <h1 className="font-heading text-display mt-3">Enter a code</h1>
      <p className="text-ink-muted mt-4 text-sm leading-6">
        Scanning the customer&rsquo;s QR is quicker. Use this when the camera
        won&rsquo;t cooperate — the code is printed under the square.
      </p>

      <form action={go} className="mt-8 flex flex-col gap-4">
        <Field label="Code" htmlFor="token">
          <input
            id="token"
            name="token"
            required
            autoFocus
            autoComplete="off"
            spellCheck={false}
            className={`${inputClass} font-mono`}
          />
        </Field>
        <button
          type="submit"
          className="bg-ember text-wall-paper hover:bg-ember-glow text-small inline-flex h-10 items-center justify-center rounded-md px-4 font-medium"
        >
          Look it up
        </button>
      </form>
    </main>
  );
}
