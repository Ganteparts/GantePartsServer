export const dynamic = "force-dynamic";

import { auth } from "@/lib/auth";
import { getInventorySnapshot } from "@/lib/inventory-cache";
import { redirect } from "next/navigation";

import { InventoryClient } from "../client";
import type { InventoryClientItem, InventoryInitialPage } from "../client";

const MANUAL_SUGGESTION_LIMIT = 80;

export default async function ManualInventoryPage() {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/login");
  }

  const role = (session.user.role ?? "operator").toLowerCase();
  const ownerId = role === "viewer" ? session.user.id : null;
  let items: unknown[] = [];
  try {
    const snapshot = await getInventorySnapshot(ownerId, MANUAL_SUGGESTION_LIMIT);
    items = snapshot.items as unknown[];
  } catch (err) {
    console.error("[inventory] manual snapshot failed", err);
  }
  const serialized = items as InventoryClientItem[];

  const initialPage: InventoryInitialPage = {
    items: serialized,
    page: 1,
    pageSize: serialized.length || 1,
    total: serialized.length
  };

  return (
    <InventoryClient
      initialPage={initialPage}
      userRole={session.user.role ?? "operator"}
      mode="manual-only"
    />
  );
}
