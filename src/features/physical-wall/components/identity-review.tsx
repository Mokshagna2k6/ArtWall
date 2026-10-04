"use client";

import { useActionState } from "react";

import { IDLE } from "@/features/physical-wall/action-state";
import { reviewIdentity } from "@/features/physical-wall/actions/identity";
import {
  FormStatus,
  SubmitButton,
  inputClass,
} from "@/features/physical-wall/components/form-bits";

interface Item {
  id: string;
  user_id: string;
  doc_cloudinary_id: string;
  doc_kind: string;
  created_at: string;
  name: string;
  email: string;
}

export function IdentityReviewList({ items }: { items: Item[] }) {
  if (items.length === 0) {
    return (
      <div className="border-hairline rounded-md border border-dashed p-10 text-center">
        <p className="text-ink-muted text-sm">No pending verifications.</p>
      </div>
    );
  }

  return (
    <ul className="flex flex-col gap-4">
      {items.map((item) => (
        <li key={item.id}>
          <ReviewCard item={item} />
        </li>
      ))}
    </ul>
  );
}

function ReviewCard({ item }: { item: Item }) {
  const [state, action] = useActionState(reviewIdentity, IDLE);

  return (
    <article className="border-hairline rounded-md border p-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm font-medium">{item.name}</p>
          <p className="text-ink-muted text-xs">{item.email}</p>
          <p className="text-ink-muted mt-1 text-xs">
            {item.doc_kind} · Submitted{" "}
            {new Date(item.created_at).toLocaleDateString("en-IN")}
          </p>
        </div>
        {/* SEC-2.08: no direct, permanent, unsigned Cloudinary URL for an
            identity document — that's a public link to someone's ID with no
            auth check, if the asset id is ever logged, cached, or screenshot.
            There's no submission flow wired up yet to produce a real
            doc_cloudinary_id (see src/features/physical-wall/actions/identity.ts),
            so there's nothing here to link to today; when that flow exists,
            it must upload with `type: "authenticated"` and this must view
            through a route that checks requireRole("admin"), fetches with a
            Cloudinary-signed short-lived URL or proxies the bytes server-side,
            and audit-logs the view (recordAudit) — never a client-rendered
            public URL. */}
        <span className="text-ink-muted text-small">
          Document: {item.doc_kind} ({item.doc_cloudinary_id})
        </span>
      </div>

      <form action={action} className="mt-4 flex flex-wrap items-end gap-3">
        <input type="hidden" name="verificationId" value={item.id} />
        <input
          name="note"
          placeholder="Note (optional)"
          className={`${inputClass} max-w-xs`}
        />
        <SubmitButton variant="quiet" name="verdict" value="approved">
          Approve
        </SubmitButton>
        <SubmitButton variant="danger" name="verdict" value="rejected">
          Reject
        </SubmitButton>
      </form>
      <FormStatus state={state} />
    </article>
  );
}
