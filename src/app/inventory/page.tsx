export const dynamic = "force-dynamic";
import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { InventoryClient } from "./client";
import type { InventoryClientItem, InventoryInitialPage } from "./client";
import { getInventorySnapshot } from "@/lib/inventory-cache";

const INVENTORY_FULL_PAGE_SIZE_ENV = Number(process.env.INVENTORY_FULL_LOAD_LIMIT);
const INVENTORY_FULL_PAGE_SIZE =
  Number.isFinite(INVENTORY_FULL_PAGE_SIZE_ENV) && INVENTORY_FULL_PAGE_SIZE_ENV > 0
    ? INVENTORY_FULL_PAGE_SIZE_ENV
    : null;

export default async function InventoryPage() {
  const startedAt = Date.now();
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/login");
  }

  const role = (session.user.role ?? "").toLowerCase();
  const ownerId = role === "viewer" ? session.user.id : null;
  let items: unknown[] = [];
  let total = 0;
  try {
    const snapshot = await getInventorySnapshot(ownerId, INVENTORY_FULL_PAGE_SIZE);
    items = snapshot.items as unknown[];
    total = snapshot.total;
  } catch (err) {
    console.error("[inventory] snapshot failed", err);
  }
  const plainItems = items as InventoryClientItem[];
  const initialPageSize = plainItems.length;

  const elapsedMs = Date.now() - startedAt;
  console.log(
    `[inventory] page render ${elapsedMs}ms items=${plainItems.length} total=estimated role=${role}`
  );

  const initialPage: InventoryInitialPage = {
    items: plainItems,
    page: 1,
    pageSize: initialPageSize,
    total
  };

  return (
    <InventoryClient
      initialPage={initialPage}
      userRole={session.user.role ?? "operator"}
    />
  );
}
