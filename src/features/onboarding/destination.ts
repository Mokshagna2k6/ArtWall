/** Where each persona choice lands. No server-only imports, so both the
 * /welcome Server Component and PersonaChoice's Client Component can use it. */
export function destinationFor(persona: "artist" | "curator" | "buyer"): string {
  if (persona === "artist") return "/studio/onboarding";
  if (persona === "curator") return "/curator/apply";
  return "/discover";
}
