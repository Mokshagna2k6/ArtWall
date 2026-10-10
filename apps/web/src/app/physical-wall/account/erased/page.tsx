import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Your data has been deleted",
  robots: { index: false, follow: false },
};

/** Where eraseMyData lands after a successful erasure (it signs you out everywhere). */
export default function ErasedPage() {
  return (
    <main className="mx-auto max-w-xl px-5 pt-32 pb-20 sm:px-8">
      <h1 className="font-heading text-display">Your data is deleted.</h1>
      <p role="status" className="text-ink-muted mt-4 leading-7">
        Your account, profile, artworks and uploads are deleted and you have
        been signed out everywhere. Bookings, payments, invoices and signed
        agreements are kept in pseudonymised form because tax and contract law
        require it.
      </p>
      <Link
        href="/"
        className="border-hairline-strong hover:border-ink text-small mt-8 inline-flex h-10 items-center rounded-md border px-4"
      >
        Back to ArtWall
      </Link>
    </main>
  );
}
