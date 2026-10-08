import { NextResponse } from "next/server";

/**
 * FE-3.19 session-wide shell: the "Dashboard" way back, linked from
 * site-header.tsx's UserMenu while an admin/team-member is browsing the
 * public site post-"View site". Clearing the cookie needs a Route Handler
 * or Server Action — a Server Component layout (e.g. the admin shell's own
 * layout.tsx) cannot write cookies — so this is the symmetric counterpart
 * to ../view-site/route.ts rather than a mutation tucked into that layout.
 */
export function GET(request: Request) {
  const response = NextResponse.redirect(new URL("/physical-wall/admin", request.url));
  response.cookies.delete("pw_view_site");
  return response;
}
