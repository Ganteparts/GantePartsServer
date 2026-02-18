export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextResponse } from "next/server";

import { getPublicInventoryPhotos } from "@/lib/public-inventory";
import { MAX_ITEM_PHOTOS } from "@/lib/inventory-serialization";

type Params = {
  params: { id: string };
};

export async function GET(request: Request, { params }: Params) {
  if (!params?.id) {
    return NextResponse.json({ message: "Item id is required" }, { status: 400 });
  }

  const searchParams = new URL(request.url).searchParams;
  const limitParam = Number.parseInt(searchParams.get("limit") ?? "", 10);
  const limit = Number.isNaN(limitParam) || limitParam <= 0 ? null : Math.min(limitParam, MAX_ITEM_PHOTOS);

  const photos = await getPublicInventoryPhotos(params.id);

  if (!photos) {
    return NextResponse.json({ message: "Item not found" }, { status: 404 });
  }

  const payload = typeof limit === "number" ? photos.slice(0, limit) : photos;

  return NextResponse.json({ photos: payload }, { headers: { "Cache-Control": "no-store" } });
}
