import { Address, beginCell, toNano, Cell } from "@ton/core";
import {
  ZMC_JETTON_ADDRESS,
  TREASURY_WALLET_ADDRESS,
  parseJettonNano,
  vipLevelFromNano,
  zmcNanoToHuman,
  type VipLevel,
} from "@workspace/game-models";

const TONAPI_TOKEN = process.env["TONAPI_TOKEN"] || "";
const JETTON_TRANSFER_OPCODE = 0xf8a7ea5;

export function treasuryWallet(): string {
  return (process.env["TREASURY_WALLET_ADDRESS"] || TREASURY_WALLET_ADDRESS).trim();
}

export function zmcJettonMaster(): string {
  return (process.env["ZMC_JETTON_ADDRESS"] || ZMC_JETTON_ADDRESS).trim();
}

export function toRawAddress(addr: string): string {
  return Address.parse(addr).toRawString().toLowerCase();
}

export function sameTonAddress(a: string, b: string): boolean {
  try {
    return toRawAddress(a) === toRawAddress(b);
  } catch {
    return false;
  }
}

export function friendlyAddress(addr: string): string {
  try {
    return Address.parse(addr).toString({ bounceable: true, urlSafe: true });
  } catch {
    return addr;
  }
}

async function tonapiGet(path: string): Promise<{ ok: boolean; status: number; json: unknown }> {
  const headers: Record<string, string> = { Accept: "application/json" };
  if (TONAPI_TOKEN) headers["Authorization"] = `Bearer ${TONAPI_TOKEN}`;
  const res = await fetch(`https://tonapi.io${path}`, { headers });
  let json: unknown = null;
  try {
    json = await res.json();
  } catch {
    json = null;
  }
  return { ok: res.ok, status: res.status, json };
}

export function buildJettonTransferPayload(opts: {
  to: string;
  amountNano: bigint;
  response: string;
  queryId?: bigint;
  forwardTon?: bigint;
}): string {
  const body = beginCell()
    .storeUint(JETTON_TRANSFER_OPCODE, 32)
    .storeUint(opts.queryId ?? 0n, 64)
    .storeCoins(opts.amountNano)
    .storeAddress(Address.parse(opts.to))
    .storeAddress(Address.parse(opts.response))
    .storeBit(false)
    .storeCoins(opts.forwardTon ?? toNano("0.01"))
    .storeBit(false)
    .endCell();
  return body.toBoc().toString("base64");
}

export interface JettonWalletInfo {
  balanceNano: bigint;
  walletAddress: string;
}

export async function fetchZmcJettonWallet(owner: string): Promise<JettonWalletInfo | null> {
  const master = encodeURIComponent(zmcJettonMaster());
  const account = encodeURIComponent(owner);
  const r = await tonapiGet(`/v2/accounts/${account}/jettons/${master}`);
  if (!r.ok || !r.json || typeof r.json !== "object") return null;
  const data = r.json as {
    balance?: string;
    wallet_address?: { address?: string };
  };
  const walletAddress = data.wallet_address?.address;
  if (!walletAddress) return null;
  return {
    balanceNano: parseJettonNano(data.balance),
    walletAddress: friendlyAddress(walletAddress),
  };
}

export async function fetchZmcBalanceNano(owner: string): Promise<bigint> {
  const info = await fetchZmcJettonWallet(owner);
  return info?.balanceNano ?? 0n;
}

export function vipFromBalanceNano(nano: bigint): VipLevel {
  return vipLevelFromNano(nano);
}

function msgHashFromBoc(boc: string): string | null {
  try {
    return Cell.fromBase64(boc).hash().toString("hex");
  } catch {
    return null;
  }
}

interface TonApiEventAction {
  type?: string;
  status?: string;
  JettonTransfer?: {
    amount?: string;
    recipient?: { address?: string };
    sender?: { address?: string };
    jetton?: { address?: string };
  };
}

interface TonApiEvent {
  event_id?: string;
  actions?: TonApiEventAction[];
}

export interface ZmcSplitVerifyOk {
  ok: true;
  txHash: string;
  feeHuman: number;
}

export interface ZmcSplitVerifyFail {
  ok: false;
  reason: string;
  retriable: boolean;
}

/**
 * Confirms the buyer paid listing X as two jetton outs: 95% seller, 5% treasury.
 * Waits for the Boc's wallet tx, then matches JettonTransfer actions on the event.
 */
export async function verifyZmcSplitTransfer(opts: {
  boc: string;
  buyerWallet: string;
  sellerWallet: string;
  sellerNano: bigint;
  feeNano: bigint;
}): Promise<ZmcSplitVerifyOk | ZmcSplitVerifyFail> {
  const msgHash = msgHashFromBoc(opts.boc);
  if (!msgHash) return { ok: false, reason: "Invalid BOC", retriable: false };

  const txRes = await tonapiGet(`/v2/blockchain/messages/${msgHash}/transaction`);
  if (txRes.status === 404 || !txRes.ok) {
    return { ok: false, reason: "Tx not yet on-chain", retriable: true };
  }
  const tx = txRes.json as { hash?: string; success?: boolean };
  if (tx.success === false) return { ok: false, reason: "Tx failed on-chain", retriable: false };
  const txHash = typeof tx.hash === "string" && tx.hash ? tx.hash : msgHash;

  const eventsRes = await tonapiGet(
    `/v2/accounts/${encodeURIComponent(opts.buyerWallet)}/events?limit=20`,
  );
  if (!eventsRes.ok || !eventsRes.json || typeof eventsRes.json !== "object") {
    return { ok: false, reason: "Events not ready", retriable: true };
  }
  const payload = eventsRes.json as { events?: TonApiEvent[] };
  const events = Array.isArray(payload.events) ? payload.events : [];
  const masterRaw = toRawAddress(zmcJettonMaster());
  const sellerRaw = toRawAddress(opts.sellerWallet);
  const treasuryRaw = toRawAddress(treasuryWallet());

  let sawSeller = false;
  let sawTreasury = false;
  for (const ev of events) {
    for (const action of ev.actions ?? []) {
      if (action.type !== "JettonTransfer") continue;
      if (action.status && action.status !== "ok") continue;
      const jt = action.JettonTransfer;
      if (!jt) continue;
      const jettonAddr = jt.jetton?.address;
      if (jettonAddr) {
        try {
          if (toRawAddress(jettonAddr) !== masterRaw) continue;
        } catch {
          continue;
        }
      }
      const amount = parseJettonNano(jt.amount);
      const dest = jt.recipient?.address;
      if (!dest) continue;
      let destRaw: string;
      try {
        destRaw = toRawAddress(dest);
      } catch {
        continue;
      }
      if (destRaw === sellerRaw && amount === opts.sellerNano) sawSeller = true;
      if (destRaw === treasuryRaw && amount === opts.feeNano) sawTreasury = true;
    }
    if (sawSeller && sawTreasury) break;
  }

  if (!sawSeller || !sawTreasury) {
    return { ok: false, reason: "Jetton split not found on-chain yet", retriable: true };
  }

  return { ok: true, txHash, feeHuman: zmcNanoToHuman(opts.feeNano) };
}
