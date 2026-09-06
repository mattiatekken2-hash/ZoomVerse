/**
 * Farm yield gate. Keep this number in sync with FARM_HOLD_ZMC in
 * lib/game-models/src/zmc-economy.ts (API). Defined here so Vite does
 * not depend on a star-re-export from @workspace/game-models.
 */
export const FARM_HOLD_ZMC = 1_000;

let farmHoldOk = false;

export function hasFarmHold(zmcHuman: number): boolean {
  return Number.isFinite(zmcHuman) && zmcHuman >= FARM_HOLD_ZMC;
}

export function setFarmHoldOk(ok: boolean): void {
  farmHoldOk = ok === true;
}

export function getFarmHoldOk(): boolean {
  return farmHoldOk;
}
