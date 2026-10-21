"use client";

import { createBrowserClient } from "@supabase/ssr";

/**
 * Supabase client for Client Components.
 *
 * `createBrowserClient` is a singleton internally, so calling this per
 * component is correct and cheap - it does not open a new connection.
 *
 * Only the anon key is ever referenced here. It is a public credential by
 * design: it identifies the project, and Row Level Security is what decides
 * what a request may read or write. The service-role key must never appear in
 * a file without `server-only`.
 */
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}
