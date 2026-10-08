/**
 * FE-3.18: the admin-area equivalent of `StudioNotAvailable`
 * (`src/components/dashboard/studio-shell.tsx`) — same "say plainly that
 * nothing here is real yet" convention, rebuilt here rather than imported
 * because the studio one is styled with the `studio-*` CSS classes that only
 * exist inside `/studio`, not the physical-wall admin's `border-hairline`/
 * `text-ink-muted` tokens. Used by role landing pages for Bible-named
 * functionality that genuinely has no backend yet (fraud queue, GMV
 * dashboard, dispute resolution, escrow-in-flight tracking, NFC/IPFS pin
 * status, …) — out of scope to build this round per the product brief.
 */
export function AdminNotAvailable({ what }: { what: string }) {
  return (
    <div className="border-hairline rounded-md border border-dashed p-8 text-center">
      <p className="text-ink font-heading text-card">Not yet available</p>
      <p className="text-ink-muted mx-auto mt-2 max-w-md text-sm leading-6">
        {what} isn&rsquo;t built yet. Nothing here is saved or tracked, and no
        data on this page is real. It will appear here once it ships.
      </p>
    </div>
  );
}
