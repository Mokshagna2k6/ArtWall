import { NextResponse } from "next/server";

import { features } from "@/config/site";
import { listCommunityGallery } from "@/features/physical-wall/actions/ugc";

export const dynamic = "force-dynamic";

export async function GET() {
  if (!features.physicalWall) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const items = await listCommunityGallery();
  return NextResponse.json({ items });
}
