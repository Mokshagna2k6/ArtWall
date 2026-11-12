"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { postReview } from "./actions";
import type { ReviewSummary } from "./actions";

/**
 * Reviews under an artwork, plus the form when the viewer may write one.
 *
 * `canWrite` only decides whether the FORM is drawn. The rule (Bible 39 —
 * a review requires a completed purchase) is enforced in `postReview` and by
 * the NOT NULL `order_item_id` foreign key, so hiding the form is a courtesy,
 * never the gate.
 */
export function ReviewSection({
  artworkId,
  summary,
  canWrite,
}: {
  artworkId: string;
  summary: ReviewSummary;
  canWrite: boolean;
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [rating, setRating] = useState(5);
  const [body, setBody] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  function submit() {
    setError(null);
    startTransition(async () => {
      const result = await postReview({ artworkId, rating, body: body.trim() || undefined });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setSent(true);
      setBody("");
      router.refresh();
    });
  }

  return (
    <section className="mt-8">
      <div className="flex items-baseline gap-3">
        <h2 className="text-sm font-semibold">Reviews</h2>
        {summary.average != null && (
          <p className="text-ink-muted text-sm">
            <Stars value={Math.round(summary.average)} /> {summary.average.toFixed(1)} from{" "}
            {summary.count} verified {summary.count === 1 ? "purchase" : "purchases"}
          </p>
        )}
      </div>

      {summary.count === 0 && (
        <p className="text-ink-muted mt-1 text-sm">No reviews yet.</p>
      )}

      <ul className="mt-4 space-y-5">
        {summary.reviews.map((review) => (
          <li key={review.id} className="border-hairline border-t pt-4 first:border-t-0 first:pt-0">
            <div className="flex items-center gap-2 text-sm">
              <Stars value={review.rating} />
              <span className="font-medium">{review.reviewerName}</span>
              <span className="text-ink-muted text-xs">Verified purchase</span>
            </div>
            {review.body && <p className="text-ink-muted mt-2 text-sm">{review.body}</p>}
            {review.responseBody && (
              <div className="border-hairline mt-3 border-l-2 pl-3">
                <p className="text-xs font-medium">Artist&apos;s response</p>
                <p className="text-ink-muted mt-1 text-sm">{review.responseBody}</p>
              </div>
            )}
          </li>
        ))}
      </ul>

      {canWrite && !sent && (
        <div className="border-hairline mt-6 space-y-3 rounded-lg border p-4">
          <p className="text-sm font-medium">Write a review</p>
          <label className="block text-sm">
            Rating
            <select
              value={rating}
              onChange={(event) => setRating(Number(event.target.value))}
              className="border-hairline ml-2 rounded border px-2 py-1 text-sm"
            >
              {[5, 4, 3, 2, 1].map((value) => (
                <option key={value} value={value}>
                  {value} star{value === 1 ? "" : "s"}
                </option>
              ))}
            </select>
          </label>
          <textarea
            value={body}
            onChange={(event) => setBody(event.target.value)}
            rows={3}
            maxLength={4000}
            placeholder="How was the work and the purchase?"
            className="border-hairline w-full rounded border px-3 py-2 text-sm"
          />
          <button
            type="button"
            onClick={submit}
            className="bg-ink rounded-full px-4 py-2 text-sm text-white"
          >
            Post review
          </button>
          {error && (
            <p role="alert" className="text-sm text-red-600">
              {error}
            </p>
          )}
        </div>
      )}

      {sent && <p className="mt-4 text-sm text-green-700">Thanks — your review is live.</p>}
    </section>
  );
}

function Stars({ value }: { value: number }) {
  return (
    <span aria-label={`${value} out of 5`} className="text-amber-500">
      {"★".repeat(value)}
      <span className="text-ink-muted/40">{"★".repeat(5 - value)}</span>
    </span>
  );
}
