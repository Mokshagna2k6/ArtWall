import type { Metadata } from "next";
import Link from "next/link";

import { requireUser } from "@/lib/session";
import { getMyCuratorApplication } from "@/features/curators/actions";
import { CuratorApplyForm } from "@/features/curators/curator-apply-form";

export const metadata: Metadata = {
  title: "Become a curator",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

const STATUS_COPY: Record<string, { heading: string; body: string }> = {
  pending: {
    heading: "Application pending",
    body: "Your curator application is in review. We'll let you know once a decision is made.",
  },
  active: {
    heading: "You're an approved curator",
    body: "You can now create curator collections in Studio and add artworks to your curator picks.",
  },
  rejected: {
    heading: "Application not approved",
    body: "Your curator application wasn't approved this time.",
  },
  suspended: {
    heading: "Curator access suspended",
    body: "Your curator access has been suspended. Contact support if you believe this is a mistake.",
  },
};

export default async function CuratorApplyPage() {
  const user = await requireUser("/curator/apply");
  const application = await getMyCuratorApplication();

  return (
    <main className="mx-auto max-w-2xl px-5 pt-24 pb-24 sm:px-8 sm:pt-32">
      <h1 className="font-heading text-display">Become a curator</h1>
      <p className="text-ink-muted mt-3 text-sm leading-6">
        Curators build public collections that recommend artworks across the marketplace. Applications are
        reviewed by the ArtWall team before you get curator access.
      </p>

      <div className="mt-8">
        {application ? (
          <div className="border-hairline rounded-md border p-5">
            <p className="font-medium">{STATUS_COPY[application.status]?.heading ?? `Status: ${application.status}`}</p>
            <p className="text-ink-muted mt-2 text-sm leading-6">
              {STATUS_COPY[application.status]?.body ?? "Check back later for an update."}
            </p>
            <p className="text-ink-muted mt-4 text-xs">
              Applied as {application.displayName} on {new Date(application.createdAt).toLocaleDateString("en-IN")}.
            </p>
          </div>
        ) : (
          <CuratorApplyForm />
        )}
      </div>
      <p className="text-ink-muted mt-6 text-xs">Signed in as {user.email}.</p>
      <p className="text-ink-muted mt-2 text-xs">
        Want to close your account instead?{" "}
        <Link href="/studio/settings" className="underline underline-offset-4">
          Go to account settings
        </Link>
        .
      </p>
    </main>
  );
}
