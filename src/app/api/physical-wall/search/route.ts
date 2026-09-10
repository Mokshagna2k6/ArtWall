import { NextResponse } from "next/server";

import { searchArtworks } from "@/features/physical-wall/actions/search";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const q = url.searchParams.get("q") ?? "";

  const result = await searchArtworks({ status: "idle" }, new FormData());
  if (result.status !== "ok" || !result.results) {
    return NextResponse.json(
      { error: result.status === "error" ? result.message : "Search failed" },
      { status: 400 }
    );
  }

  return NextResponse.json({ results: result.results });
}
