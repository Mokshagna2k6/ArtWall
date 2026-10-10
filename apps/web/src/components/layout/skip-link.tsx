/**
 * Keyboard-only escape hatch past the navigation.
 *
 * Visually hidden until focused, then it appears as a real, styled control.
 * This is the first thing a keyboard or screen-reader user meets, so it is a
 * Server Component with zero JavaScript cost.
 */
export function SkipLink() {
  return (
    <a
      href="#main"
      className="bg-ember text-label sr-only rounded-md px-4 py-2 font-medium tracking-wide text-white uppercase focus-visible:not-sr-only focus-visible:absolute focus-visible:top-4 focus-visible:left-4 focus-visible:z-600"
    >
      Skip to content
    </a>
  );
}
