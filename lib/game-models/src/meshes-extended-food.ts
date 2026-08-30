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

function stardustPot(_p: string, a: string): ReturnType<ShapeEntry["build"]> {
  const accent = a || "#ffd740";
  return [
    pt("body", "cyl", 0, 0.28, 0, 0.28, 0.38, 0.28, "#6a7a8a", { profile: "metal", metal: 0.35 }),
    pt("rim", "torus", 0, 0.48, 0, 0.3, 0.04, 0.3, "#8a9aaa", { profile: "metal", metal: 0.42 }),
    pt("spout", "capsule", 0.24, 0.34, 0, 0.07, 0.28, 0.07, "#7a8a9a", { rz: -0.55, profile: "metal" }),
    pt("handle", "torus", -0.18, 0.34, 0, 0.16, 0.04, 0.16, accent, { rx: 1.57, profile: "metal" }),
    pt("drops", "sphere", 0.32, 0.18, 0.04, 0.05, 0.05, 0.05, accent, { profile: "food_glossy" }),
    pt("drop2", "sphere", 0.36, 0.1, -0.02, 0.04, 0.04, 0.04, "#fff59d", { profile: "food_glossy" }),
    pt("star", "box", 0, 0.52, 0.12, 0.06, 0.06, 0.02, accent, { ry: 0.4 }),
  ];
}

/** Clay-forge silhouette — real look comes from onigiri.glb at reveal. */
function onigiri(_p: string, a: string): ReturnType<ShapeEntry["build"]> {
  const rice = "#f3eee4";
  const nori = "#1a2a20";
  const filling = a || "#e53935";
  return [
    pt("base", "sphere", 0, 0.16, 0, 0.36, 0.2, 0.3, rice, { profile: "food" }),
    pt("mid", "sphere", 0, 0.36, 0, 0.28, 0.22, 0.24, rice, { profile: "food" }),
    pt("top", "sphere", 0, 0.54, 0, 0.18, 0.16, 0.16, rice, { profile: "food" }),
    pt("peak", "cone", 0, 0.68, 0, 0.14, 0.18, 0.14, rice, { profile: "food" }),
    pt("noriFront", "box", 0, 0.22, 0.18, 0.4, 0.3, 0.07, nori, { profile: "food" }),
    pt("noriWrap", "box", 0, 0.2, 0, 0.38, 0.26, 0.22, nori, { profile: "food" }),
    pt("fill", "sphere", 0, 0.34, 0.2, 0.06, 0.05, 0.04, filling, { profile: "food_glossy" }),
  ];
}

/** Clay-forge silhouette — real look comes from island_home.glb at reveal. */
function islandHome(_p: string, a: string): ReturnType<ShapeEntry["build"]> {
  const sand = "#f4d03f";
  const water = "#3d9ee8";
  const wood = "#8d6e63";
  const roof = a || "#ff9100";
  return [
    pt("water", "cyl", 0, 0.04, 0, 0.5, 0.06, 0.5, water, { profile: "liquid" }),
    pt("island", "sphere", 0, 0.14, 0, 0.34, 0.14, 0.34, sand, { profile: "food" }),
    pt("house", "box", 0, 0.32, 0, 0.22, 0.18, 0.18, wood, { rough: 0.55 }),
    pt("roof", "cone", 0, 0.48, 0, 0.18, 0.16, 0.18, roof, { profile: "food" }),
    pt("palm", "cyl", 0.22, 0.28, 0.08, 0.03, 0.28, 0.03, "#6d4c41"),
    pt("leaf1", "box", 0.28, 0.44, 0.08, 0.16, 0.03, 0.08, C.GREEN, { rz: 0.4 }),
    pt("leaf2", "box", 0.16, 0.44, 0.08, 0.16, 0.03, 0.08, C.GREEN, { rz: -0.4 }),
    pt("door", "box", 0, 0.28, 0.1, 0.06, 0.1, 0.02, "#5d4037"),
  ];
}

