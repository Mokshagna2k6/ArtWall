"use client";

import { useActionState, useState } from "react";

import { IDLE } from "@/features/physical-wall/action-state";
import { getIdentityDocumentUrl, reviewIdentity } from "@/features/physical-wall/actions/identity";
import {
  ConfirmStep,
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
  const [viewError, setViewError] = useState<string | null>(null);
  const [viewing, setViewing] = useState(false);

  // SEC-2.08: no direct, permanent, unsigned Cloudinary URL for an identity
  // document in this component or anywhere in its markup. The actual asset
  // was uploaded with `type: "authenticated"` (private delivery, never
  // resolvable by its id alone); viewing it goes through
  // getIdentityDocumentUrl, which re-checks the caller is the document's
  // owner or an admin, mints a short-lived (5 minute) signed URL via the
  // Cloudinary SDK, and audit-logs the access before handing it back.
  async function viewDocument() {
    setViewError(null);
    setViewing(true);
    try {
      const result = await getIdentityDocumentUrl(item.id);
      if (!result.ok) {
        setViewError(result.error);
        return;
      }
      window.open(result.data.url, "_blank", "noopener,noreferrer");
    } finally {
      setViewing(false);
    }
  }

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
        <div className="flex flex-col items-end gap-1">
          <button
            type="button"
            onClick={viewDocument}
            disabled={viewing}
            className="border-hairline-strong hover:border-ink text-small inline-flex h-9 items-center rounded-md border px-3 disabled:opacity-50"
          >
            {viewing ? "Generating link…" : "View document"}
          </button>
          {viewError && <p className="text-xs text-red-600">{viewError}</p>}
        </div>
      </div>

      <form action={action} className="mt-4 flex flex-wrap items-end gap-3">
        <input type="hidden" name="verificationId" value={item.id} />
        <input
          name="note"
          placeholder="Note (optional)"
          aria-label={`Note for ${item.name} (optional)`}
          className={`${inputClass} max-w-xs`}
        />
        <SubmitButton variant="quiet" name="verdict" value="approved">
          Approve
        </SubmitButton>
        <ConfirmStep
          label="Reject"
          warning={`Reject ${item.name}'s identity document? They will have to submit a new one.`}
        >
          <SubmitButton variant="danger" name="verdict" value="rejected">
            Confirm reject
          </SubmitButton>
        </ConfirmStep>
      </form>
      <FormStatus state={state} />
    </article>
  );
}
