import type { InventoryClientItem } from "@/app/inventory/client";
import { prisma } from "@/lib/prisma";
import { INVENTORY_LIST_SELECT, serializeInventoryItem } from "@/lib/inventory-serialization";

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
  const where = ownerId ? { ownerId } : undefined;
  const limit = resolveTake(take);

  const startedAt = Date.now();

  const items = await prisma.inventoryItem.findMany({
    where,
    orderBy: { updatedAt: "desc" },
    ...(typeof limit === "number" ? { take: limit } : {}),
    select: INVENTORY_LIST_SELECT
  });

  const elapsedMs = Date.now() - startedAt;
  console.log(
    `[inventory] snapshot query ${elapsedMs}ms limit=${typeof limit === "number" ? limit : "all"} total=${items.length} owner=${ownerId ?? "all"}`
  );

  return {
    items: items.map((item) => serializeInventoryItem(item) as InventoryClientItem),
    total: items.length
  };
};