/** Clay-forge silhouette only — real look comes from flower.glb (untouched). */
function flower(_p: string, a: string): ReturnType<ShapeEntry["build"]> {
  const petal = a || "#ff8fab";
  return [
    pt("stem", "cyl", 0, 0.22, 0, 0.05, 0.44, 0.05, "#4caf50", { profile: "food" }),
    pt("center", "sphere", 0, 0.52, 0, 0.12, 0.12, 0.12, "#ffd54f", { profile: "food_glossy" }),
    pt("p1", "sphere", 0.16, 0.52, 0, 0.12, 0.1, 0.12, petal, { profile: "food" }),
    pt("p2", "sphere", -0.16, 0.52, 0, 0.12, 0.1, 0.12, petal, { profile: "food" }),
    pt("p3", "sphere", 0, 0.52, 0.16, 0.12, 0.1, 0.12, petal, { profile: "food" }),
    pt("p4", "sphere", 0, 0.52, -0.16, 0.12, 0.1, 0.12, petal, { profile: "food" }),
    pt("leaf", "box", 0.1, 0.28, 0.02, 0.14, 0.03, 0.08, C.GREEN, { ry: 0.5, profile: "food" }),
  ];
}

/** Clay-forge silhouette only — real look comes from dollar.glb (untouched). */
function dollar(_p: string, a: string): ReturnType<ShapeEntry["build"]> {
  const gold = a || "#ffd43b";
  return [
    pt("coin", "cyl", 0, 0.28, 0, 0.36, 0.08, 0.36, gold, { profile: "metal", metal: 0.55 }),
    pt("rim", "torus", 0, 0.28, 0, 0.34, 0.03, 0.34, "#f4c430", { profile: "metal", metal: 0.65 }),
    pt("bar", "box", 0, 0.3, 0, 0.06, 0.22, 0.04, "#fff8e1", { profile: "metal" }),
    pt("sTop", "box", 0, 0.38, 0, 0.16, 0.04, 0.04, "#fff8e1", { profile: "metal" }),
    pt("sBot", "box", 0, 0.22, 0, 0.16, 0.04, 0.04, "#fff8e1", { profile: "metal" }),
  ];
}

/** Clay-forge silhouette only — real look comes from creeper.glb (untouched). */
function creeper(_p: string, a: string): ReturnType<ShapeEntry["build"]> {
  const green = a || "#5dbe2f";
  return [
    pt("legs", "box", 0, 0.12, 0, 0.28, 0.24, 0.16, green, { rough: 0.7 }),
    pt("body", "box", 0, 0.36, 0, 0.28, 0.28, 0.16, green, { rough: 0.7 }),
    pt("head", "box", 0, 0.6, 0, 0.28, 0.24, 0.24, green, { rough: 0.65 }),
    pt("eyeL", "box", -0.08, 0.62, 0.13, 0.06, 0.06, 0.02, "#111", { rough: 0.4 }),
    pt("eyeR", "box", 0.08, 0.62, 0.13, 0.06, 0.06, 0.02, "#111", { rough: 0.4 }),
    pt("mouth", "box", 0, 0.54, 0.13, 0.1, 0.06, 0.02, "#111", { rough: 0.4 }),
  ];
}

/** Clay-forge silhouette only — real look comes from chest.glb (untouched). */
function chest(_p: string, a: string): ReturnType<ShapeEntry["build"]> {
  const wood = a || "#c48a3a";
  return [
    pt("box", "box", 0, 0.28, 0, 0.42, 0.32, 0.28, wood, { rough: 0.55 }),
    pt("lid", "box", 0, 0.46, 0, 0.42, 0.08, 0.28, "#a36f2c", { rough: 0.5 }),
    pt("latch", "box", 0, 0.38, 0.15, 0.06, 0.1, 0.04, "#ffe066", { profile: "metal", metal: 0.55 }),
    pt("band", "box", 0, 0.28, 0.15, 0.42, 0.04, 0.02, "#6d4c41", { rough: 0.5 }),
  ];
}

