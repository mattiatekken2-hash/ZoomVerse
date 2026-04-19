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
