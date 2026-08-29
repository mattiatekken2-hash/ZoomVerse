/**
 * Official on-chain $ZMC (Zoom) jetton on TON — DexScreener + STON.fi.
 * Supply: 100M minted · 20M locked in the DEX pool · 4M in treasury for TGE.
 * Off-chain ZOOM Points (`zoom_balance`) only size each player's share of
 * that 4M airdrop. $ZMC is P2P Market, VIP holding, and treasury fees.
 */
export const ZMC_NAME = "Zoom";
export const ZMC_TICKER = "ZMC";
export const ZMC_JETTON_ADDRESS = "EQCh6o6l436wdLr7kbR5uBR7eXUGVN0CCJ8MESMgFzGo5Kau";

export const ZMC_DEXSCREENER_EMBED =
  `https://dexscreener.com/ton/${ZMC_JETTON_ADDRESS}?embed=1&theme=dark&trades=0`;

/** TON → $ZMC on STON.fi */
export const ZMC_STONFI_BUY =
  `https://app.ston.fi/swap?chartVisible=false&ft=TON&tt=${ZMC_JETTON_ADDRESS}`;

/** $ZMC → TON on STON.fi (same pair, reversed) */
export const ZMC_STONFI_SELL =
  `https://app.ston.fi/swap?chartVisible=false&ft=${ZMC_JETTON_ADDRESS}&tt=TON`;

export function formatZmcAmount(n: number): string {
  const v = Number.isFinite(n) ? n : 0;
  if (v <= 0) return "0";
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(2)}M`;
  if (v >= 10_000) return `${(v / 1_000).toFixed(1)}K`;
  if (v >= 100) return Math.floor(v).toLocaleString();
  return v.toLocaleString(undefined, { maximumFractionDigits: 2 });
}

export function openExternalUrl(url: string) {
  try {
    const tg = (window as unknown as {
      Telegram?: { WebApp?: { openTelegramLink?: (u: string) => void; openLink?: (u: string) => void } };
    }).Telegram?.WebApp;
    if (tg?.openTelegramLink && url.startsWith("https://t.me/")) {
      tg.openTelegramLink(url);
      return;
    }
    if (tg?.openLink) {
      tg.openLink(url);
      return;
    }
  } catch { /**/ }
  window.open(url, "_blank", "noopener,noreferrer");
}

export async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch { /**/ }
  try {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.setAttribute("readonly", "");
    ta.style.position = "fixed";
    ta.style.left = "-9999px";
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
}
