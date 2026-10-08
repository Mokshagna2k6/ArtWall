import type { Metadata } from "next";
import Link from "next/link";
import { BadgeCheck, ImageIcon } from "lucide-react";

import { requireAnyAdminRolePage } from "@/features/physical-wall/authorize";

export const metadata: Metadata = {
  title: "Content Admin",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

/**
 * FE-3.18: content_admin already gates nothing by itself today (the
 * moderation page is still on the broad requireRole("admin") catch-all);
 * this page is the first thing that actually requires it. Curator review
 * (curator_admin) is surfaced here too — not because content_admin and
 * curator_admin are the same role (they are not; see migration 0059's
 * header for why curator_admin stayed separate) but because curation is
 * content work and this is the closest Bible tile for it. The curators link
 * below still only works for someone who separately holds curator_admin —
 * requireAnyAdminRolePage on that page checks curator_admin, not this one.
 */
export default async function ContentAdminConsolePage() {
  await requireAnyAdminRolePage(["content_admin"], "/physical-wall/admin/console/content-admin");

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-heading text-display">Content Admin</h1>
        <p className="text-ink-muted mt-2 max-w-2xl text-sm leading-6">
          Artwork moderation and UGC moderation.
        </p>
      </div>

      <Link href="/physical-wall/admin/moderation" className="border-hairline hover:bg-band flex items-center gap-3 rounded-md border p-5 transition-colors">
        <ImageIcon className="size-5 shrink-0" aria-hidden />
        <div>
          <p className="text-sm font-medium">Moderation queue</p>
          <p className="text-ink-muted mt-1 text-xs">Artwork and UGC review</p>
        </div>
      </Link>

      <div>
        <p className="text-label text-ink-muted tracking-wider uppercase">Not content_admin-specific, but related</p>
        <Link href="/physical-wall/admin/curators" className="border-hairline hover:bg-band mt-3 flex items-center gap-3 rounded-md border p-5 transition-colors">
          <BadgeCheck className="size-5 shrink-0" aria-hidden />
          <div>
            <p className="text-sm font-medium">Curator review</p>
            <p className="text-ink-muted mt-1 text-xs">curator_admin — a separate, non-Bible role</p>
          </div>
        </Link>
      </div>
    </div>
  );
}
