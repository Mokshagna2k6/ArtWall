import { NextResponse } from "next/server";

/**
 * FE-3.19 session-wide shell: the "View site" escape hatch. A plain GET
 * route (the sidebar link is a normal <Link>, not a form) that sets the
 * opt-out cookie root layout.tsx checks, then sends the admin to the
 * homepage they're opting into seeing.
 *
 * The cookie has no server-side meaning beyond "don't redirect this account
 * into the admin shell" — it is read nowhere else — so it is not
 * httpOnly/secure-gated the way a session token would be; worst case
 * someone sets it on themselves and sees the admin shell one redirect later
 * than usual, which is not a privilege change.
 */
export function GET(request: Request) {
  const response = NextResponse.redirect(new URL("/", request.url));
  response.cookies.set("pw_view_site", "1", {
    path: "/",
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 7, // a week; cleared sooner by visiting /physical-wall/admin again
  });
  return response;
}
