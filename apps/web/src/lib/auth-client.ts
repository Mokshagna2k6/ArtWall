"use client";

import {
  signInWithPassword,
  signOut as signOutAction,
  signUpWithPassword,
} from "@/features/onboarding/auth-actions";
import { createClient } from "@/lib/supabase/client";

/**
 * Browser-side auth calls, shaped like the better-auth client this replaced.
 *
 * Deliberately a thin adapter rather than a rewrite of every caller: the five
 * call sites (src/components/auth/auth-form.tsx and the two sign-out buttons)
 * each carry real reasoning — the human-readable error mapping, the
 * open-redirect check on `callbackURL`, the DPDP notice placement. Keeping this
 * surface identical means none of that had to be touched or re-reviewed, and
 * the `{ error }` shape those callers branch on still holds.
 *
 * **Credentials go through server actions, not through Supabase directly.**
 * A browser-side `signInWithPassword` would reach Supabase's API without
 * passing this project's rate limiter, losing the credential-stuffing
 * protection in features/onboarding/auth-actions.ts. OAuth is the exception:
 * it is a redirect to Google, not a credential submission, so it runs in the
 * browser where it has to.
 */
export const authClient = {
  signUp: {
    email({ email, password, name }: { email: string; password: string; name: string }) {
      return signUpWithPassword(email, password, name);
    },
  },

  signIn: {
    email({ email, password }: { email: string; password: string }) {
      return signInWithPassword(email, password);
    },

    async social({ provider, callbackURL }: { provider: "google"; callbackURL: string }) {
      const supabase = createClient();
      const { error } = await supabase.auth.signInWithOAuth({
        provider,
        options: {
          // `next` is read back by /api/auth/callback, which re-checks that it
          // is a same-site path before redirecting — the caller already
          // rejects protocol-relative URLs, and the route does not trust that.
          redirectTo: `${window.location.origin}/api/auth/callback?next=${encodeURIComponent(callbackURL)}`,
        },
      });
      return { error: error ? { code: error.code, message: error.message } : null };
    },
  },

  signOut() {
    return signOutAction();
  },
};
