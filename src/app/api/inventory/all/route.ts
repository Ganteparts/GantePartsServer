export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { serializeInventoryItem } from "@/lib/inventory-serialization";

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

  type InventoryAllRow = {
    id: string;
    skuInternal: string;
    sellerCustomField: string | null;
    title: string | null;
    price: unknown;
    stock: number;
    status: string;
    mlItemId: string | null;
    extraData: unknown;
    photoCount: number;
    createdAt: Date;
    updatedAt: Date;
  };

  const items = await prisma.$queryRaw<InventoryAllRow[]>(Prisma.sql`
    SELECT
      "id",
      "skuInternal",
      "sellerCustomField",
      "title",
      "price",
      "stock",
      "status",
      "mlItemId",
      ("extraData" - 'photos') AS "extraData",
      COALESCE(
        CASE
          WHEN jsonb_typeof("extraData"->'photos') = 'array' THEN jsonb_array_length("extraData"->'photos')
          ELSE 0
        END,
        0
      )::int AS "photoCount",
      "createdAt",
      "updatedAt"
    FROM "InventoryItem"
    ${where ? Prisma.sql`WHERE "ownerId" = ${session.user.id}` : Prisma.empty}
    ORDER BY "updatedAt" DESC
    ${typeof take === "number" ? Prisma.sql`LIMIT ${take}` : Prisma.empty}
  `);

  return NextResponse.json({
    total,
    items: items.map((item) => serializeInventoryItem(item)),
    truncated: shouldTruncate
  });
}
