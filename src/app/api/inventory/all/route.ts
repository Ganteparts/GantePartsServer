export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { INVENTORY_LIST_SELECT, serializeInventoryItem } from "@/lib/inventory-serialization";

const parsedLimit = Number(process.env.INVENTORY_FULL_LOAD_LIMIT);
const FULL_LOAD_LIMIT = Number.isFinite(parsedLimit) && parsedLimit > 0 ? parsedLimit : null;

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const role = (session.user.role ?? "").toLowerCase();
  const where = role === "viewer" ? { ownerId: session.user.id } : undefined;

  const total = await prisma.inventoryItem.count({ where });
  if (total === 0) {
    return NextResponse.json({ total: 0, items: [] });
  }

  const shouldTruncate = FULL_LOAD_LIMIT !== null && total > FULL_LOAD_LIMIT;
  const take = shouldTruncate ? FULL_LOAD_LIMIT : undefined;

  const items = await prisma.inventoryItem.findMany({
    where,
    orderBy: { updatedAt: "desc" },
    ...(typeof take === "number" ? { take } : {}),
    select: INVENTORY_LIST_SELECT
  });

  return NextResponse.json({
    total,
    items: items.map((item) => serializeInventoryItem(item)),
    truncated: shouldTruncate
  });
}
