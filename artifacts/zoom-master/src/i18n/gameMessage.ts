import { translate, type Lang } from "./translations";

let currentLang: Lang = "en";

export function setI18nLang(lang: Lang) {
  currentLang = lang;
}

export function getI18nLang(): Lang {
  return currentLang;
}

/** Maps raw English reason/toast strings from game logic to translation keys. */
const REASON_KEY_MAP: Record<string, string> = {
  "Slots full": "common.slotsFull",
  "Nothing to claim": "game.nothingToClaim",
  "Code already used": "game.codeAlreadyUsed",
  "You already own THE SUN": "game.alreadyOwnSun",
  "Invalid code": "game.invalidCode",
  "SUN not owned": "game.sunNotOwned",
  "Need 1 ★ Redstar to reactivate SUN": "game.needRedstarSun",
  "Need 1 ★ Redstar to reactivate": "game.needRedstarReactivate",
  "Planet unavailable": "game.planetUnavailable",
  "Planet not found": "game.planetNotFound",
  "Already at full durability": "game.alreadyFullDurability",
  "No free slots available": "market.noSlots",
  "TON deposit insufficient": "game.tonDepositInsufficient",
  "Cannot buy your own listing": "game.cannotBuyOwnListing",
  "Already placed": "game.alreadyPlaced",
  "Invalid slot": "game.invalidSlot",
  "Slot occupied": "game.slotOccupied",
  "Planet not placed": "game.planetNotPlaced",
  "Not logged in": "game.notLoggedIn",
  "Cycle still active": "game.cycleStillActive",
  "Craft failed": "game.craftFailed",
  "Item is listed on the market": "game.itemListed",
  "Not forging": "game.notForging",
  "Cannot skip now": "game.cannotSkipNow",
  "Need 1 ★ Stardust to skip": "game.needStardustSkip",
  "Repair failed": "game.repairFailed",
  "Cannot start farming": "game.cannotStartFarming",
  "Upgrade failed": "game.upgradeFailed",
  "Reactivation failed": "game.reactivationFailed",
  "Cannot place planet": "game.cannotPlacePlanet",
  "Cannot place star": "game.cannotPlaceStar",
  "Listing rejected": "game.listingRejected",
  "The server refused to list this planet.": "game.listingRejectedPlanet",
  "The server refused to list this item.": "game.listingRejectedItem",
  "Insufficient balance: need 50% deposit + 50% earned": "market.insufficientBalance",
  "Payment failed": "shop.paymentFailed",
  "Payment cancelled": "shop.paymentCancelled",
  "Payment error": "shop.paymentError",
  "Purchase failed": "shop.purchaseFailed",
  "This planet is not eligible for PvP": "pvp.battle.error.notEligible",
  "BATTLE_CANCELLED": "pvp.battle.error.cancelled",
  "NOT_ELIGIBLE": "pvp.battle.error.notEligible",
  "Failed": "pvp.battle.failed",
};

const REASON_PATTERNS: { re: RegExp; key: string; vars?: string[] }[] = [
  { re: /^Need (\d[\d,]*) ⭐ Stardust to repair$/, key: "game.needStardustRepair", vars: ["n"] },
  { re: /^Need (\d[\d,]*) \$ZOOM to reactivate$/, key: "game.needZoomReactivate", vars: ["n"] },
  { re: /^Need (\d+) idle (.+) planets$/, key: "game.needIdlePlanets", vars: ["n", "kind"] },
  { re: /^Free up a slot to receive your bonus: (.+)$/, key: "game.slotsFullBonus", vars: ["items"] },
  { re: /^Insufficient STARDUST \(need ([\d,]+)/, key: "shop.insufficientStardustLong", vars: ["n"] },
  { re: /^Need ([\d,]+) stardust \(have ([\d,]+)\)$/, key: "shop.needStardustHave", vars: ["need", "have"] },
];

const API_ERROR_KEY_MAP: Record<string, string> = {
  TG_AUTH_REQUIRED: "api.error.tgAuthRequired",
  TG_USER_MISMATCH: "api.error.tgUserMismatch",
  SERVER_ERROR: "api.error.serverError",
  NOT_ENOUGH_STARDUST: "shop.notEnoughStardust",
  ALREADY_OWNED: "shop.alreadyOwned",
};

/**
 * Translate a raw game/server message for display. Falls back to the original
 * string when no mapping exists.
 */
export function translateGameMessage(lang: Lang, text: string): string {
  if (!text) return text;
  const trimmed = text.trim();
  const direct = REASON_KEY_MAP[trimmed];
  if (direct) return translate(lang, direct);

  for (const { re, key, vars } of REASON_PATTERNS) {
    const m = trimmed.match(re);
    if (!m) continue;
    const record: Record<string, string | number> = {};
    vars?.forEach((name, i) => {
      record[name] = m[i + 1]?.replace(/,/g, "") ?? "";
    });
    return translate(lang, key, record);
  }

  const apiKey = API_ERROR_KEY_MAP[trimmed];
  if (apiKey) return translate(lang, apiKey);

  return trimmed;
}

/** Map HTTP/API JSON errors to localized strings. */
export function translateApiError(
  lang: Lang,
  data: unknown,
  httpStatus: number,
  fallbackKey: string,
): string {
  if (data && typeof data === "object") {
    const d = data as Record<string, unknown>;
    if (typeof d.error === "string" && d.error) {
      const mapped = API_ERROR_KEY_MAP[d.error];
      if (mapped) return translate(lang, mapped);
      return translateGameMessage(lang, d.error);
    }
    if (typeof d.reason === "string" && d.reason) {
      return translateGameMessage(lang, d.reason);
    }
  }
  if (httpStatus === 404) return translate(lang, "api.error.notFound");
  if (httpStatus === 401 || httpStatus === 403) return translate(lang, "api.error.unauthorized");
  if (httpStatus === 503) return translate(lang, "api.error.maintenance");
  return translate(lang, fallbackKey, { status: httpStatus });
}

/** API error helper using the active UI language (set by LanguageProvider). */
export function tApiError(data: unknown, httpStatus: number, fallbackKey: string): string {
  return translateApiError(currentLang, data, httpStatus, fallbackKey);
}
