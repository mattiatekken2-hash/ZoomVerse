import { FARM_HOLD_ZMC, hasFarmHold } from "@workspace/game-models";

/** Client HUD gate. Default false so we never tick yield before the first ZMC read. */
let farmHoldOk = false;

export function setFarmHoldOk(ok: boolean): void {
  farmHoldOk = ok === true;
}

export function getFarmHoldOk(): boolean {
  return farmHoldOk;
}

export { FARM_HOLD_ZMC, hasFarmHold };
