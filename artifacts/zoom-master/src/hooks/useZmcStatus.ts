import { useEffect, useState } from "react";
import { useTonAddress } from "@tonconnect/ui-react";
import { parseVipLevel, type VipLevel } from "@workspace/game-models";
import { fetchZmcStatus, syncZmcWallet, type ZmcStatus } from "../utils/api";

const EMPTY: ZmcStatus = {
  ok: true,
  vipLevel: "NONE",
  zmcBalance: 0,
  zmcBalanceNano: "0",
  walletAddress: null,
  airdrop: {
    zoomPoints: 0,
    totalGlobalZoomPoints: 0,
    treasuryZmc: 0,
    totalAirdropPool: 0,
    estimatedAirdropZmc: 0,
  },
};

export function useZmcStatus(telegramId: string | null): ZmcStatus & { connected: boolean; vipLevel: VipLevel } {
  const address = useTonAddress();
  const [status, setStatus] = useState<ZmcStatus>(EMPTY);

  useEffect(() => {
    if (!telegramId) return;
    let cancelled = false;
    const run = async () => {
      if (address) {
        const synced = await syncZmcWallet(telegramId, address);
        if (!cancelled && synced) setStatus(synced);
        return;
      }
      const cached = await fetchZmcStatus(telegramId);
      if (!cancelled && cached) setStatus(cached);
    };
    void run();
    const id = window.setInterval(() => { void run(); }, 45_000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [telegramId, address]);

  return {
    ...status,
    vipLevel: parseVipLevel(status.vipLevel),
    connected: !!address,
  };
}
