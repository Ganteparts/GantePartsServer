export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

const SUPPORTED_ACTIONS = ["ml:webhook"];

const PIECE_NAME_KEYS = ["pieza", "descripcion", "descripcion_local", "descripcionLocal", "pieza_nombre", "nombre", "descripcionPieza"];
const VEHICLE_NAME_KEYS = ["coche", "vehiculo", "vehiculo_nombre", "modelo", "modelo_nombre", "carro", "auto"];
const YEAR_START_KEYS = ["ano_desde", "anoDesde", "year_desde", "yearDesde", "year_from", "yearFrom"];
const YEAR_END_KEYS = ["ano_hasta", "anoHasta", "year_hasta", "yearHasta", "year_to", "yearTo"];
const ORDER_NUMBER_KEYS = [
  "pedido",
  "numero_pedido",
  "pedido_numero",
  "numeroPedido",
  "orden",
  "orden_numero",
  "order",
  "order_number",
  "orderNumber",
  "pedidoId",
  "pedido_id"
];

const toRecord = (value: unknown): Record<string, unknown> | null => {
  if (!value) return null;
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
    } catch {
      return null;
    }
    return null;
  }
  if (typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return null;
};

const readExtraValue = (extra: Record<string, unknown> | null, keys: string[]) => {
  if (!extra) return null;
  for (const key of keys) {
    const raw = extra[key];
    if (raw === undefined || raw === null) continue;
    if (typeof raw === "string" || typeof raw === "number") {
      const normalized = String(raw).trim();
      if (normalized.length) return normalized;
    }
  }
  return null;
};

const trimOrNull = (value?: string | null) => {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return normalized.length ? normalized : null;
};

const readYearRange = (extra: Record<string, unknown> | null) => {
  const start = readExtraValue(extra, YEAR_START_KEYS);
  const end = readExtraValue(extra, YEAR_END_KEYS);
  if (!start && !end) return null;
  if (start && end && start !== end) {
    return `${start}-${end}`;
  }
  return start ?? end ?? null;
};

function buildMessage(params: {
  itemId: string | null;
  status: string | null;
  success: boolean;
  error: string | null;
}) {
  const { itemId, status, success, error } = params;
  const displayId = itemId ?? "publicacion";
  if (error) {
    return `No se pudo sincronizar ${displayId}: ${error}`;
  }
  if (!success) {
    return `${displayId} no pudo actualizarse en la base interna`;
  }
  if (!status) {
    return `${displayId} se sincronizo`; 
  }
  const verb =
    status === "active"
      ? "se activo"
      : status === "paused"
        ? "se pauso"
        : status === "inactive"
          ? "se inactivo"
          : "cambio de estado";
  return `${displayId} ${verb}`;
}

export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const rawLimit = searchParams.get("limit");
  const limitParam = Number(rawLimit);
  const limit = rawLimit === "all" ? null : Number.isFinite(limitParam) ? Math.min(Math.max(Math.floor(limitParam), 1), 50) : 12;

  const logs = await prisma.auditLog.findMany({
    where: {
      userId: session.user.id,
      action: { in: SUPPORTED_ACTIONS }
    },
    orderBy: { createdAt: "desc" },
    take: limit ?? undefined
  });

  const baseNotifications = logs.map((log) => {
    const metadata = (log.metadata ?? {}) as Record<string, any>;
    const itemId = typeof metadata.itemId === "string" ? metadata.itemId : null;
    const payloadResource = typeof metadata.payload?.resource === "string" ? metadata.payload.resource : null;
    const derivedItemId = itemId ?? payloadResource;
    const status = typeof metadata.mappedStatus === "string" ? metadata.mappedStatus : typeof metadata.status === "string" ? metadata.status : null;
    const updated = typeof metadata.updated === "number" ? metadata.updated : null;
    const error = typeof metadata.error === "string" ? metadata.error : null;
    const success = error ? false : updated === null ? true : updated > 0;

    return {
      id: log.id,
      createdAt: log.createdAt.toISOString(),
      itemId: derivedItemId,
      status,
      success,
      message: buildMessage({ itemId: derivedItemId, status, success, error })
    };
  });

  const mlItemIds = Array.from(
    new Set(
      baseNotifications
        .map((entry) => (entry.itemId ?? "").toUpperCase())
        .filter((value) => value.length)
    )
  );

  const inventoryMeta = new Map<string, { pieceName: string; orderNumber: string | null; vehicleName: string | null; yearRange: string | null }>();

  if (mlItemIds.length) {
    const inventoryItems = await prisma.inventoryItem.findMany({
      where: {
        ownerId: session.user.id,
        OR: mlItemIds.map((mlItemId) => ({
          mlItemId: {
            equals: mlItemId,
            mode: "insensitive"
          }
        }))
      },
      select: {
        mlItemId: true,
        skuInternal: true,
        title: true,
        sellerCustomField: true,
        extraData: true
      }
    });

    inventoryItems.forEach((item) => {
      if (!item.mlItemId) return;
      const normalizedId = item.mlItemId.toUpperCase();
      const extraRecord = toRecord(item.extraData);
      const pieceName =
        readExtraValue(extraRecord, PIECE_NAME_KEYS) ??
        trimOrNull(item.title) ??
        trimOrNull(item.skuInternal) ??
        normalizedId;
      const orderNumber = readExtraValue(extraRecord, ORDER_NUMBER_KEYS) ?? trimOrNull(item.sellerCustomField);
      const vehicleName = readExtraValue(extraRecord, VEHICLE_NAME_KEYS);
      const yearRange = readYearRange(extraRecord);
      inventoryMeta.set(normalizedId, {
        pieceName,
        orderNumber,
        vehicleName: trimOrNull(vehicleName),
        yearRange: trimOrNull(yearRange)
      });
    });
  }

  const notifications = baseNotifications.map((entry) => {
    const normalizedId = (entry.itemId ?? "").toUpperCase();
    const meta = normalizedId ? inventoryMeta.get(normalizedId) : null;
    const pieceName = meta?.pieceName ?? null;
    const orderNumber = meta?.orderNumber ?? null;
    const vehicleName = meta?.vehicleName ?? null;
    const yearRange = meta?.yearRange ?? null;
    let message = entry.message;

    const normalizedStatus = (entry.status ?? "").toLowerCase();
    const pieceLabel = pieceName ?? entry.itemId ?? "la pieza";
    const vehicleLabel = vehicleName ? ` | ${vehicleName}` : "";
    const yearLabel = yearRange ? ` | ${yearRange}` : "";

    if (normalizedStatus === "inactive") {
      message = `Se inactivo la pieza ${pieceLabel}${vehicleLabel}${yearLabel}`;
    } else if (normalizedStatus === "paused") {
      message = `Se pauso la pieza ${pieceLabel}${vehicleLabel}${yearLabel}`;
    } else if (normalizedStatus === "active") {
      message = `Se activo la pieza ${pieceLabel}${vehicleLabel}${yearLabel}`;
    }

    return {
      ...entry,
      message,
      pieceName,
      orderNumber,
      vehicleName,
      yearRange
    };
  });

  return NextResponse.json({ notifications });
}