/** Clay-forge silhouette only — real look comes from steve.glb (untouched). */
function steve(_p: string, a: string): ReturnType<ShapeEntry["build"]> {
  const shirt = a || "#5b8def";
  return [
    pt("legs", "box", 0, 0.14, 0, 0.2, 0.24, 0.12, "#3d4a8c", { rough: 0.6 }),
    pt("torso", "box", 0, 0.36, 0, 0.24, 0.24, 0.12, shirt, { rough: 0.55 }),
    pt("head", "box", 0, 0.56, 0, 0.2, 0.2, 0.2, "#e0b080", { profile: "skin" }),
    pt("hair", "box", 0, 0.66, 0, 0.2, 0.06, 0.2, "#3e2723", { rough: 0.7 }),
    pt("armL", "box", -0.16, 0.34, 0, 0.08, 0.24, 0.08, "#e0b080", { profile: "skin" }),
    pt("armR", "box", 0.16, 0.34, 0, 0.08, 0.24, 0.08, "#e0b080", { profile: "skin" }),
  ];
}

/** Clay-forge silhouette only — real look comes from chicken.glb (untouched). */
function chicken(_p: string, a: string): ReturnType<ShapeEntry["build"]> {
  const white = a || "#f0e6c8";
  return [
    pt("body", "box", 0, 0.22, 0, 0.28, 0.22, 0.2, white, { rough: 0.55 }),
    pt("head", "box", 0, 0.4, 0.08, 0.16, 0.16, 0.16, white, { rough: 0.5 }),
    pt("beak", "box", 0, 0.38, 0.18, 0.08, 0.06, 0.08, "#e8c547", { profile: "food" }),
    pt("comb", "box", 0, 0.5, 0.08, 0.08, 0.08, 0.04, "#e53935", { profile: "food" }),
    pt("legL", "box", -0.06, 0.08, 0, 0.04, 0.12, 0.04, "#e8c547"),
    pt("legR", "box", 0.06, 0.08, 0, 0.04, 0.12, 0.04, "#e8c547"),
  ];
}

/** Clay-forge silhouette only — real look comes from honey.glb (untouched). */
function honey(_p: string, a: string): ReturnType<ShapeEntry["build"]> {
  const mustard = a || "#e8b84a";
  return [
    pt("bowl", "cyl", 0, 0.12, 0, 0.22, 0.1, 0.2, "#c9922a", { rough: 0.45 }),
    pt("blob", "sphere", 0, 0.28, 0, 0.2, 0.2, 0.2, mustard, { profile: "food" }),
    pt("drip", "box", 0.12, 0.18, 0.08, 0.06, 0.16, 0.06, mustard, { profile: "food" }),
  ];
}

/** Clay-forge silhouette only — real look comes from horsea.glb (untouched). */
function horsea(_p: string, a: string): ReturnType<ShapeEntry["build"]> {
  const blue = a || "#4fc3f7";
  return [
    pt("body", "sphere", 0, 0.28, 0, 0.18, 0.18, 0.18, blue, { rough: 0.45 }),
    pt("snout", "box", 0, 0.34, 0.16, 0.06, 0.06, 0.16, blue, { rough: 0.4 }),
    pt("tail", "box", 0, 0.16, -0.12, 0.08, 0.16, 0.08, "#0288d1", { rough: 0.5 }),
    pt("fin", "box", 0, 0.42, -0.04, 0.04, 0.12, 0.1, "#81d4fa", { rough: 0.45 }),
  ];
}

/** Clay-forge silhouette only — real look comes from lab_sushi.glb (untouched). */
function sushi(_p: string, a: string): ReturnType<ShapeEntry["build"]> {
  const rice = a || "#fff8e1";
  return [
    pt("rice", "box", 0, 0.14, 0, 0.32, 0.14, 0.18, rice, { profile: "food" }),
    pt("fish", "box", 0, 0.24, 0, 0.34, 0.08, 0.2, "#ff8a80", { profile: "food" }),
    pt("wrap", "box", 0, 0.2, 0, 0.08, 0.16, 0.2, "#2e7d32", { rough: 0.55 }),
  ];
}

