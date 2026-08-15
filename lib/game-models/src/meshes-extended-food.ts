import { C, legoMinifig, pt, sodaCan, type ShapeEntry } from "./mesh-utils.js";

function banana(_p: string, _a: string): ReturnType<ShapeEntry["build"]> {
  return [
    pt("curve1", "capsule", 0, 0.28, 0, 0.12, 0.32, 0.12, "#f5d033", { rz: 0.55, profile: "food" }),
    pt("curve2", "capsule", 0.12, 0.48, 0.08, 0.11, 0.28, 0.11, "#f0c820", { rz: 0.9, profile: "food" }),
    pt("curve3", "capsule", 0.22, 0.62, 0.18, 0.1, 0.24, 0.1, "#e8bc18", { rz: 1.25, profile: "food" }),
    pt("tip", "cone", 0.28, 0.72, 0.26, 0.06, 0.12, 0.06, "#6b4a12", { rx: 0.8, profile: "food" }),
    pt("stem", "cyl", -0.08, 0.12, -0.06, 0.04, 0.1, 0.04, "#5a4010", { profile: "food" }),
    pt("spot1", "sphere", 0.08, 0.38, 0.04, 0.02, 0.02, 0.02, "#e0b810", { profile: "food" }),
  ];
}

function apple(_p: string, a: string): ReturnType<ShapeEntry["build"]> {
  const red = a || "#e53935";
  return [
    pt("body", "sphere", 0, 0.38, 0, 0.34, 0.36, 0.34, red, { rough: 0.45, profile: "food_glossy" }),
    pt("dent", "sphere", 0, 0.58, 0, 0.12, 0.08, 0.12, red, { profile: "food_glossy" }),
    pt("stem", "cyl", 0, 0.66, 0, 0.03, 0.1, 0.03, "#5a4010", { profile: "food" }),
    pt("leaf", "box", 0.08, 0.68, 0.02, 0.12, 0.04, 0.06, C.GREEN, { ry: 0.4, profile: "food" }),
    pt("shine", "sphere", 0.12, 0.48, 0.22, 0.06, 0.04, 0.04, "#ff8a80", { profile: "food_glossy" }),
  ];
}

function pear(_p: string, _a: string): ReturnType<ShapeEntry["build"]> {
  return [
    pt("bottom", "sphere", 0, 0.28, 0, 0.3, 0.32, 0.3, "#c8e64a", { profile: "food_glossy" }),
    pt("top", "sphere", 0, 0.58, 0, 0.2, 0.24, 0.2, "#b8d840", { profile: "food_glossy" }),
    pt("stem", "cyl", 0, 0.74, 0, 0.03, 0.08, 0.03, "#5a4010"),
    pt("leaf", "box", 0.06, 0.72, 0.02, 0.1, 0.03, 0.05, C.GREEN, { ry: 0.5 }),
  ];
}

function pizza(_p: string, a: string): ReturnType<ShapeEntry["build"]> {
  return [
    pt("base", "cyl", 0, 0.08, 0, 0.48, 0.06, 0.48, "#d4a056", { profile: "food" }),
    pt("crust", "torus", 0, 0.1, 0, 0.46, 0.05, 0.46, "#c8843a", { profile: "food" }),
    pt("sauce", "cyl", 0, 0.12, 0, 0.4, 0.02, 0.4, "#e53935", { profile: "food" }),
    pt("cheese", "cyl", 0, 0.14, 0, 0.38, 0.02, 0.38, "#ffd54f", { profile: "food_glossy" }),
    pt("pep1", "cyl", 0.12, 0.16, 0.1, 0.06, 0.02, 0.06, a || C.RED, { profile: "food" }),
    pt("pep2", "cyl", -0.14, 0.16, -0.08, 0.06, 0.02, 0.06, a || C.RED, { profile: "food" }),
    pt("pep3", "cyl", 0.04, 0.16, -0.16, 0.06, 0.02, 0.06, a || C.RED, { profile: "food" }),
    pt("slice", "box", 0, 0.12, 0, 0.02, 0.08, 0.48, "#c8843a", { ry: 0.08 }),
  ];
}

function hotdog(_p: string, _a: string): ReturnType<ShapeEntry["build"]> {
  return [
    pt("bunBot", "capsule", 0, 0.18, 0, 0.14, 0.52, 0.14, "#e8b050", { profile: "food_glossy" }),
    pt("bunTop", "capsule", 0, 0.32, 0, 0.13, 0.48, 0.13, "#f0c868", { profile: "food_glossy" }),
    pt("sausage", "capsule", 0, 0.24, 0, 0.1, 0.46, 0.1, "#c45c26", { profile: "food" }),
    pt("mustard", "box", 0, 0.3, 0.1, 0.04, 0.02, 0.28, C.YELLOW, { ry: 0.15, profile: "food_glossy" }),
    pt("ketchup", "box", 0, 0.28, 0.11, 0.03, 0.02, 0.22, C.RED, { ry: -0.1, profile: "food_glossy" }),
  ];
}

