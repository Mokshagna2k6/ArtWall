import { NextResponse } from "next/server";

import { listCommunityGallery } from "@/features/physical-wall/actions/ugc";

export const dynamic = "force-dynamic";

export async function GET() {
  const items = await listCommunityGallery();
  return NextResponse.json({ items });
}
