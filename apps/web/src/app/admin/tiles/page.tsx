import type { Metadata } from "next";

import { AdminPanel } from "@/features/admin/admin-panel";
import { SectionHeading } from "@/shared/section-heading";

export const metadata: Metadata = {
  title: "Admin",
  // Keep this page out of search results entirely.
  robots: { index: false, follow: false },
};

export default function AdminPage() {
  return (
    <section className="mx-auto max-w-xl px-5 pt-32 pb-20 sm:px-8 sm:pt-40">
      <SectionHeading
        eyebrow="Admin"
        title="Take a tile down."
        description="Artwork publishes to the wall instantly, so this is how you pull one fast. Hiding is reversible and keeps the artist's founding number."
      />
      <div className="mt-10">
        <AdminPanel />
      </div>
    </section>
  );
}
