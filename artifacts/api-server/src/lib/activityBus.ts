import type { Response } from "express";

export interface MarketSaleEvent {
  id: number;
  planetType: string;
  planetRate: number;
  price: number;
  sellerName: string;
  buyerName: string;
  soldAt: number;
  // CS:GO-style perfection score in [0, 1] snapshotted from the listing
  // so the live-activity feed can render the same float bar / number
  // the buyer saw on the marketplace card. Null for non-floatable types
  // (Earth/SUN/V1_NFT) or legacy listings without a stored snapshot.
  planetFloat?: number | null;
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
