import { stats } from "@/config/content";

/**
 * The stats bar.
 *
 * Five figures on a quiet band, separated by hairline verticals. The numbers
 * use the heading face at section scale so they read as figures, not labels,
 * and each one sits above a single-line caption in the body face.
 *
 * Placed directly after the artwork band: the art is the first thing you see,
 * the scale of the opportunity is the second. Both land before a word of
 * argument.
 *
 * Server Component — pure layout, no JavaScript.
 */
export function StatsBar() {
  return (
    <div className="border-border bg-band border-y">
      <div className="max-w-page mx-auto grid grid-cols-2 px-5 sm:grid-cols-3 sm:px-8 lg:grid-cols-5 lg:px-16">
        {stats.map((stat, i) => (
          <div
            key={stat.label}
            className={`border-border py-7 ${
              i > 0 ? "border-l pl-6 sm:pl-8" : ""
            } ${i >= 2 ? "hidden sm:block" : ""} ${i >= 3 ? "sm:hidden lg:block" : ""}`}
          >
            <div className="font-heading text-section text-foreground">
              {stat.value}
            </div>
            <div className="text-muted-foreground mt-1.5 text-sm">
              {stat.label}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
