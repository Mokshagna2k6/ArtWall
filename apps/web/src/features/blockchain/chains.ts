/**
 * Chain id to readable name.
 *
 * Deliberately its own module with NO `"use client"`: this is a pure lookup
 * with no hooks, state or browser APIs, and both sides need it — the client
 * mint controls use it in a status message, and `/studio/certificates` (a
 * Server Component) renders it twice.
 *
 * It used to live in `mint-controls.tsx`, which IS `"use client"`. Importing a
 * plain function out of a client module does not make it callable on the
 * server: Next.js replaces every export with a client reference, so the
 * certificates page failed at render with "Attempted to call chainName() from
 * the server but chainName is on the client" — a 500 behind a page that had
 * already returned 200, so it surfaced as the generic error screen rather than
 * a failed request.
 */

/** Hex chain id -> readable name, for the few we actually target. */
const CHAIN_NAMES: Record<number, string> = {
  1: "Ethereum mainnet",
  137: "Polygon",
  8453: "Base",
  84532: "Base Sepolia (testnet)",
  11155111: "Sepolia (testnet)",
  2442: "Polygon zkEVM Cardona (testnet)",
};

export function chainName(id: number | null | undefined): string {
  if (id == null) return "unknown network";
  return CHAIN_NAMES[id] ?? `chain ${id}`;
}
