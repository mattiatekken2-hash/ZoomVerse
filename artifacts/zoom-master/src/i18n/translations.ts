export type Lang = "en" | "ru" | "uk";

export const LANGS: { code: Lang; flag: string; label: string }[] = [
  { code: "en", flag: "🇬🇧", label: "English" },
  { code: "ru", flag: "🇷🇺", label: "Русский" },
  { code: "uk", flag: "🇺🇦", label: "Українська" },
];

type Dict = Record<string, string>;

const en: Dict = {
  // nav
  "nav.lab": "LAB",
  "nav.farm": "FARM",
  "nav.market": "MARKET",
  "nav.wheel": "WHEEL",
  "nav.earn": "EARN",
  "nav.rank": "RANK",
  "nav.arcade": "ARCADE",

  // header
  "header.perHour": "/hr",

  // maintenance
  "maint.title": "UNDER MAINTENANCE",
  "maint.default": "We're upgrading the game. Back online shortly.",
  "maint.paused": "GAME PAUSED",
  "maint.banner": "MAINTENANCE MODE ACTIVE — only you can see the app",

  // lab
  "lab.farmFull": "FARM FULL",
  "lab.farmFullHint": "Burn or sell a planet to continue",
  "lab.noZoom": "NO $ZOOM",
  "lab.forgePlanet": "FORGE PLANET",
  "lab.perTap": "1 $ZOOM per tap",
  "lab.slotsFree": "{n} slots free",

  // farm
  "farm.collect": "COLLECT",
  "farm.burn": "BURN",
  "farm.startFarming": "START FARMING",
  "farm.stopFarming": "STOP FARMING",
  "farm.readyToCollect": "READY TO COLLECT",
  "farm.activatePlanet": "ACTIVATE",
  "farm.farming": "FARMING",
  "farm.empty": "No planets yet — go to LAB to forge one",

  // market
  "market.buy": "BUY",
  "market.list": "LIST FOR SALE",
  "market.unlist": "UNLIST",
  "market.empty": "No listings available",
  "market.processing": "Processing…",

  // common
  "common.close": "Close",
  "common.confirm": "Confirm",
  "common.cancel": "Cancel",
  "common.loading": "Loading…",
  "common.language": "Language",
  "common.slotsFull": "Slots full",
};

const ru: Dict = {
  "nav.lab": "ЛАБ",
  "nav.farm": "ФЕРМА",
  "nav.market": "РЫНОК",
  "nav.wheel": "КОЛЕСО",
  "nav.earn": "БОНУС",
  "nav.rank": "РЕЙТИНГ",
  "nav.arcade": "АРКАДА",

  "header.perHour": "/час",

  "maint.title": "ТЕХНИЧЕСКИЕ РАБОТЫ",
  "maint.default": "Мы обновляем игру. Скоро вернёмся.",
  "maint.paused": "ИГРА ПРИОСТАНОВЛЕНА",
  "maint.banner": "РЕЖИМ ОБСЛУЖИВАНИЯ — приложение видно только вам",

  "lab.farmFull": "ФЕРМА ПОЛНА",
  "lab.farmFullHint": "Сожгите или продайте планету, чтобы продолжить",
  "lab.noZoom": "НЕТ $ZOOM",
  "lab.forgePlanet": "СОЗДАТЬ ПЛАНЕТУ",
  "lab.perTap": "1 $ZOOM за тап",
  "lab.slotsFree": "{n} свободно",

  "farm.collect": "СОБРАТЬ",
  "farm.burn": "СЖЕЧЬ",
  "farm.startFarming": "НАЧАТЬ ФАРМ",
  "farm.stopFarming": "ОСТАНОВИТЬ",
  "farm.readyToCollect": "ГОТОВО К СБОРУ",
  "farm.activatePlanet": "АКТИВИРОВАТЬ",
  "farm.farming": "ФАРМИТ",
  "farm.empty": "Нет планет — зайдите в ЛАБ, чтобы создать",

  "market.buy": "КУПИТЬ",
  "market.list": "ВЫСТАВИТЬ",
  "market.unlist": "СНЯТЬ",
  "market.empty": "Нет доступных лотов",
  "market.processing": "Обработка…",

  "common.close": "Закрыть",
  "common.confirm": "Подтвердить",
  "common.cancel": "Отмена",
  "common.loading": "Загрузка…",
  "common.language": "Язык",
  "common.slotsFull": "Слоты заполнены",
};

const uk: Dict = {
  "nav.lab": "ЛАБ",
  "nav.farm": "ФЕРМА",
  "nav.market": "РИНОК",
  "nav.wheel": "КОЛЕСО",
  "nav.earn": "БОНУС",
  "nav.rank": "РЕЙТИНГ",
  "nav.arcade": "АРКАДА",

  "header.perHour": "/год",

  "maint.title": "ТЕХНІЧНІ РОБОТИ",
  "maint.default": "Ми оновлюємо гру. Скоро повернемось.",
  "maint.paused": "ГРА НА ПАУЗІ",
  "maint.banner": "РЕЖИМ ОБСЛУГОВУВАННЯ — застосунок бачите лише ви",

  "lab.farmFull": "ФЕРМА ЗАПОВНЕНА",
  "lab.farmFullHint": "Спаліть або продайте планету, щоб продовжити",
  "lab.noZoom": "НЕМАЄ $ZOOM",
  "lab.forgePlanet": "СТВОРИТИ ПЛАНЕТУ",
  "lab.perTap": "1 $ZOOM за тап",
  "lab.slotsFree": "{n} вільно",

  "farm.collect": "ЗІБРАТИ",
  "farm.burn": "СПАЛИТИ",
  "farm.startFarming": "ПОЧАТИ ФАРМ",
  "farm.stopFarming": "ЗУПИНИТИ",
  "farm.readyToCollect": "ГОТОВО ДО ЗБОРУ",
  "farm.activatePlanet": "АКТИВУВАТИ",
  "farm.farming": "ФАРМИТЬ",
  "farm.empty": "Немає планет — зайдіть в ЛАБ, щоб створити",

  "market.buy": "КУПИТИ",
  "market.list": "ВИСТАВИТИ",
  "market.unlist": "ЗНЯТИ",
  "market.empty": "Немає доступних лотів",
  "market.processing": "Обробка…",

  "common.close": "Закрити",
  "common.confirm": "Підтвердити",
  "common.cancel": "Скасувати",
  "common.loading": "Завантаження…",
  "common.language": "Мова",
  "common.slotsFull": "Слоти заповнені",
};

export const DICTS: Record<Lang, Dict> = { en, ru, uk };

export function translate(lang: Lang, key: string, vars?: Record<string, string | number>): string {
  const dict = DICTS[lang] || DICTS.en;
  let str = dict[key] ?? DICTS.en[key] ?? key;
  if (vars) {
    for (const [k, v] of Object.entries(vars)) {
      str = str.replace(new RegExp(`\\{${k}\\}`, "g"), String(v));
    }
  }
  return str;
}
