"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

import type { PublicInventoryListItem, PublicInventoryPaginatedResult } from "@/lib/public-inventory";

type PublicInventoryClientProps = {
  initialPage: PublicInventoryPaginatedResult;
  statusSummary?: StatusSummaryEntry[];
};

type StatusSummaryEntry = {
  label: string;
  count: number;
};

const formatCurrencyMx = (value: number | null) => {
  if (value === null || Number.isNaN(value)) return "-";
  try {
    return new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" }).format(value);
  } catch {
    return value?.toString() ?? "-";
  }
};

const readExtraValue = (extra: Record<string, unknown> | null, keys: string[]) => {
  if (!extra) return "";
  for (const key of keys) {
    const value = extra[key];
    if (typeof value === "string" || typeof value === "number") {
      const normalized = String(value).trim();
      if (normalized.length) return normalized;
    }
  }
  return "";
};

const getPieceName = (item: PublicInventoryListItem) => {
  const piece = readExtraValue(item.extraData, ["pieza", "descripcion", "descripcion_local", "descripcionLocal"]);
  return piece || item.title || "Sin título";
};

const getBrand = (item: PublicInventoryListItem) => {
  const raw = readExtraValue(item.extraData, ["marca", "marca_nombre", "brand", "marcaVehiculo"]);
  return raw || null;
};

const getVehicle = (item: PublicInventoryListItem) => {
  const raw = readExtraValue(item.extraData, ["coche", "modelo", "vehiculo"]);
  return raw || null;
};

const getYearRange = (item: PublicInventoryListItem) => {
  const start = readExtraValue(item.extraData, ["ano_desde", "anoDesde"]);
  const end = readExtraValue(item.extraData, ["ano_hasta", "anoHasta"]);
  if (!start && !end) return null;
  return `${start || "-"} - ${end || "-"}`;
};

const getOrigin = (item: PublicInventoryListItem) => readExtraValue(item.extraData, ["origen", "origen_pieza", "origenPieza"]);

const toYearNumber = (value: string) => {
  const match = value.match(/\d{4}/);
  if (!match) return null;
  const parsed = Number.parseInt(match[0], 10);
  return Number.isNaN(parsed) ? null : parsed;
};

const getYearNumbers = (item: PublicInventoryListItem) => {
  const startRaw = readExtraValue(item.extraData, ["ano_desde", "anoDesde"]);
  const endRaw = readExtraValue(item.extraData, ["ano_hasta", "anoHasta"]);
  const start = toYearNumber(startRaw);
  const end = toYearNumber(endRaw);
  if (!start && !end) return [];
  if (start && !end) return [start];
  if (!start && end) return [end];
  const min = Math.min(start!, end!);
  const max = Math.max(start!, end!);
  const maxSpan = Math.min(max - min, 60);
  const years: number[] = [];
  for (let year = min; year <= min + maxSpan; year += 1) {
    years.push(year);
  }
  return years;
};

const matchesYearFilter = (item: PublicInventoryListItem, year: string) => {
  if (year === "ALL") return true;
  const numericYear = Number.parseInt(year, 10);
  if (Number.isNaN(numericYear)) return false;
  const years = getYearNumbers(item);
  if (!years.length) return false;
  return years.includes(numericYear);
};

const getInternalStatus = (item: PublicInventoryListItem) => {
  const status = readExtraValue(item.extraData, ["estatus_interno", "estatusInterno"]);
  return status ? status.toUpperCase() : "ACTIVO";
};

const getQueryHaystack = (item: PublicInventoryListItem) => {
  const chunks: string[] = [];
  const piece = getPieceName(item);
  if (piece) chunks.push(piece);
  if (item.skuInternal) chunks.push(item.skuInternal);
  if (item.sellerCustomField) chunks.push(item.sellerCustomField);
  const vehicle = getVehicle(item);
  if (vehicle) chunks.push(vehicle);
  const brand = getBrand(item);
  if (brand) chunks.push(brand);
  const origin = getOrigin(item);
  if (origin) chunks.push(origin);
  return chunks.join(" ").toLowerCase();
};

const sanitizePhotoResponse = (value: unknown): string[] => {
  if (!Array.isArray(value)) return [];
  return Array.from(
    new Set(
      value
        .map((entry) => (typeof entry === "string" ? entry.trim() : ""))
        .filter((entry) => entry.length)
    )
  );
};

const formatPhotoCount = (count: number | null | undefined) => {
  if (!count) return "Sin fotos";
  if (count === 1) return "1 foto";
  return `${count} fotos`;
};

