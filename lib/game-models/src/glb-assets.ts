/**
 * Optional HD GLB models per shape. Drop files in `public/models/{name}.glb`
 * (generated via Meshy, Tripo, Rodin, etc.) — showcase view loads these when present.
 */
export const SHAPE_GLB_ASSETS: Partial<Record<string, string>> = {
  minifig: "/models/minifig.glb",
  cat: "/models/cat.glb",
  burger: "/models/burger.glb",
  dog: "/models/dog.glb",
  donut: "/models/donut.glb",
  mug: "/models/mug.glb",
  wine: "/models/wine.glb",
  pizza: "/models/pizza.glb",
  flower: "/models/flower.glb",
  dollar: "/models/dollar.glb",
  creeper: "/models/creeper.glb",
  chest: "/models/chest.glb",
  stardust_pot: "/models/stardust_pot.glb",
  onigiri: "/models/onigiri.glb",
  street_scene: "/models/onigiri.glb",
  island_home: "/models/island_home.glb",
  steve: "/models/steve.glb",
  chicken: "/models/chicken.glb",
  honey: "/models/honey.glb",
  horsea: "/models/horsea.glb",
  sushi: "/models/lab_sushi.glb",
  lab_house: "/models/house.glb",
  slime: "/models/slime.glb",
  lab_pokeball: "/models/pokeball.glb",
  dodge: "/models/dodge.glb",
  ak47: "/models/ak47.glb",
  lab_laptop: "/models/laptop.glb",
  evenano: "/models/evenano.glb",
  capybara: "/models/capybara.glb",
  question_block: "/models/question_block.glb",
  marlboro: "/models/marlboro.glb",
  psp: "/models/psp.glb",
  space_farm: "/models/space_farm.glb",
  bob_omb: "/models/bob_omb.glb",
  among_us: "/models/among_us.glb",
  avocado: "/models/avocado.glb",
  gameboy: "/models/gameboy.glb",
  fruit_art: "/models/fruit_art.glb",
};

/** Bust stale CDN / Telegram cache when Lab GLB assets are replaced. */
const LAB_GLB_CACHE_BUST = "20260901a";

const LAB_GLB_SHAPE_IDS = new Set([
  "pizza",
  "flower",
  "dollar",
  "creeper",
  "chest",
  "stardust_pot",
  "onigiri",
  "street_scene",
  "island_home",
  "steve",
  "chicken",
  "honey",
  "horsea",
  "sushi",
  "lab_house",
  "slime",
  "lab_pokeball",
  "dodge",
  "ak47",
  "lab_laptop",
  "evenano",
  "capybara",
  "question_block",
  "marlboro",
  "psp",
  "space_farm",
  "bob_omb",
  "among_us",
  "avocado",
  "gameboy",
  "fruit_art",
]);

export function getShapeGlbUrl(shapeId: string): string | null {
  const path = SHAPE_GLB_ASSETS[shapeId];
  if (!path) return null;
  if (LAB_GLB_SHAPE_IDS.has(shapeId)) {
    return `${path}?v=${LAB_GLB_CACHE_BUST}`;
  }
  return path;
}
