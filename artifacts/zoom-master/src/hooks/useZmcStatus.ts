import { useEffect, useState } from "react";
import { useTonAddress } from "@tonconnect/ui-react";
import { isVipProPassActive, parseVipLevel, type VipLevel } from "@workspace/game-models";
import {
  fetchZmcStatus,
  syncZmcWallet,
  ZMC_STATUS_REFRESH_EVENT,
  ZMC_WALLET_CLEARED_EVENT,
  type ZmcStatus,
} from "../utils/api";
import { FARM_HOLD_ZMC, setFarmHoldOk } from "../utils/farmHold";

const EMPTY: ZmcStatus = {
  ok: true,
  vipLevel: "NONE",
  zmcBalance: 0,
  zmcBalanceNano: "0",
  walletAddress: null,
  vipProPassUntilMs: 0,
  vipProPassActive: false,
  airdrop: {
    zoomPoints: 0,
    totalGlobalZoomPoints: 0,
    treasuryZmc: 0,
    totalAirdropPool: 0,
    estimatedAirdropZmc: 0,
  },
};

export function useZmcStatus(telegramId: string | null): ZmcStatus & {
  connected: boolean;
  vipLevel: VipLevel;
  vipProPassActive: boolean;
} {
  const address = useTonAddress();
  const [status, setStatus] = useState<ZmcStatus>(EMPTY);

  useEffect(() => {
    if (!telegramId) return;
    let cancelled = false;
    const run = async () => {
      if (address) {
        const synced = await syncZmcWallet(telegramId, address);
        if (!cancelled && synced) {
          setFarmHoldOk((synced.zmcBalance ?? 0) >= FARM_HOLD_ZMC);
          setStatus(synced);
        }
        return;
      }
      const cached = await fetchZmcStatus(telegramId);
      if (!cancelled && cached) {
        setFarmHoldOk((cached.zmcBalance ?? 0) >= FARM_HOLD_ZMC);
        setStatus(cached);
      }
    };
    void run();
    const id = window.setInterval(() => { void run(); }, 45_000);
    const onRefresh = () => { void run(); };
    window.addEventListener(ZMC_STATUS_REFRESH_EVENT, onRefresh);
    return () => {
      cancelled = true;
      window.clearInterval(id);
      window.removeEventListener(ZMC_STATUS_REFRESH_EVENT, onRefresh);
    };
  }, [telegramId, address]);

  useEffect(() => {
    const onCleared = () => {
      if (!telegramId) {
        setFarmHoldOk(false);
        setStatus(EMPTY);
        return;
      }
      void fetchZmcStatus(telegramId).then((cached) => {
        setFarmHoldOk((cached?.zmcBalance ?? 0) >= FARM_HOLD_ZMC);
        setStatus(cached ?? EMPTY);
      });
    };
    window.addEventListener(ZMC_WALLET_CLEARED_EVENT, onCleared);
    return () => window.removeEventListener(ZMC_WALLET_CLEARED_EVENT, onCleared);
  }, [telegramId]);

  const until = Number(status.vipProPassUntilMs) || 0;
  return {
    ...status,
    vipLevel: parseVipLevel(status.vipLevel),
    vipProPassUntilMs: until,
    vipProPassActive: isVipProPassActive(until),
    connected: !!address,
  };
}
