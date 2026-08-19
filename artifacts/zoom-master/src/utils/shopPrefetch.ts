import {
  fetchHomeState,
  fetchSlotPrice,
  fetchStardustMarketPrice,
  fetchSunStock,
  type HomeState,
  type SlotPriceInfo,
  type SunStock,
} from "./api";

export interface ShopStockInfo {
  sold: number;
  remaining: number;
  max: number;
}

export interface ShopPrefetchSnapshot {
  telegramId: string;
  sunStock: SunStock | null;
  home: HomeState | null;
  slotPrice: SlotPriceInfo | null;
  stardustIndex: number;
  collStocks: Record<string, ShopStockInfo | null>;
  fetchedAt: number;
}

const COLLECTION_STOCK_ENDPOINTS: Record<string, string> = {
  white: "api/white-collection/stock",
  earth: "api/earth-collection/stock",
  black: "api/black-collection/stock",
  supernova: "api/supernova-collection/stock",
};

let snapshot: ShopPrefetchSnapshot | null = null;

export function readShopPrefetch(telegramId?: string | null): ShopPrefetchSnapshot | null {
  if (!snapshot || !telegramId || snapshot.telegramId !== telegramId) return null;
  return snapshot;
}

async function fetchCollStocks(): Promise<Record<string, ShopStockInfo | null>> {
  const entries = await Promise.all(
    Object.entries(COLLECTION_STOCK_ENDPOINTS).map(async ([key, stockEndpoint]) => {
      try {
        const r = await fetch(`${import.meta.env.BASE_URL}${stockEndpoint}`);
        if (r.ok) return [key, (await r.json()) as ShopStockInfo] as const;
      } catch { /* ignore */ }
      return [key, null] as const;
    }),
  );
  return Object.fromEntries(entries);
}

/** Warm shop API data during boot so Shop opens with stock/prices already loaded. */
export async function prefetchShopData(telegramId: string | null | undefined): Promise<void> {
  if (!telegramId) return;
  const [sunStock, home, slotPrice, stardustPrice, collStocks] = await Promise.all([
    fetchSunStock(telegramId),
    fetchHomeState(telegramId),
    fetchSlotPrice(telegramId),
    fetchStardustMarketPrice(),
    fetchCollStocks(),
  ]);
  snapshot = {
    telegramId,
    sunStock,
    home,
    slotPrice,
    stardustIndex: stardustPrice && Number.isFinite(stardustPrice.index) ? stardustPrice.index : 1,
    collStocks,
    fetchedAt: Date.now(),
  };
  window.dispatchEvent(new Event("zoom-shop-prefetch"));
}

export function patchShopPrefetch(
  telegramId: string | null | undefined,
  patch: Partial<Omit<ShopPrefetchSnapshot, "telegramId" | "fetchedAt">>,
): void {
  if (!telegramId || !snapshot || snapshot.telegramId !== telegramId) return;
  snapshot = { ...snapshot, ...patch, fetchedAt: Date.now() };
}
