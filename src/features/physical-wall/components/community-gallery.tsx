"use client";

import { useEffect, useState } from "react";

import { SelfieBooth } from "@/features/physical-wall/components/selfie-booth";
import { withdrawUgc } from "@/features/physical-wall/actions/ugc";
import { IDLE } from "@/features/physical-wall/action-state";
import { FormStatus } from "@/features/physical-wall/components/form-bits";

export function CommunityGallerySection() {
  const [items, setItems] = useState<
    { id: string; imageUrl: string; caption: string; byline: string; submissionId?: string }[]
  >([]);
  const [loading, setLoading] = useState(true);
  const [withdrawing, setWithdrawing] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch("/api/physical-wall/community-gallery");
        const data = await res.json();
        setItems(data.items ?? []);
      } catch {
        // Silently fail — the gallery is optional.
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  async function handleWithdraw(submissionId: string) {
    setWithdrawing(submissionId);
    const form = new FormData();
    form.append("submissionId", submissionId);
    const res = await withdrawUgc(IDLE, form);
    if (res.status === "ok") {
      setItems((prev) => prev.filter((item) => item.submissionId !== submissionId));
    }
    setWithdrawing(null);
  }

  return (
    <div className="flex flex-col gap-10">
      <div className="grid gap-10 lg:grid-cols-2 lg:gap-24">
        <div>
          <h2 className="font-heading text-section text-balance">
            Spotted at The Wall
          </h2>
          <p className="text-muted-foreground text-lead mt-5 max-w-xl">
            Every piece here hangs somewhere physical — inside the Ric Platter
            restaurant in Jaipur. Scan the QR code beside any work to meet the
            artist who made it, or take a position of your own.
          </p>
        </div>
        <div>
          <SelfieBooth />
        </div>
      </div>

      <div>
        {loading ? (
          <p className="text-ink-muted text-sm">Loading…</p>
        ) : items.length === 0 ? (
          <div className="border-hairline rounded-md border border-dashed p-10 text-center">
            <p className="text-ink-muted text-sm">
              Nothing here yet — take the first wall selfie.
            </p>
          </div>
        ) : (
          <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
            {items.map((item) => (
              <li key={item.id} className="flex flex-col gap-2">
                <figure className="overflow-hidden rounded-md border">
                  <img
                    src={item.imageUrl}
                    alt={item.caption}
                    className="aspect-4/3 h-full w-full object-cover"
                  />
                  <figcaption className="text-ink-muted mt-2 p-2 text-xs leading-5">
                    {item.byline} — &ldquo;{item.caption}&rdquo;
                  </figcaption>
                </figure>
                {item.submissionId && (
                  <form action={() => handleWithdraw(item.submissionId!)}>
                    <button
                      type="submit"
                      disabled={withdrawing === item.submissionId}
                      className="text-small text-ink-muted hover:text-ink underline"
                    >
                      {withdrawing === item.submissionId ? "Removing…" : "Withdraw"}
                    </button>
                    <FormStatus
                      state={
                        withdrawing === item.submissionId
                          ? { status: "ok" as const, message: "" }
                          : IDLE
                      }
                    />
                  </form>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
