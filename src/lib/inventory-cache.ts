import type { InventoryClientItem } from "@/app/inventory/client";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { serializeInventoryItem } from "@/lib/inventory-serialization";

const RAW_FULL_LOAD_LIMIT = Number(process.env.INVENTORY_FULL_LOAD_LIMIT);
const INVENTORY_FULL_LOAD_LIMIT =
  Number.isFinite(RAW_FULL_LOAD_LIMIT) && RAW_FULL_LOAD_LIMIT > 0 ? RAW_FULL_LOAD_LIMIT : null;

export const INVENTORY_SNAPSHOT_TAG = "inventory-initial";

const resolveTake = (value?: number | null) => {
  if (Number.isFinite(value) && (value as number) > 0) {
    return INVENTORY_FULL_LOAD_LIMIT ? Math.min(value as number, INVENTORY_FULL_LOAD_LIMIT) : (value as number);
  }
  return INVENTORY_FULL_LOAD_LIMIT ?? undefined;
};

export const getInventorySnapshot = async (ownerId: string | null, take?: number | null) => {
  const limit = resolveTake(take);

  const startedAt = Date.now();

  type InventorySnapshotRow = {
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

  // Importante: si `extraData.photos` contiene data URLs (base64) puede crecer mucho.
  // Al remover esa clave en SQL evitamos cargar megas por fila y prevenimos fallos del engine.
  const items = await prisma.$queryRaw<InventorySnapshotRow[]>(Prisma.sql`
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
    ${ownerId ? Prisma.sql`WHERE "ownerId" = ${ownerId}` : Prisma.empty}
    ORDER BY "updatedAt" DESC
    ${typeof limit === "number" ? Prisma.sql`LIMIT ${limit}` : Prisma.empty}
  `);

  const elapsedMs = Date.now() - startedAt;
  console.log(
    `[inventory] snapshot query ${elapsedMs}ms limit=${typeof limit === "number" ? limit : "all"} total=${items.length} owner=${ownerId ?? "all"}`
  );

  return {
    items: items.map((item) => serializeInventoryItem(item) as InventoryClientItem),
    total: items.length
  };
};
