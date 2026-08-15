import { FOOD_DRINK_SHAPES } from "./meshes-extended-food.js";
import { LEGO_TECH_SHAPES } from "./meshes-extended-lego-tech.js";
import { ANIMAL_MISC_SHAPES } from "./meshes-extended-animals.js";
import type { ShapeEntry } from "./mesh-utils.js";

/** 50 additional procedural shapes (food, drinks, lego, tech, animals, misc). */
export const EXTENDED_SHAPE_LIBRARY: readonly ShapeEntry[] = [
  ...FOOD_DRINK_SHAPES,
  ...LEGO_TECH_SHAPES,
  ...ANIMAL_MISC_SHAPES,
];

export const EXTENDED_SHAPE_COUNT = EXTENDED_SHAPE_LIBRARY.length;
