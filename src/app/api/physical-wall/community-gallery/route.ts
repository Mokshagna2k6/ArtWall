import { NextResponse } from "next/server";

import { physicalWallEnabled } from "@/features/physical-wall/feature-gate";

import { listCommunityGallery } from "@/features/physical-wall/actions/ugc";

export const dynamic = "force-dynamic";

const disabled = () =>
  physicalWallEnabled() ? null : NextResponse.json({ error: "Not found" }, { status: 404 });

export async function GET() {
  const off = disabled();
  if (off) return off;
  const items = await listCommunityGallery();
  return NextResponse.json({ items });
}
