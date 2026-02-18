"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type NotificationItem = {
  id: string;
  message: string;
  createdAt: string;
  itemId?: string | null;
  status?: string | null;
  success: boolean;
  pieceName?: string | null;
  orderNumber?: string | null;
  vehicleName?: string | null;
  yearRange?: string | null;
};

const POLL_INTERVAL = 20000;
const VISIBLE_ROW_COUNT = 5;
const ROW_HEIGHT_PX = 72;
const PANEL_SCROLL_HEIGHT = VISIBLE_ROW_COUNT * ROW_HEIGHT_PX;

const statusBadgeClass = (status?: string | null) => {
  switch ((status ?? "").toLowerCase()) {
    case "active":
      return "border-emerald-500/40 bg-emerald-500/10 text-emerald-200";
    case "paused":
      return "border-amber-500/40 bg-amber-500/10 text-amber-200";
    case "inactive":
      return "border-rose-500/40 bg-rose-500/10 text-rose-200";
    default:
      return "border-slate-600/60 bg-slate-800/40 text-slate-300";
  }
};

const formatRelativeTime = (value: string) => {
  const date = new Date(value);
  const diffMs = Date.now() - date.getTime();
  const diffMinutes = Math.round(diffMs / 60000);
  if (Number.isNaN(diffMinutes)) return "";
  if (diffMinutes < 1) return "hace un momento";
  if (diffMinutes < 60) return `hace ${diffMinutes} min`;
  const diffHours = Math.round(diffMinutes / 60);
  if (diffHours < 24) return `hace ${diffHours} h`;
  const diffDays = Math.round(diffHours / 24);
  return `hace ${diffDays} d`;
};

const shouldToast = (status?: string | null) => {
  const normalized = (status ?? "").toLowerCase();
  return normalized === "paused" || normalized === "inactive";
};

const formatAbsoluteDate = (value: string) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString("es-MX", {
    dateStyle: "medium",
    timeStyle: "short"
  });
};

export default function PanelNotifications() {
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<NotificationItem | null>(null);
  const lastNotificationIdRef = useRef<string | null>(null);
  const toastTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isMountedRef = useRef(true);

  const fetchNotifications = useCallback(async (silent = false) => {
    if (!silent && isMountedRef.current) {
      setLoading(true);
      setError(null);
    }
    try {
      const res = await fetch("/api/notifications?limit=all", { cache: "no-store" });
      if (!res.ok) throw new Error("No se pudieron obtener las notificaciones");
      const data = await res.json().catch(() => ({}));
      const list: NotificationItem[] = Array.isArray(data.notifications) ? data.notifications : [];
      if (!isMountedRef.current) return;
      const deduped: NotificationItem[] = [];
      const recentMap = new Map<string, number>();
      const windowMs = 10 * 60 * 1000;
      for (const entry of list) {
        const key = `${entry.itemId ?? ""}:${entry.status ?? ""}`;
        const ts = new Date(entry.createdAt).getTime();
        const lastTs = recentMap.get(key);
        if (lastTs && Math.abs(lastTs - ts) < windowMs) {
          continue;
        }
        recentMap.set(key, ts);
        deduped.push(entry);
      }
      setNotifications(deduped);

      if (deduped.length) {
        const newest = deduped[0];
        if (!lastNotificationIdRef.current) {
          lastNotificationIdRef.current = newest.id;
          return;
        }
        if (lastNotificationIdRef.current !== newest.id) {
          lastNotificationIdRef.current = newest.id;
          if (shouldToast(newest.status)) {
            setToast(newest);
            if (toastTimeoutRef.current) {
              clearTimeout(toastTimeoutRef.current);
            }
            toastTimeoutRef.current = setTimeout(() => {
              setToast(null);
              toastTimeoutRef.current = null;
            }, 6000);
          }
        }
      }
    } catch (err: any) {
      if (!silent && isMountedRef.current) {
        setError(err?.message || "No se pudieron cargar notificaciones");
      }
    } finally {
      if (!silent && isMountedRef.current) {
        setLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    fetchNotifications(true);
    const interval = setInterval(() => fetchNotifications(true), POLL_INTERVAL);
    return () => clearInterval(interval);
  }, [fetchNotifications]);

  useEffect(() => {
    return () => {
      isMountedRef.current = false;
      if (toastTimeoutRef.current) {
        clearTimeout(toastTimeoutRef.current);
      }
    };
  }, []);

  return (
    <section className="rounded-3xl border border-slate-800 bg-slate-900/40 p-6 shadow-xl">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-[0.35em] text-amber-400">Mercado Libre</p>
          <h2 className="mt-2 text-lg font-semibold text-white">Notificaciones de estado</h2>
          <p className="text-xs text-slate-400">Avisos cuando una publicación se pausa o se inactiva.</p>
        </div>
        <button
          type="button"
          onClick={() => fetchNotifications(false)}
          disabled={loading}
          className="rounded-full border border-slate-700 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-slate-200 hover:border-amber-400 disabled:opacity-60"
        >
          {loading ? "Actualizando..." : "Actualizar"}
        </button>
      </div>

      {error && <p className="mt-4 text-sm text-rose-300">{error}</p>}

      <div className="mt-5 overflow-y-auto pr-2" style={{ maxHeight: PANEL_SCROLL_HEIGHT }}>
        <div className="divide-y divide-slate-800">
          {notifications.length ? (
            notifications.map((entry) => (
              <div key={entry.id} className="flex flex-col gap-2 py-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-sm text-slate-100">{entry.message}</p>
                  <p className="text-[11px] text-slate-500">
                    {formatRelativeTime(entry.createdAt)} · {formatAbsoluteDate(entry.createdAt)}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2 text-[11px] text-slate-400">
                  {entry.itemId && <span className="font-mono tracking-wide">{entry.itemId}</span>}
                  {entry.orderNumber && (
                    <span className="rounded-full border border-emerald-500/40 px-2 py-0.5 text-emerald-200">
                      Pedido: {entry.orderNumber}
                    </span>
                  )}
                  {entry.status && (
                    <span className={`rounded-full border px-2 py-0.5 ${statusBadgeClass(entry.status)}`}>
                      {entry.status}
                    </span>
                  )}
                </div>
              </div>
            ))
          ) : (
            <p className="py-4 text-sm text-slate-400">Sin notificaciones recientes.</p>
          )}
        </div>
      </div>

      {toast && (
        <div className="fixed right-4 top-4 z-50 w-full max-w-sm rounded-2xl border border-slate-700 bg-slate-900/95 p-4 shadow-2xl backdrop-blur">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-[10px] uppercase tracking-[0.4em] text-amber-400">Mercado Libre</p>
              <p className="text-sm text-slate-100">{toast.message}</p>
              <p className="mt-1 text-[11px] text-slate-500">
                {formatRelativeTime(toast.createdAt)} · {formatAbsoluteDate(toast.createdAt)}
              </p>
            </div>
            <button
              type="button"
              className="rounded-full border border-slate-700 px-2 py-1 text-xs text-slate-300 hover:border-amber-400"
              onClick={() => {
                if (toastTimeoutRef.current) {
                  clearTimeout(toastTimeoutRef.current);
                  toastTimeoutRef.current = null;
                }
                setToast(null);
              }}
            >
              ×
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
