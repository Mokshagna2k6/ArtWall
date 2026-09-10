"use client";

import { useActionState } from "react";

import {
  respondToGrievance,
  closeGrievance,
} from "@/features/physical-wall/actions/admin-ops";
import {
  Field,
  FormStatus,
  inputClass,
  SubmitButton,
} from "@/features/physical-wall/components/form-bits";
import type { ActionState } from "@/features/physical-wall/action-state";

/**
 * Grievance inbox (Phase 1, §5.3).
 *
 * One card per grievance: what they said, the 30-day clock, and a reply box.
 * The clock is the point — DPDP grievance redressal is a deadline, not an
 * intention, so the days remaining are computed and shown, not implied.
 */

const initial: ActionState = { status: "idle" };

export interface GrievanceRow {
  id: string;
  subject: string;
  body: string;
  contact: string;
  status: string;
  dueAt: string;
  createdAt: string;
  responses: { id: string; body: string; createdAt: string }[];
}

function daysLeft(dueAt: string): number {
  return Math.ceil(
    (new Date(dueAt).getTime() - Date.now()) / (1000 * 60 * 60 * 24)
  );
}

export function GrievanceInbox({ grievances }: { grievances: GrievanceRow[] }) {
  return (
    <div className="flex flex-col gap-4">
      {grievances.length === 0 && (
        <p className="text-ink-muted border-hairline rounded-md border border-dashed p-8 text-center text-sm">
          No grievances. Long may it last.
        </p>
      )}
      {grievances.map((g) => (
        <GrievanceCard key={g.id} grievance={g} />
      ))}
    </div>
  );
}

function GrievanceCard({ grievance: g }: { grievance: GrievanceRow }) {
  const [respondState, respondAction] = useActionState(respondToGrievance, initial);
  const [closeState, closeAction] = useActionState(closeGrievance, initial);
  const left = daysLeft(g.dueAt);
  const overdue = left < 0 && g.status === "open";

  return (
    <article className="border-hairline rounded-md border p-5">
      <header className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="text-ink text-sm font-semibold">{g.subject}</h3>
          <p className="text-ink-muted mt-1 text-xs">
            {g.contact} · {new Date(g.createdAt).toLocaleDateString("en-IN")}
          </p>
        </div>
        <span
          className={`text-label rounded-full border px-2.5 py-1 tracking-wider uppercase ${
            g.status === "open"
              ? overdue
                ? "text-destructive border-destructive/40"
                : "text-ember border-ember/40"
              : "text-signal border-signal/40"
          }`}
        >
          {g.status === "open"
            ? overdue
              ? `${Math.abs(left)}d overdue`
              : `${left}d left`
            : g.status}
        </span>
      </header>

      <p className="text-ink-muted mt-3 text-sm leading-6 whitespace-pre-wrap">
        {g.body}
      </p>

      {g.responses.length > 0 && (
        <div className="border-hairline mt-4 flex flex-col gap-3 rounded-md border-l-2 pl-4">
          {g.responses.map((r) => (
            <div key={r.id}>
              <p className="text-ink text-sm leading-6 whitespace-pre-wrap">{r.body}</p>
              <time className="text-ink-muted text-xs">
                {new Date(r.createdAt).toLocaleString("en-IN")}
              </time>
            </div>
          ))}
        </div>
      )}

      {g.status === "open" && (
        <form action={respondAction} className="mt-4 flex flex-col gap-3">
          <input type="hidden" name="grievanceId" value={g.id} />
          <Field label="Reply" htmlFor={`reply-${g.id}`}>
            <textarea
              id={`reply-${g.id}`}
              name="body"
              rows={3}
              required
              minLength={10}
              maxLength={2000}
              className={`${inputClass} h-auto py-2`}
              placeholder="What we did about it, in plain language."
            />
          </Field>
          <div className="flex items-center gap-3">
            <SubmitButton>Send reply</SubmitButton>
            <FormStatus state={respondState} />
          </div>
        </form>
      )}

      {g.status === "answered" && (
        <form action={closeAction} className="mt-4">
          <input type="hidden" name="grievanceId" value={g.id} />
          <div className="flex items-center gap-3">
            <SubmitButton variant="quiet">Close</SubmitButton>
            <FormStatus state={closeState} />
          </div>
        </form>
      )}
    </article>
  );
}