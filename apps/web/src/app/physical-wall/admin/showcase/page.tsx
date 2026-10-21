import type { Metadata } from "next";

import { countShowcaseData } from "@/features/admin/showcase";
import { ShowcasePanel } from "@/features/admin/showcase-panel";
import { requireAnyAdminRolePage } from "@/features/physical-wall/authorize";

export const metadata: Metadata = {
  title: "Showcase data",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

/**
 * Super Admin-only page for removing the showcase catalogue.
 *
 * Gated page-level as well as in the action: `requireAnyAdminRolePage`
 * redirects a non-super_admin before any data loads, so they never see the
 * delete control at all. `purgeShowcaseData` re-checks the role itself, so
 * hiding the page is defence in depth rather than the actual gate.
 */
export default async function ShowcaseAdminPage() {
  await requireAnyAdminRolePage(["super_admin"], "/physical-wall/admin/showcase");

  const counts = await countShowcaseData();

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-heading text-display">Showcase data</h1>
        <p className="text-ink-muted mt-2 max-w-prose text-sm">
          Demonstration artists and artworks that ship with the site so a new
          visitor sees a working catalogue. Remove them once there are enough
          real artists to carry the page on their own.
        </p>
      </div>

      <ShowcasePanel
        initial={counts.ok ? counts.data : { artists: 0, artworks: 0 }}
      />
    </div>
  );
}
