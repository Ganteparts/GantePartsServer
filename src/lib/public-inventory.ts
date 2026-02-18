import type { Prisma } from "@prisma/client";
import { prisma } from "./prisma";
import { sanitizePhotosArray, serializeInventoryItem } from "./inventory-serialization";

export type PublicInventoryListItem = {
  id: string;
  skuInternal: string;
  title: string | null;
  price: number | null;
  stock: number;
  mlItemId: string | null;
  sellerCustomField: string | null;
  updatedAt: string;
  extraData: Record<string, unknown> | null;
  photoCount: number;
  photoPreview: string | null;
};

export type PublicInventoryPaginatedResult = {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  items: PublicInventoryListItem[];
};

export type PublicInventoryFilters = {
  query?: string | null;
  piece?: string | null;
  brand?: string | null;
  vehicle?: string | null;
  year?: string | null;
  internalStatuses?: string[] | null;
};

export type PublicInventoryPageOptions = {
  disablePagination?: boolean;
  filters?: PublicInventoryFilters;
};

const ACTIVE_ITEMS_WHERE = {
  status: "active" as const
};

const PUBLIC_INVENTORY_SELECT = {
  id: true,
  skuInternal: true,
  title: true,
  price: true,
  stock: true,
  mlItemId: true,
  sellerCustomField: true,
  extraData: true,
  updatedAt: true
} as const;

const serializePublicInventoryItems = <T extends { price: any; extraData?: any; updatedAt: Date }>(items: T[]) =>
  items.map((item) => {
    const serializedItem = serializeInventoryItem(item, { includePhotoPreview: true });
    return {
      id: serializedItem.id,
      skuInternal: serializedItem.skuInternal,
      title: serializedItem.title ?? null,
      price: serializedItem.price ?? null,
      stock: serializedItem.stock ?? 0,
      mlItemId: serializedItem.mlItemId ?? null,
      sellerCustomField: serializedItem.sellerCustomField ?? null,
      extraData: serializedItem.extraData,
      photoCount: serializedItem.photoCount ?? 0,
      photoPreview: serializedItem.photoPreview ?? null,
      updatedAt: item.updatedAt.toISOString()
    } satisfies PublicInventoryListItem;
  });

const buildStringCandidates = (value: string) => Array.from(new Set([value, value.toLowerCase(), value.toUpperCase()])) as string[];

const buildFiltersWhere = (filters?: PublicInventoryFilters): Prisma.InventoryItemWhereInput => {
  if (!filters) {
    return ACTIVE_ITEMS_WHERE;
  }

  const andConditions: Prisma.InventoryItemWhereInput[] = [];

  const normalizedQuery = filters.query?.trim();
  if (normalizedQuery) {
    andConditions.push({
      OR: [
        { skuInternal: { contains: normalizedQuery, mode: "insensitive" } },
        { sellerCustomField: { contains: normalizedQuery, mode: "insensitive" } },
        { title: { contains: normalizedQuery, mode: "insensitive" } },
        { mlItemId: { contains: normalizedQuery, mode: "insensitive" } },
        { extraData: { path: ["pieza"], string_contains: normalizedQuery } },
        { extraData: { path: ["descripcion"], string_contains: normalizedQuery } },
        { extraData: { path: ["descripcion_local"], string_contains: normalizedQuery } },
        { extraData: { path: ["descripcionLocal"], string_contains: normalizedQuery } },
        { extraData: { path: ["marca"], string_contains: normalizedQuery } },
        { extraData: { path: ["coche"], string_contains: normalizedQuery } }
      ]
    });
  }

  const pieceValue = filters.piece?.trim();
  if (pieceValue) {
    const candidates = buildStringCandidates(pieceValue);
    andConditions.push({
      OR: candidates.flatMap((candidate) => [
        { extraData: { path: ["pieza"], equals: candidate } },
        { extraData: { path: ["descripcion"], string_contains: candidate } },
        { extraData: { path: ["descripcion_local"], string_contains: candidate } },
        { extraData: { path: ["descripcionLocal"], string_contains: candidate } }
      ])
    });
  }

  const brandValue = filters.brand?.trim();
  if (brandValue) {
    const candidates = buildStringCandidates(brandValue);
    andConditions.push({
      OR: candidates.flatMap((candidate) => [
        { extraData: { path: ["marca"], equals: candidate } },
        { extraData: { path: ["marca_nombre"], equals: candidate } },
        { extraData: { path: ["brand"], equals: candidate } }
      ])
    });
  }

  const vehicleValue = filters.vehicle?.trim();
  if (vehicleValue) {
    const candidates = buildStringCandidates(vehicleValue);
    andConditions.push({
      OR: candidates.flatMap((candidate) => [
        { extraData: { path: ["coche"], equals: candidate } },
        { extraData: { path: ["modelo"], equals: candidate } },
        { extraData: { path: ["vehiculo"], equals: candidate } }
      ])
    });
  }

  const yearValue = filters.year?.trim();
  if (yearValue) {
    andConditions.push({
      OR: [
        { extraData: { path: ["ano_desde"], equals: yearValue } },
        { extraData: { path: ["ano_hasta"], equals: yearValue } },
        { extraData: { path: ["anoDesde"], equals: yearValue } },
        { extraData: { path: ["anoHasta"], equals: yearValue } }
      ]
    });
  }

  const internalStatusesSource = filters.internalStatuses ?? [];
  const internalStatuses = internalStatusesSource
    .map((status) => status?.trim())
    .filter((status): status is string => Boolean(status && status.length));
  if (internalStatuses.length) {
    const candidates = Array.from(new Set(internalStatuses.flatMap((status) => buildStringCandidates(status))));
    andConditions.push({
      OR: candidates.map((candidate) => ({
        extraData: { path: ["estatus_interno"], equals: candidate }
      }))
    });
  }

  if (!andConditions.length) {
    return ACTIVE_ITEMS_WHERE;
  }

  return {
    ...ACTIVE_ITEMS_WHERE,
    AND: andConditions
  } satisfies Prisma.InventoryItemWhereInput;
};

