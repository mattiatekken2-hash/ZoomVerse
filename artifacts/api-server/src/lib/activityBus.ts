import type { Response } from "express";

export interface MarketSaleEvent {
  id: number;
  planetType: string;
  planetRate: number;
  price: number;
  sellerName: string;
  buyerName: string;
  soldAt: number;
}

const clients = new Set<Response>();

export function addClient(res: Response): void {
  clients.add(res);
}

export function removeClient(res: Response): void {
  clients.delete(res);
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
