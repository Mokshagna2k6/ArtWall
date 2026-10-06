import type { DemandSignal } from "@/features/demand/aggregate";

/**
 * FE-3.06: the Demand Engine's signal, shown on artwork and exhibition
 * pages. Relative to the highest score currently recorded — see
 * `loadDemandSignal`'s doc comment for why there's no fixed scale to show
 * a percentage against.
 */
export function DemandMeter({ signal }: { signal: DemandSignal }) {
  if (signal.maxScore <= 0) return null;
  const fillPercent = Math.max(4, Math.round((signal.score / signal.maxScore) * 100));

  return (
    <div className="mt-4">
      <div className="flex items-center justify-between">
        <p className="text-ink-muted text-xs font-medium tracking-wider uppercase">
          Demand
        </p>
        {signal.thresholdCrossed && (
          <span className="text-xs font-medium text-green-600">
            Trending
          </span>
        )}
      </div>
      <div className="bg-band mt-1.5 h-1.5 w-full overflow-hidden rounded-full">
        <div
          className="h-full rounded-full bg-neutral-800"
          style={{ width: `${fillPercent}%` }}
        />
      </div>
    </div>
  );
}
