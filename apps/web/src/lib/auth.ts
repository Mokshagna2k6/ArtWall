import "server-only";

import { getSessionUser } from "@/lib/session";

/**
 * Compatibility shim for the 20 call sites that used better-auth's `auth`
 * object directly.
 *
 * Every one of them calls exactly `auth.api.getSession({ headers })` and reads
 * `session.user.id` (sometimes `.email`/`.name`) off the result — verified by
 * grep before this migration. Rather than edit 20 files and re-review 20
 * authorization paths, this keeps that one method and resolves it through
 * `getSessionUser()`, which is the single place the Supabase JWT is verified.
 *
 * The `headers` argument is accepted and ignored: `getSessionUser()` reads the
 * request's cookies itself via `next/headers`, which is the same request. It
 * stays in the signature so no caller had to change.
 *
 * **New code should call `getSessionUser()` from `@/lib/session` instead.**
 * This file exists to make the auth migration a contained change, not because
 * two ways of reading the session are desirable.
 */
export const auth = {
  api: {
    async getSession(_options?: { headers?: Headers }) {
      const user = await getSessionUser();
      if (!user) return null;

      // Shaped like better-auth's return value, which is what callers destructure.
      return {
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          image: user.image ?? null,
        },
      };
    },
  },
};
