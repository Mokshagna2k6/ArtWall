"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { Download, ShieldCheck } from "lucide-react";

import { IDLE } from "@/features/physical-wall/action-state";
import {
  eraseMyData,
  exportMyData,
  raiseGrievance,
  setConsent,
  setNominee,
} from "@/features/physical-wall/actions/account";
import {
  Field,
  FormStatus,
  inputClass,
  SubmitButton,
} from "@/features/physical-wall/components/form-bits";
import {
  GRIEVANCE_RESPONSE_DAYS,
  PURPOSES,
  type ConsentPurpose,
} from "@/features/physical-wall/consent";
import type { AccountFacts } from "@/features/physical-wall/data/consent";

/**
 * The data-principal rights centre (DPDP §5.3).
 *
 * Six rights, six working controls, one page. The Act asks for access,
 * correction, erasure, grievance redressal, nomination and withdrawal — and it
 * asks for them as things a person can do, which is why none of this is a
 * mailto link.
 *
 * The design rule throughout: withdrawal is exactly as easy as consent. One
 * submit, no confirmation step, no "are you sure you want to lose all these
 * benefits". The only control with friction is erasure, and that is because it
 * is irreversible — not because we would rather you didn't.
 */
export function RightsCentre({
  facts,
  liveConsents,
  history,
  email,
}: {
  facts: AccountFacts;
  liveConsents: ConsentPurpose[];
  history: {
    purpose: ConsentPurpose;
    grantedAt: string;
    withdrawnAt: string | null;
  }[];
  email: string;
}) {
  return (
    <div className="flex flex-col gap-12">
      <ConsentSection live={liveConsents} history={history} />
      <ExportSection />
      <CorrectionSection />
      <NomineeSection facts={facts} />
      <GrievanceSection email={email} />
      <EraseSection />
    </div>
  );
}

