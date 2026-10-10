import "server-only";

import { features } from "@/config/site";
import { PreconditionError } from "@/features/physical-wall/actions/shared";
import { requireAdminRole, type Actor } from "@/features/physical-wall/authorize";
import { getSessionUser } from "@/lib/session";
import { getSql } from "@/lib/db";

/**
 * Access for marketplace checkout.
 *
 * `physical-wall/authorize.ts` gates everything on PHYSICAL_WALL_ENABLED, which
 * is the wrong switch here, so buyers/sellers resolve their own actor. Any
 * signed-in, non-visitor account with a verified email can buy or sell: persona
 * (artist/curator/buyer) is orthogonal to `user.role` (CLAUDE.md), so there is
 * deliberately no "buyer" role to require.
 */

export interface MarketUser {
  id: string;
  name: string;
  email: string;
}

/** The feature flag, as a refusal. 404-flavoured text: a disabled feature does not confirm itself. */
export function requireMarketplaceEnabled(): void {
  if (!features.marketplaceCheckout) throw new PreconditionError("Not found.");
}

export async function requireBuyer(): Promise<MarketUser> {
  requireMarketplaceEnabled();
  const user = await getSessionUser();
  if (!user) throw new PreconditionError("Sign in to continue.");
  const rows = (await getSql()`
    select role, "emailVerified" as verified from "user" where id = ${user.id} limit 1
  `) as { role: string; verified: boolean }[];
  const row = rows[0];
  if (!row || row.role === "visitor") throw new PreconditionError("This account cannot place orders.");
  if (!row.verified) throw new PreconditionError("Verify your email address before buying or selling.");
  return { id: user.id, name: user.name, email: user.email };
}

/** Sellers are ordinary accounts; ownership of a sub-order is checked in SQL (`seller_id = actor`). */
export const requireSeller = requireBuyer;

/** Finance operations (refunds, releases, payouts): admin + finance_admin (or super_admin). */
export async function requireFinance(): Promise<Actor> {
  requireMarketplaceEnabled();
  return requireAdminRole("finance_admin");
}
