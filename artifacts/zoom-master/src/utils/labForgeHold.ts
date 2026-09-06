/** Keep in sync with LAB_FORGE_HOLD_ZMC in lib/game-models/src/zmc-economy.ts */
export const LAB_FORGE_HOLD_ZMC = 1_000;

let labForgeHoldOk = false;

export function hasLabForgeHold(zmcHuman: number, hasWallet: boolean): boolean {
  return hasWallet === true && Number.isFinite(zmcHuman) && zmcHuman >= LAB_FORGE_HOLD_ZMC;
}

export function setLabForgeHoldOk(ok: boolean): void {
  labForgeHoldOk = ok === true;
}

export function getLabForgeHoldOk(): boolean {
  return labForgeHoldOk;
}