function fries(_p: string, a: string): ReturnType<ShapeEntry["build"]> {
  const box = a || C.RED;
  return [
    pt("carton", "box", 0, 0.22, 0, 0.42, 0.36, 0.28, box, { rough: 0.5 }),
    pt("fry1", "box", -0.08, 0.52, 0.04, 0.04, 0.32, 0.04, "#f5c842", { ry: 0.1, profile: "food" }),
    pt("fry2", "box", 0.06, 0.56, -0.02, 0.04, 0.36, 0.04, "#f0c030", { ry: -0.15, profile: "food" }),
    pt("fry3", "box", -0.02, 0.5, -0.08, 0.04, 0.28, 0.04, "#f5c842", { ry: 0.25, profile: "food" }),
    pt("fry4", "box", 0.12, 0.48, 0.08, 0.04, 0.3, 0.04, "#e8b828", { ry: -0.08, profile: "food" }),
    pt("fry5", "box", -0.14, 0.46, 0.02, 0.04, 0.26, 0.04, "#f5c842", { ry: 0.18, profile: "food" }),
    pt("salt", "sphere", 0.04, 0.58, 0.06, 0.02, 0.02, 0.02, C.WHITE),
  ];
}

function taco(_p: string, _a: string): ReturnType<ShapeEntry["build"]> {
  return [
    pt("shellL", "box", -0.12, 0.28, 0, 0.24, 0.06, 0.48, "#e8b050", { ry: 0.35, profile: "food" }),
    pt("shellR", "box", 0.12, 0.28, 0, 0.24, 0.06, 0.48, "#e8b050", { ry: -0.35, profile: "food" }),
    pt("meat", "box", 0, 0.32, 0, 0.18, 0.06, 0.36, "#8b4513", { profile: "food" }),
    pt("lettuce", "box", 0, 0.38, 0, 0.2, 0.04, 0.32, C.GREEN, { profile: "food" }),
    pt("cheese", "box", 0, 0.34, 0.08, 0.14, 0.03, 0.2, "#ffd54f", { profile: "food_glossy" }),
    pt("tomato", "box", 0, 0.36, -0.06, 0.12, 0.03, 0.14, C.RED, { profile: "food_glossy" }),
  ];
}

function watermelon(_p: string, _a: string): ReturnType<ShapeEntry["build"]> {
  return [
    pt("rind", "sphere", 0, 0.32, 0, 0.42, 0.28, 0.42, C.GREEN, { profile: "food" }),
    pt("stripe1", "box", 0, 0.32, 0.38, 0.06, 0.22, 0.02, "#2e7d32", { profile: "food" }),
    pt("stripe2", "box", -0.2, 0.3, 0.28, 0.04, 0.18, 0.02, "#2e7d32", { profile: "food" }),
    pt("flesh", "sphere", 0, 0.34, 0.08, 0.34, 0.18, 0.34, "#ff5252", { profile: "food_glossy" }),
    pt("seed1", "capsule", 0.08, 0.36, 0.22, 0.02, 0.06, 0.02, C.DARK, { profile: "food" }),
    pt("seed2", "capsule", -0.1, 0.32, 0.18, 0.02, 0.05, 0.02, C.DARK, { profile: "food" }),
  ];
}

function strawberry(_p: string, _a: string): ReturnType<ShapeEntry["build"]> {
  return [
    pt("body", "cone", 0, 0.32, 0, 0.22, 0.36, 0.22, "#e53935", { profile: "food_glossy" }),
    pt("top", "sphere", 0, 0.52, 0, 0.14, 0.1, 0.14, "#e53935", { profile: "food_glossy" }),
    pt("leaf1", "box", -0.08, 0.56, 0, 0.08, 0.04, 0.06, C.GREEN, { ry: 0.5 }),
    pt("leaf2", "box", 0.08, 0.56, 0, 0.08, 0.04, 0.06, C.GREEN, { ry: -0.5 }),
    pt("leaf3", "box", 0, 0.58, 0.06, 0.06, 0.04, 0.08, C.GREEN),
    pt("seed1", "sphere", 0.06, 0.4, 0.14, 0.015, 0.015, 0.015, "#ffcdd2"),
    pt("seed2", "sphere", -0.04, 0.28, 0.12, 0.015, 0.015, 0.015, "#ffcdd2"),
  ];
}

function orange(_p: string, _a: string): ReturnType<ShapeEntry["build"]> {
  return [
    pt("body", "sphere", 0, 0.34, 0, 0.32, 0.32, 0.32, C.ORANGE, { rough: 0.55, profile: "food" }),
    pt("dimple1", "sphere", 0.14, 0.42, 0.18, 0.03, 0.03, 0.03, "#ff8f00", { profile: "food" }),
    pt("dimple2", "sphere", -0.1, 0.28, 0.2, 0.03, 0.03, 0.03, "#ff8f00", { profile: "food" }),
    pt("stem", "cyl", 0, 0.52, 0, 0.03, 0.06, 0.03, "#5a4010"),
    pt("leaf", "box", 0.06, 0.54, 0.02, 0.08, 0.03, 0.05, C.GREEN, { ry: 0.3 }),
  ];
}

