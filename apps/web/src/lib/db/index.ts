import "server-only";

// Shim: the client lives in @artwall/db. `server-only` stays here, in the app.
export * from "@artwall/db";
