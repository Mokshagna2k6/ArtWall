import "server-only";

import type { PolicyName } from "@artwall/ratelimit";

import { PreconditionError } from "@/features/physical-wall/actions/shared";
import { limitPolicy, retryIn } from "@/lib/rate-limit";

/** Server actions cannot set Retry-After, so a blocked call becomes a PreconditionError with the wait in the message. */
export async function enforcePolicy(policy: PolicyName, userId: string): Promise<void> {
  const rl = await limitPolicy(policy, userId);
  if (rl.ok) return;
  throw new PreconditionError(
    rl.unavailable
      ? "This is temporarily unavailable on our side. Please try again in a moment."
      : `Too many requests. Try again in ${retryIn(rl)}.`
  );
}
