import Link from "next/link";

/**
 * A lost page, treated as a blank canvas rather than an error.
 *
 * The blueprint's argument for this: everyone eventually hits a 404, which
 * makes it one of the few "delight" moments with a guaranteed audience. It
 * costs nothing to make it feel like the rest of the gallery.
 */
export default function NotFound() {
  return (
    <section className="mx-auto flex max-w-2xl flex-col items-center gap-6 px-5 pt-32 pb-20 text-center sm:pt-40">
      <p className="text-ember text-label tracking-[0.18em] uppercase">404</p>
      <h1 className="font-heading text-h1 tracking-tight text-balance">
        Nothing hangs here yet.
      </h1>
      <p className="text-muted-foreground text-body-lg text-balance">
        This wall is blank. The page you were looking for has moved, or never
        existed. No harm done.
      </p>
      <Link
        href="/"
        className="bg-ember hover:bg-ember-glow text-body mt-2 inline-flex h-12 items-center rounded-md px-6 font-medium text-white transition-colors"
      >
        Back to the wall
      </Link>
    </section>
  );
}