/** Clay-forge silhouette only — real look comes from house.glb (untouched). */
function house(_p: string, a: string): ReturnType<ShapeEntry["build"]> {
  const wall = a || "#ef9a58";
  return [
    pt("base", "box", 0, 0.2, 0, 0.36, 0.32, 0.28, wall, { rough: 0.55 }),
    pt("roof", "box", 0, 0.42, 0, 0.4, 0.12, 0.32, "#8d4a2a", { rough: 0.6 }),
    pt("door", "box", 0, 0.14, 0.15, 0.1, 0.16, 0.02, "#5b8def", { rough: 0.4 }),
  ];
}

/** Clay-forge silhouette only — real look comes from slime.glb (untouched). */
function slime(_p: string, a: string): ReturnType<ShapeEntry["build"]> {
  const goo = a || "#76ff03";
  return [
    pt("blob", "sphere", 0, 0.22, 0, 0.24, 0.24, 0.24, goo, { profile: "liquid" }),
    pt("eyeL", "box", -0.08, 0.28, 0.16, 0.06, 0.06, 0.04, "#111", { rough: 0.4 }),
    pt("eyeR", "box", 0.08, 0.28, 0.16, 0.06, 0.06, 0.04, "#111", { rough: 0.4 }),
  ];
}

/** Clay-forge silhouette only — real look comes from pokeball.glb (untouched). */
function pokeball(_p: string, a: string): ReturnType<ShapeEntry["build"]> {
  const red = a || "#e53935";
  return [
    pt("top", "sphere", 0, 0.3, 0, 0.22, 0.22, 0.22, red, { profile: "metal" }),
    pt("band", "box", 0, 0.26, 0, 0.46, 0.04, 0.46, "#111", { rough: 0.4 }),
    pt("button", "sphere", 0, 0.26, 0.2, 0.06, 0.06, 0.06, "#fafafa", { profile: "metal" }),
  ];
}

/** Clay-forge silhouette only — real look comes from dodge.glb (untouched). */
function dodge(_p: string, a: string): ReturnType<ShapeEntry["build"]> {
  const body = a || "#37474f";
  return [
    pt("chassis", "box", 0, 0.16, 0, 0.5, 0.12, 0.22, body, { rough: 0.45 }),
    pt("cabin", "box", -0.04, 0.28, 0, 0.22, 0.12, 0.2, "#90a4ae", { profile: "glass" }),
    pt("wheelFL", "cyl", -0.16, 0.08, 0.12, 0.06, 0.04, 0.06, "#111", { profile: "rubber" }),
    pt("wheelFR", "cyl", -0.16, 0.08, -0.12, 0.06, 0.04, 0.06, "#111", { profile: "rubber" }),
    pt("wheelRL", "cyl", 0.16, 0.08, 0.12, 0.06, 0.04, 0.06, "#111", { profile: "rubber" }),
    pt("wheelRR", "cyl", 0.16, 0.08, -0.12, 0.06, 0.04, 0.06, "#111", { profile: "rubber" }),
  ];
}

/** Clay-forge silhouette only — real look comes from ak47.glb (untouched). */
function ak47(_p: string, a: string): ReturnType<ShapeEntry["build"]> {
  const gold = a || "#c9a227";
  return [
    pt("receiver", "box", 0, 0.22, 0, 0.36, 0.1, 0.08, gold, { profile: "metal", metal: 0.55 }),
    pt("barrel", "box", 0.28, 0.24, 0, 0.28, 0.04, 0.04, "#212121", { profile: "metal" }),
    pt("stock", "box", -0.26, 0.2, 0, 0.16, 0.08, 0.08, "#5d4037", { rough: 0.6 }),
    pt("mag", "box", -0.04, 0.1, 0, 0.08, 0.16, 0.04, "#212121", { profile: "metal" }),
  ];
}

/** Clay-forge silhouette only — real look comes from laptop.glb (untouched). */
function laptop(_p: string, a: string): ReturnType<ShapeEntry["build"]> {
  const body = a || "#90caf9";
  return [
    pt("base", "box", 0, 0.08, 0, 0.42, 0.04, 0.28, body, { profile: "metal" }),
    pt("lid", "box", 0, 0.26, -0.1, 0.42, 0.24, 0.02, "#42a5f5", { profile: "glass", rx: -0.35 }),
    pt("kbd", "box", 0, 0.1, 0.02, 0.34, 0.01, 0.18, "#1565c0", { rough: 0.5 }),
  ];
}

