export const dynamic = "force-dynamic";
export const revalidate = 0;

import type { PublicInventoryPaginatedResult, PublicInventoryListItem } from "@/lib/public-inventory";
import { getPublicInventoryPage } from "@/lib/public-inventory";
import { PublicInventoryClient } from "./client";

const INITIAL_PAGE_SIZE_RAW = Number(process.env.PUBLIC_INVENTORY_INITIAL_PAGE_SIZE ?? "400");
const INITIAL_PAGE_SIZE = Number.isFinite(INITIAL_PAGE_SIZE_RAW) && INITIAL_PAGE_SIZE_RAW > 0 ? INITIAL_PAGE_SIZE_RAW : 400;

const INTERNAL_STATUS_ALLOWLIST = ["ML", "SIN SUBIR"] as const;

const normalizeInternalStatus = (item: PublicInventoryListItem) => {
  const raw = (item.extraData?.estatus_interno ?? item.extraData?.estatusInterno ?? "") as string;
  const normalized = raw?.toString().trim().toUpperCase();
  return normalized && normalized.length ? normalized : null;
};

const filterItemsByStatus = (items: PublicInventoryListItem[]) =>
  items.filter((item) => {
    const status = normalizeInternalStatus(item);
    return status ? INTERNAL_STATUS_ALLOWLIST.includes(status as (typeof INTERNAL_STATUS_ALLOWLIST)[number]) : false;
  });

const buildStatusSummary = (items: PublicInventoryListItem[]) => {
  const counter = new Map<string, number>();
  INTERNAL_STATUS_ALLOWLIST.forEach((label) => counter.set(label, 0));
  items.forEach((item) => {
    const status = normalizeInternalStatus(item);
    if (status && counter.has(status)) {
      counter.set(status, (counter.get(status) ?? 0) + 1);
    }
  });
  return Array.from(counter.entries()).map(([label, count]) => ({ label, count }));
};

const buildFilteredPage = (page: PublicInventoryPaginatedResult, filteredItems: PublicInventoryListItem[]): PublicInventoryPaginatedResult => ({
  ...page,
  page: 1,
  pageSize: filteredItems.length,
  total: filteredItems.length,
  totalPages: 1,
  items: filteredItems
});

export default async function PublicInventoryPage() {
  const initialPage = await getPublicInventoryPage(1, INITIAL_PAGE_SIZE, {
    disablePagination: true,
    filters: { internalStatuses: Array.from(INTERNAL_STATUS_ALLOWLIST) }
  });

  const filteredItems = filterItemsByStatus(initialPage.items);
  const statusSummary = buildStatusSummary(filteredItems);
  const filteredPage = buildFilteredPage(initialPage, filteredItems);

  return <PublicInventoryClient initialPage={filteredPage} statusSummary={statusSummary} />;
}
