import type { Response } from "express";

export interface MarketSaleEvent {
  id: number;
  // 'planet' (default, legacy) or 'equipment'. Lets the live-activity
  // feed render the correct card variant — planet orb vs pixel-art
  // equipment icon — without joining back to the listing row.
  kind?: "planet" | "equipment";
  // Planet fields — populated when kind='planet'. Nullable for equipment
  // sales so the SSE payload stays one consistent shape.
  planetType: string | null;
  planetRate: number | null;
  // Equipment fields — populated when kind='equipment'. Mirror the
  // catalog identity (category/rarity) so the client can colour the
  // card and pick the right pixel-art icon.
  equipmentCategory?: string | null;
  equipmentRarity?: string | null;
  equipmentRate?: number | null;
  price: number;
  sellerName: string;
  buyerName: string;
  soldAt: number;
  // CS:GO-style perfection score in [0, 1] snapshotted from the listing
  // so the live-activity feed can render the same float bar / number
  // the buyer saw on the marketplace card. Null for non-floatable types
  // (Earth/SUN/V1_NFT) or legacy listings without a stored snapshot.
  planetFloat?: number | null;
  // Cosmetic LAB-item tag (e.g. "cat", "ufo") snapshotted from the listing
  // so the live-activity feed renders the item glyph instead of a plain
  // planet orb. Null for plain planets and legacy sales.
  itemKind?: string | null;
}

export interface BoxOpenEvent {
  id: number;
  userName: string;
  award: string;
  awardLabel: string;
  openedAt: number;
}

const clients = new Set<Response>();
const boxClients = new Set<Response>();

export function addClient(res: Response): void {
  clients.add(res);
}

export function removeClient(res: Response): void {
  clients.delete(res);
}

export function addBoxClient(res: Response): void {
  boxClients.add(res);
}

export function removeBoxClient(res: Response): void {
  boxClients.delete(res);
}

export function broadcastSale(sale: MarketSaleEvent): void {
  const payload = `event: sale\ndata: ${JSON.stringify(sale)}\n\n`;
  for (const res of clients) {
    try {
      res.write(payload);
    } catch {
      clients.delete(res);
    }
  }
}

export function broadcastBoxOpen(ev: BoxOpenEvent): void {
  const payload = `event: open\ndata: ${JSON.stringify(ev)}\n\n`;
  for (const res of boxClients) {
    try {
      res.write(payload);
    } catch {
      boxClients.delete(res);
    }
  }
}
