import "server-only";

import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

/**
 * Supabase client for Server Components, Server Actions and Route Handlers.
 *
 * Created per call, never memoised at module scope: the client closes over
 * *this* request's cookie jar, so a shared instance would read one visitor's
 * session while rendering another's page. Same reasoning as `getSessionUser`
 * re-reading headers on every call (src/lib/session.ts).
 *
 * `setAll` is wrapped in try/catch because a Server Component cannot write
 * headers - only a Route Handler or `proxy.ts` can. That throw is expected and
 * ignored here; the refreshed cookies are written by `updateSession` in
 * src/proxy.ts, which runs on every matching request. Swallowing it anywhere
 * else would hide a real failure, so this catch is deliberately the only one.
 *
 * `server-only` keeps the service-role path and the cookie jar out of any
 * browser bundle - a Client Component importing this file is a build error.
 */
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(
    requireEnv("NEXT_PUBLIC_SUPABASE_URL"),
    requireEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY"),
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            for (const { name, value, options } of cookiesToSet) {
              cookieStore.set(name, value, options);
            }
          } catch {
            // Server Component render - proxy.ts owns the write. See above.
          }
        },
      },
    }
  );
}

/**
 * Supabase client that bypasses Row Level Security.
 *
 * For server-side work that is **not** acting as the signed-in user: the
 * admin area granting a role, a cron job sweeping refunds, a webhook writing a
 * payment. It carries no cookie jar at all, so it can never accidentally
 * inherit a visitor's session.
 *
 * The service-role key is a full-database credential. It must never reach a
 * route that takes its target id from user input without an authorization
 * check first - `requireRole`/`requireAdminRole` in
 * features/physical-wall/authorize.ts stay mandatory, and RLS is a backstop,
 * not a substitute for them.
 */
export function createAdminClient() {
  return createServerClient(
    requireEnv("NEXT_PUBLIC_SUPABASE_URL"),
    requireEnv("SUPABASE_SERVICE_ROLE_KEY"),
    {
      auth: { autoRefreshToken: false, persistSession: false },
      // No session to read or write: this client is never a signed-in user.
      cookies: { getAll: () => [], setAll: () => {} },
    }
  );
}

/**
 * Read a required variable, failing with the name rather than `undefined`.
 *
 * Checked at call time, not module scope, so importing this file during a
 * build where the variables are legitimately absent does not break
 * prerendering - the same reason `getSql()` in src/lib/db.ts is lazy.
 */
function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set.`);
  return value;
}
