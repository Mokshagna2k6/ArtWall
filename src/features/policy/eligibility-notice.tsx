import type { ReactNode } from "react";

import type { Decision } from "@/features/policy/engine";
import { REASON_COPY } from "@/features/policy/reason-codes";

/**
 * FE-3.05 / FE-3.11: renders a PolicyEngine `Decision` the caller already
 * fetched from the server — never computes eligibility itself.
 *
 * `children` is the gated action (a button, a link, a form). It is rendered
 * only when `decision.allow`; otherwise this shows why not, in plain
 * language, one line per reason code (BE-3.04's `canExhibit`, for example,
 * can return both "binding" and "blockchain" reasons at once).
 */
export function EligibilityNotice({
  decision,
  children,
}: {
  decision: Decision;
  children: ReactNode;
}) {
  if (decision.allow) return <>{children}</>;

  return (
    <div className="border-hairline rounded-md border border-dashed p-4">
      <p className="text-ink-muted text-sm font-medium">Not eligible yet</p>
      <ul className="text-ink-muted mt-2 flex flex-col gap-1 text-sm leading-6">
        {decision.reasons.map((reason) => (
          <li key={reason}>{REASON_COPY[reason]}</li>
        ))}
      </ul>
    </div>
  );
}
