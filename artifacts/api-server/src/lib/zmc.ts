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

/** Lab airdrop hold: distinguish a real 0 from TonAPI being down (do not reset the timer). */
export async function readZmcHoldBalance(
  owner: string,
): Promise<{ known: true; human: number } | { known: false }> {
  const master = encodeURIComponent(zmcJettonMaster());
  const account = encodeURIComponent(owner);
  try {
    const r = await tonapiGet(`/v2/accounts/${account}/jettons/${master}`);
    if (r.status === 404) return { known: true, human: 0 };
    if (!r.ok || !r.json || typeof r.json !== "object") return { known: false };
    const data = r.json as {
      balance?: string;
      wallet_address?: { address?: string };
    };
    if (!data.wallet_address?.address) return { known: false };
    return { known: true, human: zmcNanoToHuman(parseJettonNano(data.balance)) };
  } catch {
    return { known: false };
  }
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

interface TonApiOutMsg {
  decoded_op_name?: string;
  raw_body?: string;
  decoded_body?: {
    amount?: string | number;
    destination?: string | { address?: string };
  };
}

interface JettonOut {
  destRaw: string;
  amount: bigint;
}

function normalizeHex(h: string): string {
  return h.replace(/^0x/i, "").toLowerCase();
}

function destFromDecoded(body: TonApiOutMsg["decoded_body"]): string | null {
  if (!body) return null;
  const d = body.destination;
  if (typeof d === "string" && d) return d;
  if (d && typeof d === "object" && typeof d.address === "string") return d.address;
  return null;
}

function parseJettonTransferRaw(raw: string): JettonOut | null {
  try {
    const trimmed = raw.trim();
    const cell = /^[0-9a-fA-F]+$/.test(trimmed)
      ? Cell.fromBoc(Buffer.from(trimmed, "hex"))[0]
      : Cell.fromBase64(trimmed);
    if (!cell) return null;
    const s = cell.beginParse();
    if (s.loadUint(32) !== JETTON_TRANSFER_OPCODE) return null;
    s.loadUintBig(64);
    const amount = s.loadCoins();
    const dest = s.loadAddress();
    if (!dest) return null;
    return { amount, destRaw: dest.toRawString().toLowerCase() };
  } catch {
    return null;
  }
}

function transfersFromOutMsgs(tx: { out_msgs?: TonApiOutMsg[] }): JettonOut[] {
  const out: JettonOut[] = [];
  for (const msg of tx.out_msgs ?? []) {
    const op = (msg.decoded_op_name || "").toLowerCase().replace(/_/g, "");
    if (op === "jettontransfer") {
      const dest = destFromDecoded(msg.decoded_body);
      if (dest) {
        try {
          out.push({
            destRaw: toRawAddress(dest),
            amount: parseJettonNano(msg.decoded_body?.amount),
          });
          continue;
        } catch {
          /* fall through to raw_body */
        }
      }
    }
    if (typeof msg.raw_body === "string" && msg.raw_body) {
      const parsed = parseJettonTransferRaw(msg.raw_body);
      if (parsed) out.push(parsed);
    }
  }
  return out;
}

function transfersFromEvents(events: TonApiEvent[], masterRaw: string): JettonOut[] {
  const out: JettonOut[] = [];
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
      const dest = jt.recipient?.address;
      if (!dest) continue;
      try {
        out.push({ destRaw: toRawAddress(dest), amount: parseJettonNano(jt.amount) });
      } catch {
        continue;
      }
    }
  }
  return out;
}

/**
 * Prefer the wallet tx's own out_msgs (present as soon as the signed Boc
 * lands) and the matching TonAPI event. Never mix jetton actions from
 * unrelated older events of similar amounts.
 */
async function loadJettonTransfersForTx(opts: {
  txHash: string;
  buyerWallet: string;
}): Promise<JettonOut[]> {
  const found: JettonOut[] = [];
  const ids = new Set<string>([opts.txHash]);
  const chainTx = await tonapiGet(`/v2/blockchain/transactions/${encodeURIComponent(opts.txHash)}`);
  if (chainTx.ok && chainTx.json && typeof chainTx.json === "object") {
    const txJson = chainTx.json as {
      in_msg?: { hash?: string };
      trace_id?: string;
      out_msgs?: TonApiOutMsg[];
    };
    found.push(...transfersFromOutMsgs(txJson));
    if (txJson.in_msg?.hash) ids.add(txJson.in_msg.hash);
    if (txJson.trace_id) ids.add(txJson.trace_id);
    if (txJson.trace_id) {
      const traceRes = await tonapiGet(`/v2/traces/${encodeURIComponent(txJson.trace_id)}`);
      if (traceRes.ok && traceRes.json && typeof traceRes.json === "object") {
        const trace = traceRes.json as { transactions?: Array<{ out_msgs?: TonApiOutMsg[] }> };
        for (const t of trace.transactions ?? []) {
          found.push(...transfersFromOutMsgs(t));
        }
      }
    }
  }

  const events: TonApiEvent[] = [];
  for (const id of ids) {
    const eventRes = await tonapiGet(`/v2/events/${encodeURIComponent(id)}`);
    if (eventRes.ok && eventRes.json && typeof eventRes.json === "object") {
      const ev = eventRes.json as TonApiEvent & { events?: TonApiEvent[] };
      if (Array.isArray(ev.events)) events.push(...ev.events);
      else if (Array.isArray(ev.actions)) events.push(ev);
    }
  }

  if (events.length === 0) {
    const listRes = await tonapiGet(
      `/v2/accounts/${encodeURIComponent(opts.buyerWallet)}/events?limit=50`,
    );
    if (listRes.ok && listRes.json && typeof listRes.json === "object") {
      const payload = listRes.json as { events?: TonApiEvent[] };
      const all = Array.isArray(payload.events) ? payload.events : [];
      const want = [...ids].map(normalizeHex);
      events.push(...all.filter((e) => {
        const id = normalizeHex(e.event_id || "");
        return want.some((h) => id === h || id.endsWith(h) || h.endsWith(id));
      }));
    }
  }

  const masterRaw = toRawAddress(zmcJettonMaster());
  found.push(...transfersFromEvents(events, masterRaw));
  return found;
}

function hasJettonOut(transfers: JettonOut[], destRaw: string, amount: bigint): boolean {
  return transfers.some((t) => t.destRaw === destRaw && t.amount === amount);
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
  const sellerRaw = toRawAddress(opts.sellerWallet);
  const treasuryRaw = toRawAddress(treasuryWallet());
  const transfers = await loadJettonTransfersForTx({ txHash, buyerWallet: opts.buyerWallet });
  const sawSeller = hasJettonOut(transfers, sellerRaw, opts.sellerNano);
  const sawTreasury = hasJettonOut(transfers, treasuryRaw, opts.feeNano);
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
  const treasuryRaw = toRawAddress(treasuryWallet());
  const transfers = await loadJettonTransfersForTx({ txHash, buyerWallet: opts.buyerWallet });
  if (!hasJettonOut(transfers, treasuryRaw, opts.amountNano)) {
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
