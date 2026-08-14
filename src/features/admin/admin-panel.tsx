"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import { setTileStatus, type AdminState } from "@/features/admin/actions";

const initialState: AdminState = { status: "idle" };

function Submit({ label, value }: { label: string; value: string }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      name="next"
      value={value}
      disabled={pending}
      className="border-border hover:border-ember/50 hover:bg-ember/5 text-body h-11 flex-1 rounded-md border transition-colors disabled:opacity-60"
    >
      {label}
    </button>
  );
}

/**
 * Minimal moderation surface: a password, a founder number, hide or restore.
 *
 * Deliberately not a full admin app. It does the one thing that must be
 * possible within seconds of a bad upload appearing, and nothing else - a
 * bigger console can come when there is enough traffic to need one.
 *
 * The password is posted per action rather than held in a session. That keeps
 * the whole thing stateless with no cookie or token to leak; the cost is
 * retyping it, which is the right trade for something used rarely.
 */
export function AdminPanel() {
  const [state, formAction] = useActionState(setTileStatus, initialState);

  return (
    <form action={formAction} className="flex flex-col gap-5">
      <div className="flex flex-col gap-2">
        <label
          htmlFor="password"
          className="text-label text-muted-foreground tracking-wider uppercase"
        >
          Admin password
        </label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          className="border-border bg-background text-body h-11 rounded-md border px-3"
        />
      </div>

      <div className="flex flex-col gap-2">
        <label
          htmlFor="founderNumber"
          className="text-label text-muted-foreground tracking-wider uppercase"
        >
          Founder number
        </label>
        <input
          id="founderNumber"
          name="founderNumber"
          type="number"
          min={1}
          required
          className="border-border bg-background text-body h-11 rounded-md border px-3 tabular-nums"
        />
      </div>

      <div className="flex gap-3">
        <Submit label="Hide from wall" value="hidden" />
        <Submit label="Restore" value="visible" />
      </div>

      <p aria-live="polite" role="status" className="text-small min-h-5">
        {state.status === "error" && (
          <span className="text-destructive">{state.message}</span>
        )}
        {state.status === "ok" && (
          <span className="text-ember">{state.message}</span>
        )}
      </p>
    </form>
  );
}
