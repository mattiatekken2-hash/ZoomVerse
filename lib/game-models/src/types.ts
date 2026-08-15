export const MODEL_CATEGORIES = [
  "vehicle",
  "animal",
  "food",
  "daily",
  "character",
  "military",
  "block",
  "gadget",
  "planet",
] as const;

export type ModelCategory = (typeof MODEL_CATEGORIES)[number];

export const MODEL_RARITIES = [
  "BASIC",
  "RARE",
  "EPIC",
  "MYTHIC",
  "GOLD",
  "LEGEND",
] as const;

export type ModelRarity = (typeof MODEL_RARITIES)[number];

export interface ModelDefinition {
  id: string;
  name: string;
  category: ModelCategory;
  rarity: ModelRarity;
  rate: number;
  poolWeight: number;
  hintPercent: number;
  primaryColor: string;
  accentColor: string;
  shapeId: string;
}

export interface ZoomModelInstance {
  id: string;
  modelId: string;
  name: string;
  category: ModelCategory;
  rarity: ModelRarity;
  rate: number;
  float: number;
  primaryColor: string;
  accentColor: string;
  shapeId: string;
  createdAt: number;
  isListedInMarket: boolean;
  serverListingId?: number | null;
  marketPrice?: number | null;
}