function ConsentSection({
  live,
  history,
}: {
  live: ConsentPurpose[];
  history: {
    purpose: ConsentPurpose;
    grantedAt: string;
    withdrawnAt: string | null;
  }[];
}) {
  const [state, action] = useActionState(setConsent, IDLE);

  return (
    <section>
      <h2 className="font-heading text-section">What you&rsquo;ve agreed to</h2>
      <p className="text-ink-muted mt-2 max-w-2xl text-sm leading-6">
        One switch per purpose. Turning one off never turns another off, and
        never affects your bookings.
      </p>

      <div className="mt-6 flex flex-col gap-3">
        {PURPOSES.map((purpose) => {
          const on = live.includes(purpose.purpose);
          return (
            <div
              key={purpose.purpose}
              className="border-hairline flex flex-wrap items-start justify-between gap-4 rounded-md border p-4"
            >
              <div className="min-w-56 flex-1">
                <p className="text-sm font-medium">{purpose.label}</p>
                <p className="text-ink-muted mt-1 text-sm leading-6">
                  {purpose.what}
                </p>
                <p className="text-ink-muted mt-1 text-xs leading-5">
                  Kept: {purpose.retention}
                </p>
                {on && (
                  <p className="text-ink-muted mt-1 text-xs leading-5">
                    If you withdraw: {purpose.onWithdraw}
                  </p>
                )}
              </div>

              <form action={action} className="shrink-0">
                <input type="hidden" name="purpose" value={purpose.purpose} />
                <input
                  type="hidden"
                  name="next"
                  value={on ? "withdraw" : "grant"}
                />
                {purpose.required ? (
                  <span className="text-ink-muted text-xs">
                    Required for the account
                  </span>
                ) : (
                  <SubmitButton variant={on ? "quiet" : "primary"}>
                    {on ? "Withdraw" : "Turn on"}
                  </SubmitButton>
                )}
              </form>
            </div>
          );
        })}
      </div>

      <FormStatus state={state} />

      {history.length > 0 && (
        <details className="mt-4">
          <summary className="text-ink-muted hover:text-ink cursor-pointer text-sm">
            Show the full history
          </summary>
          <ul className="text-ink-muted mt-3 flex flex-col gap-1 text-xs">
            {history.map((entry, index) => (
              <li key={`${entry.purpose}-${index}`}>
                {entry.purpose} · given{" "}
                {new Date(entry.grantedAt).toLocaleDateString("en-IN")}
                {entry.withdrawnAt
                  ? ` · withdrawn ${new Date(entry.withdrawnAt).toLocaleDateString("en-IN")}`
                  : " · still in force"}
              </li>
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}

function ExportSection() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function download() {
    setBusy(true);
    setError(null);
    const result = await exportMyData();
    setBusy(false);

    if (!result.ok) {
      setError(result.message);
      return;
    }

    const blob = new Blob([result.json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = result.filename;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  return (
    <section className="border-hairline border-t pt-10">
      <h2 className="font-heading text-section">Everything we hold</h2>
      <p className="text-ink-muted mt-2 max-w-2xl text-sm leading-6">
        Your account, profile, consents, bookings, signed agreements and
        feedback, as a JSON file. Assembled fresh from the database when you ask
        — not a summary we prepared earlier.
      </p>
      <button
        type="button"
        onClick={download}
        disabled={busy}
        className="border-hairline-strong hover:border-ink text-small mt-5 inline-flex h-10 items-center gap-2 rounded-md border px-4 disabled:opacity-60"
      >
        <Download className="size-4" aria-hidden />
        {busy ? "Building…" : "Download my data"}
      </button>
      {error && <p className="text-destructive mt-2 text-sm">{error}</p>}
    </section>
  );
}

function CorrectionSection() {
  return (
    <section className="border-hairline border-t pt-10">
      <h2 className="font-heading text-section">Fix something that&rsquo;s wrong</h2>
      <p className="text-ink-muted mt-2 max-w-2xl text-sm leading-6">
        Your name, city, practice and bio are yours to edit directly. Anything
        else — a booking date, an amount, a record you think is mistaken — goes
        through the grievance channel below, and we will correct it or tell you
        why we cannot.
      </p>
      <Link
        href="/studio/settings"
        className="border-hairline-strong hover:border-ink text-small mt-5 inline-flex h-10 items-center rounded-md border px-4"
      >
        Edit my profile
      </Link>
    </section>
  );
}

function NomineeSection({ facts }: { facts: AccountFacts }) {
  const [state, action] = useActionState(setNominee, IDLE);

  return (
    <section className="border-hairline border-t pt-10">
      <h2 className="font-heading text-section">Nominate someone</h2>
      <p className="text-ink-muted mt-2 max-w-2xl text-sm leading-6">
        The Act lets you name someone to exercise these rights on your behalf if
        you die or become unable to. Optional, and you can clear it at any time
        by emptying both fields.
      </p>

      <form action={action} className="mt-5 grid max-w-xl gap-4 sm:grid-cols-2">
        <Field label="Their name" htmlFor="nomineeName">
          <input
            id="nomineeName"
            name="nomineeName"
            defaultValue={facts.nomineeName ?? ""}
            maxLength={120}
            className={inputClass}
          />
        </Field>
        <Field label="How to reach them" htmlFor="nomineeContact">
          <input
            id="nomineeContact"
            name="nomineeContact"
            defaultValue={facts.nomineeContact ?? ""}
            maxLength={160}
            className={inputClass}
          />
        </Field>
        <div className="sm:col-span-2 flex flex-col gap-3">
          <div>
            <SubmitButton variant="quiet">Save nominee</SubmitButton>
          </div>
          <FormStatus state={state} />
        </div>
      </form>
    </section>
  );
}

function GrievanceSection({ email }: { email: string }) {
  const [state, action] = useActionState(raiseGrievance, IDLE);

  return (
    <section className="border-hairline border-t pt-10">
      <h2 className="font-heading text-section">Raise a grievance</h2>
      <p className="text-ink-muted mt-2 max-w-2xl text-sm leading-6">
        If we have handled your data badly, tell us here. It reaches a named
        person, and we reply within {GRIEVANCE_RESPONSE_DAYS} days. You can also
        complain to the Data Protection Board of India directly — using this
        first does not give up that right.
      </p>

      <form action={action} className="mt-5 flex max-w-xl flex-col gap-4">
        <Field label="Subject" htmlFor="subject">
          <input
            id="subject"
            name="subject"
            required
            minLength={3}
            maxLength={140}
            className={inputClass}
          />
        </Field>
        <Field label="What happened" htmlFor="body">
          <textarea
            id="body"
            name="body"
            required
            minLength={10}
            maxLength={4000}
            rows={5}
            className={`${inputClass} h-auto resize-y py-2.5`}
          />
        </Field>
        <Field label="Where should we reply?" htmlFor="contact">
          <input
            id="contact"
            name="contact"
            required
            defaultValue={email}
            maxLength={140}
            className={inputClass}
          />
        </Field>
        <div>
          <SubmitButton variant="quiet">Send</SubmitButton>
        </div>
        <FormStatus state={state} />
      </form>
    </section>
  );
}

function EraseSection() {
  const [state, action] = useActionState(eraseMyData, IDLE);
  const [open, setOpen] = useState(false);

  return (
    <section className="border-destructive/30 border-t pt-10">
      <h2 className="font-heading text-section text-destructive">
        Delete my data
      </h2>
      <p className="text-ink-muted mt-2 max-w-2xl text-sm leading-6">
        This removes your name, email, profile and public page, and revokes your
        codes. It cannot be undone.
      </p>
      <p className="text-ink-muted mt-3 max-w-2xl text-sm leading-6">
        <strong className="text-ink">What we have to keep:</strong> bookings,
        payments and signed agreements, in anonymised form. Tax and contract law
        require those records, and the Act allows for it — so we say so here
        rather than promising an erasure we cannot perform.
      </p>

      {!open ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="border-destructive/40 text-destructive hover:bg-destructive/5 text-small mt-5 inline-flex h-10 items-center rounded-md border px-4"
        >
          Start deletion
        </button>
      ) : (
        <form action={action} className="mt-5 flex max-w-md flex-col gap-4">
          <Field label="Type DELETE to confirm" htmlFor="confirm">
            <input
              id="confirm"
              name="confirm"
              required
              autoComplete="off"
              className={inputClass}
            />
          </Field>
          <div className="flex items-center gap-3">
            <SubmitButton variant="danger">Delete my data</SubmitButton>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="text-ink-muted hover:text-ink text-small underline underline-offset-4"
            >
              Keep my account
            </button>
          </div>
          <FormStatus state={state} />
        </form>
      )}

      <p className="text-ink-muted mt-8 flex items-start gap-2 text-xs leading-5">
        <ShieldCheck className="mt-0.5 size-3.5 shrink-0" aria-hidden />
        Artwall Labs Private Limited is the data fiduciary for everything on this
        page.
      </p>
    </section>
  );
}