/** Clay-forge silhouette only — real look comes from evenano.glb (untouched). */
function evenano(_p: string, a: string): ReturnType<ShapeEntry["build"]> {
  const body = a || "#26c6da";
  return [
    pt("cube", "box", 0, 0.24, 0, 0.36, 0.36, 0.36, body, { profile: "metal" }),
    pt("core", "box", 0, 0.24, 0, 0.16, 0.16, 0.16, "#00838f", { profile: "glass" }),
  ];
}

/** Clay-forge silhouette only — real look comes from capybara.glb (untouched). */
function capybara(_p: string, a: string): ReturnType<ShapeEntry["build"]> {
  const fur = a || "#c4a574";
  return [
    pt("body", "box", 0, 0.16, 0, 0.36, 0.18, 0.2, fur, { rough: 0.7 }),
    pt("head", "box", 0.2, 0.22, 0, 0.16, 0.14, 0.16, fur, { rough: 0.7 }),
    pt("legFL", "box", -0.1, 0.06, 0.08, 0.06, 0.1, 0.06, "#8d6e63", { rough: 0.7 }),
    pt("legFR", "box", -0.1, 0.06, -0.08, 0.06, 0.1, 0.06, "#8d6e63", { rough: 0.7 }),
    pt("legRL", "box", 0.1, 0.06, 0.08, 0.06, 0.1, 0.06, "#8d6e63", { rough: 0.7 }),
    pt("legRR", "box", 0.1, 0.06, -0.08, 0.06, 0.1, 0.06, "#8d6e63", { rough: 0.7 }),
  ];
}

/** Clay-forge silhouette only — real look comes from question_block.glb (untouched). */
function questionBlock(_p: string, a: string): ReturnType<ShapeEntry["build"]> {
  const gold = a || "#ffc107";
  return [
    pt("block", "box", 0, 0.24, 0, 0.36, 0.36, 0.36, gold, { profile: "metal" }),
    pt("mark", "box", 0, 0.26, 0.19, 0.08, 0.16, 0.02, "#5d4037", { rough: 0.4 }),
  ];
}

export const FOOD_DRINK_SHAPES: ShapeEntry[] = [
  { id: "banana", name: "Banana", category: "food", build: banana },
  { id: "apple", name: "Red Apple", category: "food", build: apple },
  { id: "pear", name: "Green Pear", category: "food", build: pear },
  { id: "pizza", name: "Pizza Slice", category: "food", build: pizza },
  { id: "flower", name: "Flower", category: "food", build: flower },
  { id: "dollar", name: "Dollar", category: "food", build: dollar },
  { id: "creeper", name: "Creeper", category: "food", build: creeper },
  { id: "chest", name: "Chest", category: "food", build: chest },
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
  { id: "stardust_pot", name: "Stardust Pot", category: "food", build: stardustPot },
  { id: "onigiri", name: "Onigiri", category: "food", build: onigiri },
  { id: "street_scene", name: "Onigiri", category: "food", build: onigiri },
  { id: "island_home", name: "Island Home", category: "food", build: islandHome },
  { id: "steve", name: "Steve", category: "food", build: steve },
  { id: "chicken", name: "Chicken", category: "food", build: chicken },
  { id: "honey", name: "Honey", category: "food", build: honey },
  { id: "horsea", name: "Horsea", category: "food", build: horsea },
  { id: "sushi", name: "Sushi", category: "food", build: sushi },
  { id: "lab_house", name: "House", category: "food", build: house },
  { id: "slime", name: "Slime", category: "food", build: slime },
  { id: "lab_pokeball", name: "Pokeball", category: "food", build: pokeball },
  { id: "dodge", name: "Dodge", category: "food", build: dodge },
  { id: "ak47", name: "AK-47 Asimov", category: "food", build: ak47 },
  { id: "lab_laptop", name: "Laptop", category: "food", build: laptop },
  { id: "evenano", name: "Evenano Block", category: "food", build: evenano },
  { id: "capybara", name: "Capybara", category: "food", build: capybara },
  { id: "question_block", name: "Question Block", category: "food", build: questionBlock },
];