const formatUpdatedAt = (value?: string | null) => {
  if (!value) return "-";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "-";
  return new Intl.DateTimeFormat("es-MX", {
    day: "2-digit",
    month: "short",
    year: "numeric"
  }).format(parsed);
};

export function PublicInventoryClient({ initialPage, statusSummary }: PublicInventoryClientProps) {
  const [query, setQuery] = useState("");
  const [pieceFilter, setPieceFilter] = useState("ALL");
  const [brandFilter, setBrandFilter] = useState("ALL");
  const [vehicleFilter, setVehicleFilter] = useState("ALL");
  const [yearFilter, setYearFilter] = useState("ALL");

  const items = initialPage.items;
  const totalItems = items.length;

  const [viewerItem, setViewerItem] = useState<PublicInventoryListItem | null>(null);
  const [viewerPhotos, setViewerPhotos] = useState<string[]>([]);
  const [viewerIndex, setViewerIndex] = useState(0);
  const [viewerStatus, setViewerStatus] = useState<{ isLoading: boolean; error: string | null }>({
    isLoading: false,
    error: null
  });

  const openPhotoViewer = useCallback((item: PublicInventoryListItem) => {
    setViewerItem(item);
    setViewerPhotos(item.photoPreview ? [item.photoPreview] : []);
    setViewerIndex(0);
    setViewerStatus({ isLoading: true, error: null });
  }, []);

  const closePhotoViewer = useCallback(() => {
    setViewerItem(null);
    setViewerPhotos([]);
    setViewerIndex(0);
    setViewerStatus({ isLoading: false, error: null });
  }, []);

  const pieceOptions = useMemo(() => {
    const set = new Set<string>();
    items.forEach((item) => {
      const piece = getPieceName(item);
      if (piece) set.add(piece);
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [items]);

  const itemsByPiece = useMemo(() => {
    if (pieceFilter === "ALL") return items;
    return items.filter((item) => getPieceName(item) === pieceFilter);
  }, [items, pieceFilter]);

  const brandOptions = useMemo(() => {
    const set = new Set<string>();
    itemsByPiece.forEach((item) => {
      const brand = getBrand(item);
      if (brand) set.add(brand);
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [itemsByPiece]);

  const itemsByBrand = useMemo(() => {
    if (brandFilter === "ALL") return itemsByPiece;
    return itemsByPiece.filter((item) => getBrand(item) === brandFilter);
  }, [itemsByPiece, brandFilter]);

  const vehicleOptions = useMemo(() => {
    const set = new Set<string>();
    itemsByBrand.forEach((item) => {
      const vehicle = getVehicle(item);
      if (vehicle) set.add(vehicle);
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [itemsByBrand]);

  const itemsByVehicle = useMemo(() => {
    if (vehicleFilter === "ALL") return itemsByBrand;
    return itemsByBrand.filter((item) => getVehicle(item) === vehicleFilter);
  }, [itemsByBrand, vehicleFilter]);

  const yearOptions = useMemo(() => {
    const set = new Set<number>();
    itemsByVehicle.forEach((item) => {
      getYearNumbers(item).forEach((year) => set.add(year));
    });
    return Array.from(set)
      .sort((a, b) => b - a)
      .map((year) => year.toString());
  }, [itemsByVehicle]);

  const itemsByYear = useMemo(() => {
    if (yearFilter === "ALL") return itemsByVehicle;
    return itemsByVehicle.filter((item) => matchesYearFilter(item, yearFilter));
  }, [itemsByVehicle, yearFilter]);

  const filteredItems = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery) return itemsByYear;
    return itemsByYear.filter((item) => getQueryHaystack(item).includes(normalizedQuery));
  }, [itemsByYear, query]);

  const derivedStatusChips = useMemo<StatusSummaryEntry[]>(() => {
    const counter = new Map<string, number>();
    items.forEach((item) => {
      const label = getInternalStatus(item) || "SIN ESTATUS";
      counter.set(label, (counter.get(label) ?? 0) + 1);
    });
    return Array.from(counter.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([label, count]) => ({ label, count }));
  }, [items]);

  const statusChips = statusSummary?.length ? statusSummary : derivedStatusChips;

  useEffect(() => {
    if (!viewerItem) {
      return undefined;
    }

    const controller = new AbortController();
    setViewerStatus({ isLoading: true, error: null });

    const loadPhotos = async () => {
      try {
        const response = await fetch(`/api/public-inventory/${viewerItem.id}/photos`, {
          cache: "no-store",
          signal: controller.signal
        });
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }
        const payload = await response.json();
        const normalized = sanitizePhotoResponse(payload?.photos);
        const nextPhotos = normalized.length
          ? normalized
          : viewerItem.photoPreview
            ? [viewerItem.photoPreview]
            : [];
        if (!controller.signal.aborted) {
          setViewerPhotos(nextPhotos);
          setViewerIndex(0);
          setViewerStatus({ isLoading: false, error: null });
        }
      } catch (error) {
        if (controller.signal.aborted) {
          return;
        }
        console.error("No se pudieron cargar las fotos públicas", error);
        const fallback = viewerItem.photoPreview ? [viewerItem.photoPreview] : [];
        setViewerPhotos(fallback);
        setViewerIndex(0);
        setViewerStatus({ isLoading: false, error: "No se pudieron cargar las fotos. Intenta más tarde." });
      }
    };

    loadPhotos();

    return () => {
      controller.abort();
    };
  }, [viewerItem]);

  const showPrevPhoto = useCallback(() => {
    setViewerIndex((current) => {
      if (viewerPhotos.length <= 1) return current;
      return (current - 1 + viewerPhotos.length) % viewerPhotos.length;
    });
  }, [viewerPhotos.length]);

  const showNextPhoto = useCallback(() => {
    setViewerIndex((current) => {
      if (viewerPhotos.length <= 1) return current;
      return (current + 1) % viewerPhotos.length;
    });
  }, [viewerPhotos.length]);

  useEffect(() => {
    if (!viewerItem) {
      return undefined;
    }
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        closePhotoViewer();
      } else if (event.key === "ArrowLeft") {
        event.preventDefault();
        showPrevPhoto();
      } else if (event.key === "ArrowRight") {
        event.preventDefault();
        showNextPhoto();
      }
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [viewerItem, closePhotoViewer, showPrevPhoto, showNextPhoto]);

  const activePhoto = viewerPhotos[viewerIndex] ?? null;
  const canNavigatePhotos = viewerPhotos.length > 1;
  const viewerPiece = viewerItem ? getPieceName(viewerItem) : null;
  const viewerBrand = viewerItem ? getBrand(viewerItem) : null;
  const viewerVehicle = viewerItem ? getVehicle(viewerItem) : null;
  const viewerYearRange = viewerItem ? getYearRange(viewerItem) : null;
  const viewerOrigin = viewerItem ? getOrigin(viewerItem) : null;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <header className="border-b border-slate-800 bg-slate-900/70 backdrop-blur">
        <div className="mx-auto flex max-w-6xl flex-col gap-4 px-4 py-10">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="text-xs uppercase tracking-[0.3em] text-emerald-400">Inventario público filtrado</div>
            <Link
              href="/"
              className="rounded-full border border-emerald-500/60 bg-emerald-500/10 px-4 py-2 text-xs font-semibold uppercase tracking-widest text-emerald-200 hover:border-emerald-300"
            >
              Volver al inicio
            </Link>
          </div>
          <h1 className="text-3xl font-semibold text-white md:text-4xl">Piezas en ML o sin subir</h1>
          <p className="text-slate-400 md:text-lg">
            Vista directa del inventario interno mostrando exclusivamente los artículos publicados en Mercado Libre o pendientes por subir.
          </p>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-3 py-6 sm:px-4 sm:py-8">
        <section className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4 shadow-xl shadow-black/40">
          <div className="md:col-span-2 lg:col-span-4">
            <label className="text-sm text-slate-400" htmlFor="public-search">
              Buscar por SKU, modelo o palabra clave
            </label>
            <input
              id="public-search"
              type="text"
              placeholder="Ej. faro, versa, 12345"
              className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-950/60 px-4 py-3 text-base text-white outline-none transition focus:border-emerald-400"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </div>
          <div className="grid gap-4 pt-4 md:grid md:grid-cols-2 lg:grid-cols-4">
            <div>
              <label className="text-sm text-slate-400" htmlFor="piece-filter">
                Filtrar por pieza
              </label>
              <select
                id="piece-filter"
                className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-950/60 px-4 py-3 text-base text-white outline-none transition focus:border-emerald-400"
                value={pieceFilter}
                onChange={(event) => {
                  const next = event.target.value;
                  setPieceFilter(next);
                  setBrandFilter("ALL");
                  setVehicleFilter("ALL");
                  setYearFilter("ALL");
                }}
              >
                <option value="ALL">Todas</option>
                {pieceOptions.map((piece) => (
                  <option key={piece} value={piece}>
                    {piece}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-sm text-slate-400" htmlFor="brand-filter">
                Filtrar por marca
              </label>
              <select
                id="brand-filter"
                className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-950/60 px-4 py-3 text-base text-white outline-none transition focus:border-emerald-400"
                value={brandFilter}
                onChange={(event) => {
                  const next = event.target.value;
                  setBrandFilter(next);
                  setVehicleFilter("ALL");
                  setYearFilter("ALL");
                }}
              >
                <option value="ALL">Todas</option>
                {brandOptions.map((brand) => (
                  <option key={brand} value={brand}>
                    {brand.toUpperCase()}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-sm text-slate-400" htmlFor="vehicle-filter">
                Filtrar por coche
              </label>
              <select
                id="vehicle-filter"
                className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-950/60 px-4 py-3 text-base text-white outline-none transition focus:border-emerald-400"
                value={vehicleFilter}
                onChange={(event) => {
                  const next = event.target.value;
                  setVehicleFilter(next);
                  setYearFilter("ALL");
                }}
              >
                <option value="ALL">Todos</option>
                {vehicleOptions.map((vehicle) => (
                  <option key={vehicle} value={vehicle}>
                    {vehicle.toUpperCase()}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-sm text-slate-400" htmlFor="year-filter">
                Filtrar por año
              </label>
              <select
                id="year-filter"
                className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-950/60 px-4 py-3 text-base text-white outline-none transition focus:border-emerald-400"
                value={yearFilter}
                onChange={(event) => setYearFilter(event.target.value)}
              >
                <option value="ALL">Todos</option>
                {yearOptions.map((year) => (
                  <option key={year} value={year}>
                    {year}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </section>

        <section className="mt-8 space-y-4">
          <div className="flex flex-wrap gap-2">
            {statusChips.map(({ label, count }) => (
              <div
                key={label}
                className="inline-flex items-center gap-2 rounded-full border border-slate-800 bg-slate-900/60 px-4 py-2 text-xs font-semibold tracking-widest text-slate-200"
              >
                <span className="text-lg text-amber-300">{count}</span>
                <span>{label}</span>
              </div>
            ))}
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-slate-400">
            <span>
              Mostrando <strong className="text-white">{filteredItems.length}</strong> de {totalItems} registros filtrados
            </span>
            <span className="text-slate-500">Inventario local • Estados: ML y SIN SUBIR</span>
          </div>
          {filteredItems.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-800 bg-slate-900/40 p-12 text-center text-slate-400">
              Ajusta los filtros para ver el layout en acción.
            </div>
          ) : (
            <>
              <div className="grid gap-4 md:hidden">
                {filteredItems.map((item) => {
                  const pieceName = getPieceName(item);
                  const brand = getBrand(item);
                  const vehicle = getVehicle(item);
                  const yearRange = getYearRange(item);
                  const origin = getOrigin(item);
                  const photoCount = item.photoCount ?? 0;
                  return (
                    <article key={`${item.id}-mobile`} className="rounded-2xl border border-slate-800 bg-slate-900/70 p-4 shadow-md shadow-black/40">
                      <div className="flex items-center justify-between text-xs text-slate-400">
                        <span className="font-mono text-sm text-emerald-200">{item.skuInternal || "-"}</span>
                        <span>Actualizado: {formatUpdatedAt(item.updatedAt)}</span>
                      </div>
                      <div className="mt-3">
                        <h3 className="text-lg font-semibold text-white">{pieceName}</h3>
                        <p className="text-sm text-slate-400">{brand ? brand.toUpperCase() : "-"} · {vehicle ? vehicle.toUpperCase() : "-"}</p>
                        <p className="text-xs text-slate-500">Años {yearRange ?? "-"}</p>
                        <p className="text-xs text-slate-500">Origen {origin || "-"}</p>
                      </div>
                      {item.photoPreview ? (
                        <button
                          type="button"
                          onClick={() => openPhotoViewer(item)}
                          className="mt-4 block w-full overflow-hidden rounded-2xl border border-slate-800 transition hover:border-emerald-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400"
                          aria-label={`Ver fotos de ${pieceName}`}
                        >
                          <div className="relative">
                            <img
                              src={item.photoPreview}
                              alt={`Vista previa de ${pieceName}`}
                              className="h-48 w-full cursor-zoom-in object-cover"
                              loading="lazy"
                            />
                            {photoCount > 1 && (
                              <span className="absolute bottom-2 right-2 rounded-full bg-black/70 px-3 py-1 text-xs font-semibold text-white">
                                +{photoCount - 1}
                              </span>
                            )}
                          </div>
                        </button>
                      ) : (
                        <div className="mt-4 rounded-2xl border border-dashed border-slate-800 px-4 py-8 text-center text-xs text-slate-500">
                          {photoCount > 0 ? (
                            <button
                              type="button"
                              onClick={() => openPhotoViewer(item)}
                              className="font-semibold text-emerald-300 underline-offset-4 hover:underline"
                            >
                              Ver fotos
                            </button>
                          ) : (
                            "Sin foto disponible"
                          )}
                        </div>
                      )}
                      <div className="mt-3 flex items-center justify-between">
                        <span className="text-lg font-bold text-emerald-300">{formatCurrencyMx(item.price)}</span>
                        <span className="text-sm text-slate-400">{formatPhotoCount(photoCount)} · Stock: {item.stock}</span>
                      </div>
                    </article>
                  );
                })}
              </div>
              <div className="hidden overflow-auto rounded-2xl border border-slate-800 bg-slate-950/30 shadow-inner shadow-black/40 md:block">
                <table className="min-w-[1100px] w-full border-collapse text-sm">
                  <thead className="bg-slate-900/60 text-xs font-semibold uppercase tracking-widest text-slate-400">
                    <tr>
                      <th className="px-4 py-3 text-left">SKU</th>
                      <th className="px-4 py-3 text-left">Fotos</th>
                      <th className="px-4 py-3 text-left">Pieza</th>
                      <th className="px-4 py-3 text-left">Marca</th>
                      <th className="px-4 py-3 text-left">Coche</th>
                      <th className="px-4 py-3 text-left">Año</th>
                      <th className="px-4 py-3 text-left">Origen</th>
                      <th className="px-4 py-3 text-right">Precio</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredItems.map((item) => {
                      const brand = getBrand(item);
                      const vehicle = getVehicle(item);
                      const yearRange = getYearRange(item);
                      const origin = getOrigin(item);
                      const pieceName = getPieceName(item);
                      const photoCount = item.photoCount ?? 0;
                      return (
                        <tr key={item.id} className="border-t border-slate-900/80 bg-slate-900/30">
                          <td className="whitespace-nowrap px-4 py-4 align-middle">
                            <div className="font-mono text-sm text-emerald-200">{item.skuInternal || "-"}</div>
                            <div className="text-xs text-slate-500">Actualizado: {formatUpdatedAt(item.updatedAt)}</div>
                          </td>
                          <td className="px-4 py-4">
                            {item.photoPreview ? (
                              <button
                                type="button"
                                onClick={() => openPhotoViewer(item)}
                                className="flex items-center gap-3 rounded-2xl border border-transparent px-2 py-1 transition hover:border-emerald-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400"
                                aria-label={`Ver fotos de ${pieceName}`}
                              >
                                <div className="relative h-16 w-16 overflow-hidden rounded-2xl border border-slate-800">
                                  <img
                                    src={item.photoPreview}
                                    alt={`Vista previa de ${pieceName}`}
                                    className="h-full w-full cursor-zoom-in object-cover"
                                    loading="lazy"
                                  />
                                  {photoCount > 1 && (
                                    <span className="absolute bottom-1 right-1 rounded-full bg-black/70 px-2 py-0.5 text-[10px] font-semibold text-white">
                                      +{photoCount - 1}
                                    </span>
                                  )}
                                </div>
                                <div className="text-xs text-slate-400">{formatPhotoCount(photoCount)}</div>
                              </button>
                            ) : photoCount > 0 ? (
                              <button
                                type="button"
                                onClick={() => openPhotoViewer(item)}
                                className="rounded-full border border-emerald-400/50 px-3 py-1 text-xs font-semibold text-emerald-200 hover:border-emerald-300"
                              >
                                Ver fotos ({photoCount})
                              </button>
                            ) : (
                              <div className="text-xs text-slate-500">Sin foto disponible</div>
                            )}
                          </td>
                          <td className="min-w-[220px] px-4 py-4 align-top">
                            <div className="font-semibold text-white">{pieceName}</div>
                            {item.sellerCustomField && <div className="text-xs text-slate-500">Ubicación: {item.sellerCustomField}</div>}
                          </td>
                          <td className="px-4 py-4 font-semibold text-slate-100">{brand ? brand.toUpperCase() : "-"}</td>
                          <td className="px-4 py-4 text-slate-200">{vehicle ? vehicle.toUpperCase() : "-"}</td>
                          <td className="px-4 py-4 text-slate-200">{yearRange ?? "-"}</td>
                          <td className="px-4 py-4 text-slate-200">{origin || "-"}</td>
                          <td className="px-4 py-4 text-right font-bold text-emerald-300">{formatCurrencyMx(item.price)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </section>

        <div className="mt-8 flex justify-center">
          <Link
            href="/"
            className="rounded-full border border-slate-700 bg-slate-900/70 px-6 py-2 text-sm font-semibold uppercase tracking-widest text-slate-100 hover:border-emerald-400 hover:text-emerald-200"
          >
            Regresar al inicio
          </Link>
        </div>
      </main>

      {viewerItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4 py-8">
          <button
            type="button"
            aria-label="Cerrar visor de fotos"
            className="absolute inset-0 bg-slate-950/80"
            onClick={closePhotoViewer}
          />
          <div className="relative z-10 w-full max-w-5xl rounded-3xl border border-slate-800 bg-slate-950/95 p-6 shadow-2xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs uppercase tracking-[0.3em] text-slate-400">Galería de fotos</p>
                <h2 className="text-2xl font-semibold text-white">{viewerPiece ?? "Detalle de pieza"}</h2>
                <p className="text-sm text-slate-400">
                  {viewerItem.skuInternal || "-"} · {viewerBrand ? viewerBrand.toUpperCase() : "-"} · {viewerVehicle ? viewerVehicle.toUpperCase() : "-"}
                </p>
                <p className="text-xs text-slate-500">{viewerYearRange ?? "-"} · {viewerOrigin || "Sin origen"}</p>
              </div>
              <button
                type="button"
                onClick={closePhotoViewer}
                className="rounded-full border border-slate-700 px-3 py-1 text-sm text-slate-200 hover:border-emerald-400 hover:text-emerald-200"
              >
                Cerrar
              </button>
            </div>
            <div className="relative mt-4 aspect-[4/3] w-full overflow-hidden rounded-2xl border border-slate-800 bg-slate-900">
              {viewerStatus.isLoading ? (
                <div className="flex h-full items-center justify-center text-sm text-slate-400">Cargando fotos...</div>
              ) : activePhoto ? (
                <img src={activePhoto} alt={`Foto de ${viewerPiece ?? "pieza"}`} className="h-full w-full object-contain" loading="lazy" />
              ) : (
                <div className="flex h-full items-center justify-center text-sm text-slate-500">Sin fotos disponibles</div>
              )}
              {canNavigatePhotos && activePhoto && (
                <>
                  <button
                    type="button"
                    onClick={showPrevPhoto}
                    className="absolute left-4 top-1/2 -translate-y-1/2 rounded-full bg-black/60 px-3 py-2 text-2xl text-white hover:bg-black/80"
                    aria-label="Foto anterior"
                  >
                    ‹
                  </button>
                  <button
                    type="button"
                    onClick={showNextPhoto}
                    className="absolute right-4 top-1/2 -translate-y-1/2 rounded-full bg-black/60 px-3 py-2 text-2xl text-white hover:bg-black/80"
                    aria-label="Foto siguiente"
                  >
                    ›
                  </button>
                </>
              )}
            </div>
            {viewerStatus.error && <p className="mt-3 text-sm text-amber-300">{viewerStatus.error}</p>}
            {viewerPhotos.length > 1 && (
              <div className="mt-4 flex gap-2 overflow-x-auto pb-2">
                {viewerPhotos.map((photo, index) => (
                  <button
                    key={`${photo}-${index}`}
                    type="button"
                    onClick={() => setViewerIndex(index)}
                    className={`h-16 w-16 flex-shrink-0 overflow-hidden rounded-xl border ${
                      viewerIndex === index ? "border-emerald-400" : "border-slate-700"
                    }`}
                  >
                    <img src={photo} alt={`Miniatura ${index + 1}`} className="h-full w-full object-cover" loading="lazy" />
                  </button>
                ))}
              </div>
            )}
            <div className="mt-3 text-center text-xs text-slate-400">
              {viewerPhotos.length ? `Foto ${viewerIndex + 1} de ${viewerPhotos.length}` : "Sin fotos para mostrar"}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
