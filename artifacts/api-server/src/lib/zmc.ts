import { Address, beginCell, toNano, Cell, internal, SendMode } from "@ton/core";
import { mnemonicToWalletKey } from "@ton/crypto";
import {
  JettonMaster,
  TonClient,
  WalletContractV3R2,
  WalletContractV4,
  WalletContractV5R1,
} from "@ton/ton";
import {
  ZMC_JETTON_ADDRESS,
  TREASURY_WALLET_ADDRESS,
  parseJettonNano,
  vipLevelFromNano,
  zmcHumanToNano,
  zmcNanoToHuman,
  type VipLevel,
} from "@workspace/game-models";
import { logger } from "./logger";

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

/**
 * Confirms a single $ZMC jetton transfer from the buyer wallet to treasury
 * (shop ZOOM packs — 100% sink, no seller split).
 */
export async function verifyZmcTreasuryTransfer(opts: {
  boc: string;
  buyerWallet: string;
  amountNano: bigint;
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
  const treasuryRaw = toRawAddress(treasuryWallet());

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
      if (destRaw === treasuryRaw && amount === opts.amountNano) {
        sawTreasury = true;
        break;
      }
    }
    if (sawTreasury) break;
  }

  if (!sawTreasury) {
    return { ok: false, reason: "Treasury ZMC transfer not found on-chain yet", retriable: true };
  }

  return { ok: true, txHash, feeHuman: zmcNanoToHuman(opts.amountNano) };
}

function treasuryMnemonicWords(): string[] | null {
  const raw = (process.env["TREASURY_MNEMONIC"] || "").trim();
  if (!raw) return null;
  const words = raw.split(/\s+/);
  if (words.length !== 12 && words.length !== 24) return null;
  return words;
}

export function hasTreasurySigner(): boolean {
  return treasuryMnemonicWords() != null;
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function tonClient(): TonClient {
  return new TonClient({
    endpoint: process.env["TONCENTER_ENDPOINT"] || "https://toncenter.com/api/v2/jsonRPC",
    apiKey: process.env["TONCENTER_API_KEY"] || undefined,
  });
}

type TreasuryWalletContract = WalletContractV5R1 | WalletContractV4 | WalletContractV3R2;

function walletMatchingTreasury(publicKey: Buffer): TreasuryWalletContract {
  const expected = Address.parse(treasuryWallet());
  const candidates: TreasuryWalletContract[] = [
    WalletContractV5R1.create({ publicKey }),
    WalletContractV4.create({ workchain: 0, publicKey }),
    WalletContractV3R2.create({ workchain: 0, publicKey }),
  ];
  const match = candidates.find((w) => w.address.equals(expected));
  if (!match) {
    throw new Error("TREASURY_MNEMONIC does not match TREASURY_WALLET_ADDRESS");
  }
  return match;
}

let sendQueue: Promise<unknown> = Promise.resolve();

function enqueueTreasurySend<T>(fn: () => Promise<T>): Promise<T> {
  const run = sendQueue.then(fn, fn);
  sendQueue = run.then(() => undefined, () => undefined);
  return run;
}

export interface SendZmcResult {
  ok: boolean;
  txHash?: string;
  reason?: string;
}

/**
 * Sends on-chain $ZMC from the platform treasury to `to`.
 * Requires TREASURY_MNEMONIC on the API host (Render). Sequential via a
 * process-local queue so seqno cannot collide.
 */
export async function sendZmcFromTreasury(
  to: string,
  amountHuman: number,
  opts?: { waitSeqno?: boolean },
): Promise<SendZmcResult> {
  const words = treasuryMnemonicWords();
  if (!words) return { ok: false, reason: "TREASURY_MNEMONIC not set" };
  const amountNano = zmcHumanToNano(amountHuman);
  if (amountNano <= 0n) return { ok: false, reason: "Invalid amount" };
  const waitSeqno = opts?.waitSeqno !== false;

  let dest: Address;
  try {
    dest = Address.parse(to);
  } catch {
    return { ok: false, reason: "Invalid destination wallet" };
  }

  return enqueueTreasurySend(async () => {
    try {
      const key = await mnemonicToWalletKey(words);
      const wallet = walletMatchingTreasury(key.publicKey);
      const client = tonClient();
      const opened = client.open(wallet);
      const master = client.open(JettonMaster.create(Address.parse(zmcJettonMaster())));
      const jettonWallet = await master.getWalletAddress(Address.parse(treasuryWallet()));
      const payload = buildJettonTransferPayload({
        to: dest.toString({ bounceable: true, urlSafe: true }),
        amountNano,
        response: treasuryWallet(),
        queryId: BigInt(Date.now()),
      });
      const seqno = await opened.getSeqno();
      await opened.sendTransfer({
        seqno,
        secretKey: key.secretKey,
        messages: [
          internal({
            to: jettonWallet,
            value: toNano("0.06"),
            bounce: true,
            body: Cell.fromBase64(payload),
          }),
        ],
        sendMode: SendMode.PAY_GAS_SEPARATELY,
      });
      if (!waitSeqno) {
        return { ok: true, txHash: `zmc-send:${seqno}:queued` };
      }
      const started = Date.now();
      while (Date.now() - started < 45_000) {
        await sleep(1_400);
        const next = await opened.getSeqno();
        if (next > seqno) {
          return { ok: true, txHash: `zmc-send:${seqno}:${next}` };
        }
      }
      return { ok: false, reason: "Seqno timeout after send" };
    } catch (err) {
      logger.warn({ err, to, amountHuman }, "[zmc] treasury send failed");
      return { ok: false, reason: err instanceof Error ? err.message : "Send failed" };
    }
  });
}
