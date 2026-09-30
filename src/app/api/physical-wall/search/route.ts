import { NextResponse } from "next/server";

import { searchArtworks } from "@/features/physical-wall/actions/search";
import { limitRequest, tooManyRequests } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

// Public read: fails open if the limiter store is down (PERF-2.03, lib/rate-limit.ts).
const SEARCH_LIMIT = { limit: 30, windowMs: 60 * 1000, failOpen: true };

export async function GET(request: Request) {
  const limit = await limitRequest("pw-search", SEARCH_LIMIT, null, request.headers);
  if (!limit.ok) return tooManyRequests(limit, { error: "Too many searches. Slow down." });

  const url = new URL(request.url);
  const q = url.searchParams.get("q") ?? "";

  const form = new FormData();
  form.set("q", q);

  const result = await searchArtworks({ status: "idle" }, form);
  if (result.status !== "ok" || !result.results) {
    return NextResponse.json(
      { error: result.status === "error" ? result.message : "Search failed" },
      { status: 400 }
    );
  }

  return NextResponse.json({ results: result.results });
}