function cola(p: string, a: string): ReturnType<ShapeEntry["build"]> {
  return sodaCan("#cc0000", C.WHITE, a || C.RED);
}

function fanta(p: string, a: string): ReturnType<ShapeEntry["build"]> {
  return sodaCan(C.ORANGE, C.WHITE, "#0066cc");
}

function sprite(p: string, a: string): ReturnType<ShapeEntry["build"]> {
  return [
    ...sodaCan("#00a651", C.WHITE, C.GREEN),
    pt("bubble1", "sphere", 0.12, 0.48, 0.22, 0.03, 0.03, 0.03, C.WHITE, { profile: "food_glossy" }),
    pt("bubble2", "sphere", -0.08, 0.36, 0.22, 0.025, 0.025, 0.025, C.WHITE, { profile: "food_glossy" }),
  ];
}

function waterBottle(p: string, a: string): ReturnType<ShapeEntry["build"]> {
  return [
    pt("body", "cyl", 0, 0.38, 0, 0.18, 0.62, 0.18, a || C.GLASS, { metal: 0.05, rough: 0.08, profile: "glass" }),
    pt("water", "cyl", 0, 0.32, 0, 0.16, 0.48, 0.16, "#5bc8f5", { profile: "liquid" }),
    pt("cap", "cyl", 0, 0.72, 0, 0.12, 0.1, 0.12, p || C.BLUE, { metal: 0.2 }),
    pt("label", "box", 0, 0.38, 0.19, 0.14, 0.2, 0.02, C.WHITE),
    pt("neck", "cyl", 0, 0.66, 0, 0.1, 0.08, 0.1, a || C.GLASS, { profile: "glass" }),
  ];
}

function milkCarton(p: string, a: string): ReturnType<ShapeEntry["build"]> {
  return [
    pt("box", "box", 0, 0.38, 0, 0.36, 0.62, 0.28, C.WHITE, { rough: 0.4 }),
    pt("roofL", "box", -0.1, 0.72, 0, 0.18, 0.12, 0.28, C.WHITE, { ry: 0.4 }),
    pt("roofR", "box", 0.1, 0.72, 0, 0.18, 0.12, 0.28, C.WHITE, { ry: -0.4 }),
    pt("label", "box", 0, 0.4, 0.15, 0.28, 0.32, 0.02, p || C.BLUE),
    pt("drop", "sphere", 0, 0.42, 0.16, 0.06, 0.08, 0.02, C.WHITE),
    pt("cap", "box", 0, 0.78, 0, 0.08, 0.04, 0.08, a || C.RED),
  ];
}

function energyDrink(p: string, a: string): ReturnType<ShapeEntry["build"]> {
  return [
    pt("can", "cyl", 0, 0.4, 0, 0.2, 0.78, 0.2, a || "#111", { metal: 0.5, profile: "metal" }),
    pt("label", "cyl", 0, 0.4, 0, 0.205, 0.36, 0.205, p || C.GREEN),
    pt("bolt", "box", 0, 0.42, 0.21, 0.08, 0.14, 0.02, C.YELLOW, { metal: 0.6 }),
    pt("top", "cyl", 0, 0.82, 0, 0.18, 0.04, 0.18, C.CHROME, { metal: 0.85 }),
    pt("tab", "box", 0, 0.84, 0.06, 0.08, 0.02, 0.05, C.CHROME, { metal: 0.9 }),
  ];
}

export const FOOD_DRINK_SHAPES: ShapeEntry[] = [
  { id: "banana", name: "Banana", category: "food", build: banana },
  { id: "apple", name: "Red Apple", category: "food", build: apple },
  { id: "pear", name: "Green Pear", category: "food", build: pear },
  { id: "pizza", name: "Pizza Slice", category: "food", build: pizza },
  { id: "hotdog", name: "Hot Dog", category: "food", build: hotdog },
  { id: "fries", name: "French Fries", category: "food", build: fries },
  { id: "taco", name: "Taco", category: "food", build: taco },
  { id: "watermelon", name: "Watermelon", category: "food", build: watermelon },
  { id: "strawberry", name: "Strawberry", category: "food", build: strawberry },
  { id: "orange", name: "Orange", category: "food", build: orange },
  { id: "cola", name: "Cola Can", category: "food", build: cola },
  { id: "fanta", name: "Fanta Can", category: "food", build: fanta },
  { id: "sprite", name: "Sprite Can", category: "food", build: sprite },
  { id: "water_bottle", name: "Water Bottle", category: "food", build: waterBottle },
  { id: "milk_carton", name: "Milk Carton", category: "food", build: milkCarton },
  { id: "energy_drink", name: "Energy Drink", category: "food", build: energyDrink },
];