export async function getPublicInventoryPage(
  page: number,
  pageSize: number,
  options?: PublicInventoryPageOptions
): Promise<PublicInventoryPaginatedResult> {
  if (options?.disablePagination) {
    const items = await prisma.inventoryItem.findMany({
      where: buildFiltersWhere(options.filters),
      orderBy: { updatedAt: "desc" },
      select: PUBLIC_INVENTORY_SELECT
    });
    const serialized = serializePublicInventoryItems(items);
    const total = serialized.length;
    return {
      page: 1,
      pageSize: total,
      total,
      totalPages: 1,
      items: serialized
    };
  }

  const where = buildFiltersWhere(options?.filters);

  const [total, items] = await Promise.all([
    prisma.inventoryItem.count({ where }),
    prisma.inventoryItem.findMany({
      where,
      orderBy: { updatedAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: PUBLIC_INVENTORY_SELECT
    })
  ]);

  const serialized = serializePublicInventoryItems(items);
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  return {
    page,
    pageSize,
    total,
    totalPages,
    items: serialized
  };
}

export async function getPublicInventoryPhotos(itemId: string): Promise<string[] | null> {
  const item = await prisma.inventoryItem.findUnique({
    where: { id: itemId },
    select: { extraData: true, status: true }
  });

  if (!item || item.status !== "active") {
    return null;
  }

  const rawExtra = item.extraData;
  const parsedExtra =
    typeof rawExtra === "string"
      ? (() => {
          try {
            return JSON.parse(rawExtra) as Record<string, unknown>;
          } catch {
            return null;
          }
        })()
      : (rawExtra as Record<string, unknown> | null);

  const photoCandidate = parsedExtra?.photos ?? parsedExtra?.fotos ?? parsedExtra?.imagenes ?? parsedExtra?.images ?? null;

  if (Array.isArray(photoCandidate)) {
    const normalized = photoCandidate
      .map((entry) => {
        if (typeof entry === "string") return entry;
        if (entry && typeof entry === "object") {
          const asRecord = entry as Record<string, unknown>;
          const url = asRecord.url ?? asRecord.dataUrl ?? asRecord.src ?? asRecord.preview;
          return typeof url === "string" ? url : "";
        }
        return "";
      })
      .filter((entry): entry is string => Boolean(entry && entry.trim()))
      .map((entry) => entry.trim());
    return sanitizePhotosArray(normalized);
  }

  return sanitizePhotosArray(photoCandidate);
}

