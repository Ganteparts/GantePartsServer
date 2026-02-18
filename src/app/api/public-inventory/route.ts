import { NextResponse } from "next/server";

import { getPublicInventoryPage } from "@/lib/public-inventory";

const FALLBACK_PAGE_SIZE = 400;
const FALLBACK_MAX_PAGE_SIZE = 1200;
const PUBLIC_PAGE_SIZE = Number(process.env.PUBLIC_INVENTORY_PAGE_SIZE ?? `${FALLBACK_PAGE_SIZE}`);
const DEFAULT_PAGE_SIZE = Number.isFinite(PUBLIC_PAGE_SIZE) && PUBLIC_PAGE_SIZE > 0 ? PUBLIC_PAGE_SIZE : FALLBACK_PAGE_SIZE;
const PUBLIC_PAGE_SIZE_MAX = Number(process.env.PUBLIC_INVENTORY_PAGE_SIZE_MAX ?? `${Math.max(DEFAULT_PAGE_SIZE, FALLBACK_MAX_PAGE_SIZE)}`);
const MAX_PAGE_SIZE = Number.isFinite(PUBLIC_PAGE_SIZE_MAX) && PUBLIC_PAGE_SIZE_MAX >= DEFAULT_PAGE_SIZE ? PUBLIC_PAGE_SIZE_MAX : Math.max(DEFAULT_PAGE_SIZE, FALLBACK_MAX_PAGE_SIZE);

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

const parsePagination = (searchParams: URLSearchParams) => {
  const rawPage = Number.parseInt(searchParams.get("page") ?? "1", 10);
  const rawSize = Number.parseInt(searchParams.get("pageSize") ?? `${DEFAULT_PAGE_SIZE}`, 10);

  const page = clamp(Number.isNaN(rawPage) ? 1 : rawPage, 1, 1000);
  const pageSize = clamp(Number.isNaN(rawSize) ? DEFAULT_PAGE_SIZE : rawSize, 1, MAX_PAGE_SIZE);

  return { page, pageSize };
};

const readFilterValue = (raw: string | null) => {
  if (!raw) return null;
  if (raw.toUpperCase() === "ALL") return null;
  return raw;
};

const parseFilters = (searchParams: URLSearchParams) => {
  const query = readFilterValue(searchParams.get("query"));
  const piece = readFilterValue(searchParams.get("piece"));
  const brand = readFilterValue(searchParams.get("brand"));
  const vehicle = readFilterValue(searchParams.get("vehicle"));
  const year = readFilterValue(searchParams.get("year"));
  return { query, piece, brand, vehicle, year };
};

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const { page, pageSize } = parsePagination(searchParams);
  const filters = parseFilters(searchParams);

  const result = await getPublicInventoryPage(page, pageSize, { filters });

  return NextResponse.json(result);
}
