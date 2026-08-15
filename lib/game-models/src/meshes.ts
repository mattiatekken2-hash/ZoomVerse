import type { ModelCategory } from "./types.js";

export type MeshPrim = "box" | "sphere" | "cyl" | "cone" | "torus";

export interface MeshPart {
  id: string;
  prim: MeshPrim;
  x: number;
  y: number;
  z: number;
  rx?: number;
  ry?: number;
  rz?: number;
  /** box: w,h,d · sphere: radius · cyl: rTop, height, rBot · cone: r,h · torus: radius, tube */
  sx: number;
  sy: number;
  sz: number;
  color: "p" | "a" | string;
  metal?: number;
  rough?: number;
}

function pt(
  id: string,
  prim: MeshPrim,
  x: number, y: number, z: number,
  sx: number, sy: number, sz: number,
  color: MeshPart["color"],
  extra?: Partial<Pick<MeshPart, "rx" | "ry" | "rz" | "metal" | "rough">>,
): MeshPart {
  return { id, prim, x, y, z, sx, sy, sz, color, ...extra };
}

const SKIN = "#f2c9a1";
const DARK = "#1a1a1a";
const WHITE = "#f4f4f4";
const BROWN = "#6b3e26";
const RED = "#e23b3b";
const BLUE = "#2b6cff";
const YELLOW = "#f5d031";
const GLASS = "#9ad4ff";
const WINE = "#6b1020";

/** Floating mystery kit shown while tapping (identity hidden). */
export function mysteryKitParts(): MeshPart[] {
  return [
    pt("k1", "box", -0.55, 0.15, 0.1, 0.55, 0.12, 0.55, "#555"),
    pt("k2", "cyl", 0.45, 0.35, -0.2, 0.12, 0.7, 0.12, "#666"),
    pt("k3", "sphere", 0.05, 0.7, 0.35, 0.22, 0.22, 0.22, "#777"),
    pt("k4", "box", -0.15, 0.45, -0.4, 0.35, 0.35, 0.12, "#4a4a4a"),
    pt("k5", "cone", 0.5, 0.85, 0.15, 0.16, 0.32, 0.16, "#888"),
    pt("k6", "cyl", -0.4, 0.7, 0.35, 0.08, 0.45, 0.08, "#5c5c5c", { rx: 1.2 }),
    pt("k7", "torus", 0.1, 0.2, 0.55, 0.18, 0.05, 0.18, "#6a6a6a"),
    pt("k8", "box", 0.35, 0.12, 0.4, 0.28, 0.1, 0.4, "#404040"),
  ];
}

function minifig(p: string, a: string): MeshPart[] {
  return [
    pt("legL", "box", -0.16, 0.22, 0, 0.26, 0.44, 0.28, a),
    pt("legR", "box", 0.16, 0.22, 0, 0.26, 0.44, 0.28, a),
    pt("hips", "box", 0, 0.48, 0, 0.58, 0.14, 0.32, a),
    pt("torso", "box", 0, 0.82, 0, 0.62, 0.52, 0.34, p),
    pt("armL", "cyl", -0.42, 0.78, 0, 0.1, 0.42, 0.1, YELLOW),
    pt("armR", "cyl", 0.42, 0.78, 0, 0.1, 0.42, 0.1, YELLOW),
    pt("handL", "sphere", -0.42, 0.54, 0, 0.11, 0.11, 0.11, YELLOW),
    pt("handR", "sphere", 0.42, 0.54, 0, 0.11, 0.11, 0.11, YELLOW),
    pt("head", "cyl", 0, 1.22, 0, 0.28, 0.32, 0.28, YELLOW),
    pt("stud", "cyl", 0, 1.42, 0, 0.12, 0.1, 0.12, YELLOW),
    pt("eyeL", "box", -0.1, 1.24, 0.26, 0.08, 0.08, 0.04, DARK),
    pt("eyeR", "box", 0.1, 1.24, 0.26, 0.08, 0.08, 0.04, DARK),
    pt("smile", "box", 0, 1.12, 0.26, 0.16, 0.04, 0.03, DARK),
  ];
}

function plumber(p: string, a: string): MeshPart[] {
  return [
    pt("shoeL", "box", -0.16, 0.08, 0.08, 0.22, 0.12, 0.34, BROWN),
    pt("shoeR", "box", 0.16, 0.08, 0.08, 0.22, 0.12, 0.34, BROWN),
    pt("legL", "box", -0.15, 0.32, 0, 0.22, 0.4, 0.24, BLUE),
    pt("legR", "box", 0.15, 0.32, 0, 0.22, 0.4, 0.24, BLUE),
    pt("torso", "box", 0, 0.78, 0, 0.5, 0.5, 0.32, BLUE),
    pt("strapL", "box", -0.16, 0.86, 0.17, 0.1, 0.42, 0.04, RED),
    pt("strapR", "box", 0.16, 0.86, 0.17, 0.1, 0.42, 0.04, RED),
    pt("shirt", "box", 0, 1.02, 0, 0.52, 0.18, 0.34, p || RED),
    pt("armL", "cyl", -0.36, 0.86, 0, 0.09, 0.36, 0.09, p || RED),
    pt("armR", "cyl", 0.36, 0.86, 0, 0.09, 0.36, 0.09, p || RED),
    pt("gloveL", "sphere", -0.36, 0.64, 0.05, 0.1, 0.1, 0.1, WHITE),
    pt("gloveR", "sphere", 0.36, 0.64, 0.05, 0.1, 0.1, 0.1, WHITE),
    pt("head", "sphere", 0, 1.28, 0, 0.26, 0.26, 0.26, SKIN),
    pt("nose", "sphere", 0, 1.24, 0.22, 0.08, 0.08, 0.08, SKIN),
    pt("stache", "box", 0, 1.18, 0.22, 0.28, 0.06, 0.08, DARK),
    pt("cap", "cyl", 0, 1.48, 0, 0.3, 0.12, 0.3, a || RED),
    pt("brim", "box", 0, 1.42, 0.22, 0.38, 0.05, 0.16, a || RED),
  ];
}

function ninja(p: string, a: string): MeshPart[] {
  return [
    pt("legL", "box", -0.14, 0.28, 0, 0.2, 0.52, 0.22, DARK),
    pt("legR", "box", 0.14, 0.28, 0, 0.2, 0.52, 0.22, DARK),
    pt("torso", "box", 0, 0.78, 0, 0.46, 0.48, 0.28, p),
    pt("ob", "box", 0, 0.62, 0.16, 0.5, 0.1, 0.06, a),
    pt("armL", "cyl", -0.32, 0.78, 0, 0.08, 0.38, 0.08, DARK),
    pt("armR", "cyl", 0.32, 0.78, 0, 0.08, 0.38, 0.08, DARK),
    pt("head", "sphere", 0, 1.18, 0, 0.22, 0.22, 0.22, SKIN),
    pt("mask", "box", 0, 1.14, 0.18, 0.36, 0.16, 0.08, p),
    pt("eyeL", "box", -0.08, 1.16, 0.24, 0.08, 0.05, 0.03, WHITE),
    pt("eyeR", "box", 0.08, 1.16, 0.24, 0.08, 0.05, 0.03, WHITE),
    pt("sword", "box", 0.48, 0.7, 0, 0.06, 0.7, 0.06, a, { metal: 0.85, rough: 0.2 }),
  ];
}

function robot(p: string, a: string): MeshPart[] {
  return [
    pt("legL", "box", -0.18, 0.22, 0, 0.22, 0.4, 0.24, p),
    pt("legR", "box", 0.18, 0.22, 0, 0.22, 0.4, 0.24, p),
    pt("torso", "box", 0, 0.72, 0, 0.58, 0.5, 0.38, p, { metal: 0.7, rough: 0.25 }),
    pt("chest", "box", 0, 0.76, 0.2, 0.28, 0.22, 0.06, a, { metal: 0.4 }),
    pt("armL", "box", -0.42, 0.7, 0, 0.16, 0.46, 0.16, p),
    pt("armR", "box", 0.42, 0.7, 0, 0.16, 0.46, 0.16, p),
    pt("head", "box", 0, 1.14, 0, 0.4, 0.34, 0.34, a, { metal: 0.65 }),
    pt("eyeL", "cyl", -0.1, 1.16, 0.18, 0.07, 0.06, 0.07, "#00ff88", { rx: 1.57 }),
    pt("eyeR", "cyl", 0.1, 1.16, 0.18, 0.07, 0.06, 0.07, "#00ff88", { rx: 1.57 }),
    pt("ant", "cyl", 0.12, 1.4, 0, 0.03, 0.22, 0.03, DARK),
    pt("antTip", "sphere", 0.12, 1.52, 0, 0.05, 0.05, 0.05, "#ff3355"),
  ];
}

function knight(p: string, a: string): MeshPart[] {
  return [
    pt("legL", "box", -0.14, 0.26, 0, 0.22, 0.48, 0.24, p, { metal: 0.8, rough: 0.3 }),
    pt("legR", "box", 0.14, 0.26, 0, 0.22, 0.48, 0.24, p, { metal: 0.8, rough: 0.3 }),
    pt("torso", "box", 0, 0.78, 0, 0.5, 0.5, 0.32, p, { metal: 0.85, rough: 0.25 }),
    pt("helm", "sphere", 0, 1.22, 0, 0.24, 0.24, 0.24, a, { metal: 0.9, rough: 0.2 }),
    pt("visor", "box", 0, 1.2, 0.18, 0.32, 0.1, 0.08, DARK),
    pt("crest", "box", 0, 1.46, 0, 0.06, 0.22, 0.28, RED),
    pt("shield", "box", -0.46, 0.7, 0.08, 0.08, 0.5, 0.38, a, { metal: 0.5 }),
    pt("sword", "box", 0.42, 0.72, 0, 0.07, 0.72, 0.07, "#c0c8d4", { metal: 0.95, rough: 0.15 }),
  ];
}

function supercar(p: string, a: string): MeshPart[] {
  return [
    pt("body", "box", 0, 0.28, 0, 1.5, 0.28, 0.7, p, { metal: 0.75, rough: 0.22 }),
    pt("cabin", "box", -0.1, 0.52, 0, 0.7, 0.22, 0.62, a, { metal: 0.3, rough: 0.15 }),
    pt("wind", "box", 0.22, 0.52, 0, 0.28, 0.18, 0.58, GLASS, { metal: 0.1, rough: 0.05 }),
    pt("hood", "box", 0.52, 0.36, 0, 0.42, 0.12, 0.64, p, { metal: 0.8 }),
    pt("spoiler", "box", -0.72, 0.5, 0, 0.08, 0.08, 0.72, a),
    pt("wFL", "cyl", 0.48, 0.16, 0.4, 0.16, 0.12, 0.16, DARK, { rz: 1.57 }),
    pt("wFR", "cyl", 0.48, 0.16, -0.4, 0.16, 0.12, 0.16, DARK, { rz: 1.57 }),
    pt("wRL", "cyl", -0.5, 0.16, 0.4, 0.18, 0.12, 0.18, DARK, { rz: 1.57 }),
    pt("wRR", "cyl", -0.5, 0.16, -0.4, 0.18, 0.12, 0.18, DARK, { rz: 1.57 }),
    pt("lightL", "box", 0.76, 0.3, 0.22, 0.04, 0.08, 0.12, YELLOW),
    pt("lightR", "box", 0.76, 0.3, -0.22, 0.04, 0.08, 0.12, YELLOW),
  ];
}

function motorcycle(p: string, a: string): MeshPart[] {
  return [
    pt("wF", "cyl", 0.42, 0.28, 0, 0.26, 0.1, 0.26, DARK, { rz: 1.57 }),
    pt("wR", "cyl", -0.42, 0.28, 0, 0.28, 0.1, 0.28, DARK, { rz: 1.57 }),
    pt("body", "box", 0, 0.38, 0, 0.7, 0.18, 0.22, p, { metal: 0.7 }),
    pt("tank", "sphere", 0.08, 0.5, 0, 0.2, 0.16, 0.16, a, { metal: 0.65 }),
    pt("seat", "box", -0.18, 0.48, 0, 0.32, 0.08, 0.2, DARK),
    pt("bar", "cyl", 0.32, 0.62, 0, 0.03, 0.42, 0.03, "#ccc", { rz: 1.57 }),
    pt("pipe", "cyl", -0.1, 0.22, 0.16, 0.04, 0.5, 0.04, "#aaa", { rz: 1.2, metal: 0.9 }),
  ];
}

function rocket(p: string, a: string): MeshPart[] {
  return [
    pt("body", "cyl", 0, 0.7, 0, 0.28, 1.1, 0.28, p, { metal: 0.55 }),
    pt("nose", "cone", 0, 1.5, 0, 0.28, 0.5, 0.28, a, { metal: 0.4 }),
    pt("finL", "box", -0.32, 0.28, 0, 0.22, 0.36, 0.06, a),
    pt("finR", "box", 0.32, 0.28, 0, 0.22, 0.36, 0.06, a),
    pt("finB", "box", 0, 0.28, -0.32, 0.06, 0.36, 0.22, a),
    pt("win", "box", 0, 1.05, 0.26, 0.16, 0.14, 0.04, GLASS),
    pt("flame", "cone", 0, -0.05, 0, 0.16, 0.28, 0.16, "#ff8a3d"),
  ];
}

function helicopter(p: string, a: string): MeshPart[] {
  return [
    pt("body", "sphere", 0, 0.4, 0, 0.38, 0.28, 0.28, p, { metal: 0.45 }),
    pt("tail", "box", -0.7, 0.42, 0, 0.7, 0.1, 0.1, p),
    pt("tailR", "box", -1.02, 0.55, 0, 0.08, 0.28, 0.22, a),
    pt("skidL", "box", 0.05, 0.12, 0.22, 0.7, 0.04, 0.06, DARK),
    pt("skidR", "box", 0.05, 0.12, -0.22, 0.7, 0.04, 0.06, DARK),
    pt("mast", "cyl", 0, 0.72, 0, 0.04, 0.18, 0.04, DARK),
    pt("blade", "box", 0, 0.82, 0, 1.6, 0.04, 0.1, a),
    pt("win", "box", 0.22, 0.46, 0, 0.18, 0.16, 0.32, GLASS),
  ];
}

function wineGlass(_p: string, a: string): MeshPart[] {
  return [
    pt("base", "cyl", 0, 0.06, 0, 0.32, 0.06, 0.32, WHITE, { metal: 0.2, rough: 0.1 }),
    pt("stem", "cyl", 0, 0.42, 0, 0.05, 0.66, 0.05, WHITE, { metal: 0.15, rough: 0.08 }),
    pt("bowl", "cyl", 0, 0.92, 0, 0.28, 0.38, 0.18, GLASS, { metal: 0.05, rough: 0.05 }),
    pt("wine", "cyl", 0, 0.82, 0, 0.22, 0.2, 0.16, a || WINE, { metal: 0.05, rough: 0.35 }),
    pt("rim", "torus", 0, 1.1, 0, 0.26, 0.02, 0.26, WHITE, { metal: 0.2 }),
  ];
}

function burger(p: string, a: string): MeshPart[] {
  return [
    pt("bunB", "cyl", 0, 0.14, 0, 0.42, 0.16, 0.42, "#e0a050"),
    pt("patty", "cyl", 0, 0.3, 0, 0.4, 0.12, 0.4, BROWN),
    pt("cheese", "box", 0, 0.38, 0, 0.72, 0.04, 0.72, YELLOW),
    pt("lettuce", "cyl", 0, 0.44, 0, 0.42, 0.06, 0.42, "#4caf50"),
    pt("bunT", "sphere", 0, 0.62, 0, 0.42, 0.22, 0.42, p || "#e8b060"),
    pt("seed1", "sphere", -0.12, 0.78, 0.08, 0.04, 0.04, 0.04, WHITE),
    pt("seed2", "sphere", 0.1, 0.8, -0.06, 0.04, 0.04, 0.04, WHITE),
    pt("seed3", "sphere", 0.02, 0.82, 0.12, 0.04, 0.04, 0.04, a),
  ];
}

function mug(p: string, a: string): MeshPart[] {
  return [
    pt("cup", "cyl", 0, 0.38, 0, 0.32, 0.7, 0.32, p),
    pt("inner", "cyl", 0, 0.55, 0, 0.24, 0.4, 0.24, a || BROWN),
    pt("handle", "torus", 0.38, 0.38, 0, 0.16, 0.05, 0.16, p, { rz: 1.57 }),
    pt("base", "cyl", 0, 0.04, 0, 0.34, 0.06, 0.34, p),
  ];
}

function donut(p: string, a: string): MeshPart[] {
  return [
    pt("dough", "torus", 0, 0.28, 0, 0.38, 0.16, 0.38, "#d4a056"),
    pt("icing", "torus", 0, 0.38, 0, 0.36, 0.1, 0.36, p),
    pt("spr1", "box", 0.2, 0.5, 0.1, 0.04, 0.04, 0.12, a, { ry: 0.6 }),
    pt("spr2", "box", -0.18, 0.5, 0.16, 0.04, 0.04, 0.12, RED, { ry: -0.4 }),
    pt("spr3", "box", 0.05, 0.52, -0.22, 0.04, 0.04, 0.12, YELLOW),
    pt("spr4", "box", -0.22, 0.5, -0.08, 0.04, 0.04, 0.12, BLUE),
  ];
}

function skyscraper(p: string, a: string): MeshPart[] {
  return [
    pt("base", "box", 0, 0.2, 0, 0.9, 0.4, 0.7, "#3a3a3a"),
    pt("mid", "box", 0, 1.0, 0, 0.72, 1.2, 0.58, p),
    pt("top", "box", 0, 1.85, 0, 0.5, 0.5, 0.42, a),
    pt("ant", "cyl", 0, 2.28, 0, 0.04, 0.4, 0.04, DARK),
    pt("w1", "box", 0, 0.7, 0.3, 0.5, 0.12, 0.04, GLASS),
    pt("w2", "box", 0, 1.0, 0.3, 0.5, 0.12, 0.04, GLASS),
    pt("w3", "box", 0, 1.3, 0.3, 0.5, 0.12, 0.04, GLASS),
    pt("w4", "box", 0, 1.6, 0.3, 0.36, 0.1, 0.04, GLASS),
    pt("w5", "box", 0.37, 1.0, 0, 0.04, 0.9, 0.36, GLASS),
  ];
}

function house(p: string, a: string): MeshPart[] {
  return [
    pt("body", "box", 0, 0.4, 0, 0.9, 0.7, 0.7, p),
    pt("roof", "cone", 0, 1.05, 0, 0.72, 0.45, 0.72, a),
    pt("door", "box", 0, 0.28, 0.36, 0.22, 0.4, 0.04, BROWN),
    pt("winL", "box", -0.28, 0.5, 0.36, 0.18, 0.16, 0.04, GLASS),
    pt("winR", "box", 0.28, 0.5, 0.36, 0.18, 0.16, 0.04, GLASS),
    pt("chim", "box", 0.28, 1.15, -0.1, 0.14, 0.28, 0.14, "#555"),
  ];
}

function castle(p: string, a: string): MeshPart[] {
  return [
    pt("keep", "box", 0, 0.5, 0, 0.8, 0.9, 0.8, p),
    pt("tL", "cyl", -0.5, 0.7, 0.5, 0.18, 1.3, 0.18, a),
    pt("tR", "cyl", 0.5, 0.7, 0.5, 0.18, 1.3, 0.18, a),
    pt("tB", "cyl", -0.5, 0.55, -0.5, 0.16, 1.0, 0.16, a),
    pt("gate", "box", 0, 0.28, 0.42, 0.28, 0.4, 0.08, DARK),
    pt("flag", "box", 0.5, 1.5, 0.5, 0.22, 0.12, 0.04, RED),
    pt("pole", "cyl", 0.5, 1.42, 0.5, 0.03, 0.28, 0.03, DARK),
  ];
}

function dog(p: string, a: string): MeshPart[] {
  return [
    pt("body", "box", 0, 0.32, 0, 0.7, 0.32, 0.36, p),
    pt("head", "box", 0.42, 0.48, 0, 0.32, 0.28, 0.3, p),
    pt("snout", "box", 0.62, 0.4, 0, 0.16, 0.14, 0.18, a),
    pt("earL", "cone", 0.38, 0.7, 0.12, 0.08, 0.2, 0.08, a),
    pt("earR", "cone", 0.38, 0.7, -0.12, 0.08, 0.2, 0.08, a),
    pt("leg1", "cyl", 0.22, 0.12, 0.12, 0.07, 0.22, 0.07, p),
    pt("leg2", "cyl", 0.22, 0.12, -0.12, 0.07, 0.22, 0.07, p),
    pt("leg3", "cyl", -0.22, 0.12, 0.12, 0.07, 0.22, 0.07, p),
    pt("leg4", "cyl", -0.22, 0.12, -0.12, 0.07, 0.22, 0.07, p),
    pt("tail", "cyl", -0.4, 0.48, 0, 0.05, 0.28, 0.05, a, { rz: 0.8 }),
    pt("nose", "sphere", 0.72, 0.42, 0, 0.05, 0.05, 0.05, DARK),
  ];
}

function cat(p: string, a: string): MeshPart[] {
  return [
    pt("body", "sphere", 0, 0.32, 0, 0.32, 0.24, 0.22, p),
    pt("head", "sphere", 0.32, 0.5, 0, 0.22, 0.2, 0.2, p),
    pt("earL", "cone", 0.26, 0.7, 0.1, 0.07, 0.16, 0.07, a),
    pt("earR", "cone", 0.26, 0.7, -0.1, 0.07, 0.16, 0.07, a),
    pt("tail", "cyl", -0.32, 0.42, 0, 0.04, 0.4, 0.04, p, { rz: 0.6 }),
    pt("leg1", "cyl", 0.12, 0.12, 0.1, 0.05, 0.18, 0.05, p),
    pt("leg2", "cyl", 0.12, 0.12, -0.1, 0.05, 0.18, 0.05, p),
    pt("leg3", "cyl", -0.12, 0.12, 0.1, 0.05, 0.18, 0.05, p),
    pt("leg4", "cyl", -0.12, 0.12, -0.1, 0.05, 0.18, 0.05, p),
    pt("eyeL", "sphere", 0.4, 0.54, 0.12, 0.04, 0.04, 0.04, a),
    pt("eyeR", "sphere", 0.4, 0.54, -0.12, 0.04, 0.04, 0.04, a),
  ];
}

function penguin(p: string, _a: string): MeshPart[] {
  return [
    pt("body", "sphere", 0, 0.5, 0, 0.32, 0.42, 0.28, DARK),
    pt("belly", "sphere", 0, 0.48, 0.12, 0.22, 0.32, 0.16, WHITE),
    pt("head", "sphere", 0, 0.92, 0, 0.24, 0.22, 0.22, DARK),
    pt("beak", "cone", 0, 0.88, 0.24, 0.08, 0.16, 0.08, "#ff9800", { rx: 1.57 }),
    pt("eyeL", "sphere", -0.08, 0.96, 0.16, 0.04, 0.04, 0.04, WHITE),
    pt("eyeR", "sphere", 0.08, 0.96, 0.16, 0.04, 0.04, 0.04, WHITE),
    pt("flipL", "box", -0.32, 0.5, 0, 0.1, 0.32, 0.08, p || DARK),
    pt("flipR", "box", 0.32, 0.5, 0, 0.1, 0.32, 0.08, p || DARK),
    pt("footL", "box", -0.1, 0.08, 0.12, 0.14, 0.06, 0.22, "#ff9800"),
    pt("footR", "box", 0.1, 0.08, 0.12, 0.14, 0.06, 0.22, "#ff9800"),
  ];
}

function tank(p: string, a: string): MeshPart[] {
  return [
    pt("hull", "box", 0, 0.28, 0, 1.2, 0.32, 0.7, p, { metal: 0.55, rough: 0.4 }),
    pt("trackL", "box", 0, 0.14, 0.42, 1.15, 0.18, 0.16, DARK),
    pt("trackR", "box", 0, 0.14, -0.42, 1.15, 0.18, 0.16, DARK),
    pt("turret", "cyl", 0, 0.55, 0, 0.32, 0.22, 0.32, a, { metal: 0.5 }),
    pt("barrel", "cyl", 0.55, 0.58, 0, 0.06, 0.7, 0.06, a, { rz: 1.57, metal: 0.7 }),
    pt("hatch", "cyl", 0, 0.7, 0, 0.12, 0.08, 0.12, DARK),
  ];
}

function jet(p: string, a: string): MeshPart[] {
  return [
    pt("fuse", "cyl", 0, 0.28, 0, 0.14, 1.4, 0.14, p, { rz: 1.57, metal: 0.5 }),
    pt("nose", "cone", 0.78, 0.28, 0, 0.14, 0.28, 0.14, a, { rz: -1.57 }),
    pt("wingL", "box", 0, 0.26, 0.5, 0.45, 0.05, 0.7, p),
    pt("wingR", "box", 0, 0.26, -0.5, 0.45, 0.05, 0.7, p),
    pt("tail", "box", -0.55, 0.42, 0, 0.18, 0.28, 0.06, a),
    pt("cockpit", "sphere", 0.28, 0.38, 0, 0.12, 0.1, 0.1, GLASS),
  ];
}

function lamp(p: string, a: string): MeshPart[] {
  return [
    pt("base", "cyl", 0, 0.06, 0, 0.28, 0.08, 0.28, DARK),
    pt("stem", "cyl", 0, 0.45, 0, 0.05, 0.7, 0.05, p, { metal: 0.7 }),
    pt("arm", "cyl", 0.22, 0.82, 0, 0.04, 0.45, 0.04, p, { rz: 1.1, metal: 0.7 }),
    pt("shade", "cone", 0.42, 0.7, 0, 0.22, 0.22, 0.22, a),
    pt("bulb", "sphere", 0.42, 0.62, 0, 0.08, 0.08, 0.08, "#fff6c8"),
  ];
}

function chair(p: string, a: string): MeshPart[] {
  return [
    pt("seat", "box", 0, 0.42, 0, 0.7, 0.1, 0.7, p),
    pt("back", "box", 0, 0.85, -0.3, 0.7, 0.75, 0.1, a),
    pt("leg1", "cyl", 0.28, 0.2, 0.28, 0.05, 0.4, 0.05, DARK),
    pt("leg2", "cyl", -0.28, 0.2, 0.28, 0.05, 0.4, 0.05, DARK),
    pt("leg3", "cyl", 0.28, 0.2, -0.28, 0.05, 0.4, 0.05, DARK),
    pt("leg4", "cyl", -0.28, 0.2, -0.28, 0.05, 0.4, 0.05, DARK),
  ];
}

function camera(p: string, a: string): MeshPart[] {
  return [
    pt("body", "box", 0, 0.32, 0, 0.7, 0.42, 0.4, p, { metal: 0.4 }),
    pt("lens", "cyl", 0.12, 0.32, 0.28, 0.18, 0.22, 0.18, DARK, { rx: 1.57, metal: 0.7 }),
    pt("glass", "cyl", 0.12, 0.32, 0.4, 0.12, 0.04, 0.12, GLASS, { rx: 1.57 }),
    pt("flash", "box", 0.28, 0.5, 0.12, 0.16, 0.1, 0.1, a),
    pt("grip", "box", -0.28, 0.22, 0, 0.16, 0.28, 0.28, DARK),
  ];
}

function globe(p: string, a: string): MeshPart[] {
  return [
    pt("ball", "sphere", 0, 0.55, 0, 0.42, 0.42, 0.42, p, { metal: 0.15, rough: 0.45 }),
    pt("band", "torus", 0, 0.55, 0, 0.44, 0.03, 0.44, a, { metal: 0.8 }),
    pt("stand", "cyl", 0, 0.12, 0, 0.08, 0.2, 0.08, "#888", { metal: 0.6 }),
    pt("base", "cyl", 0, 0.04, 0, 0.28, 0.06, 0.28, "#666", { metal: 0.5 }),
  ];
}

export const SHAPE_LIBRARY: readonly {
  id: string;
  name: string;
  category: ModelCategory;
  build: (primary: string, accent: string) => MeshPart[];
}[] = [
  { id: "minifig", name: "Brick Figure", category: "character", build: minifig },
  { id: "plumber", name: "Red Plumber", category: "character", build: plumber },
  { id: "ninja", name: "Shadow Ninja", category: "character", build: ninja },
  { id: "robot", name: "Proto Bot", category: "character", build: robot },
  { id: "knight", name: "Pixel Knight", category: "character", build: knight },
  { id: "supercar", name: "Super Car", category: "vehicle", build: supercar },
  { id: "motorcycle", name: "Street Bike", category: "vehicle", build: motorcycle },
  { id: "rocket", name: "Rocket", category: "vehicle", build: rocket },
  { id: "helicopter", name: "Chopper", category: "vehicle", build: helicopter },
  { id: "wine", name: "Wine Glass", category: "food", build: wineGlass },
  { id: "burger", name: "Burger", category: "food", build: burger },
  { id: "mug", name: "Coffee Mug", category: "food", build: mug },
  { id: "donut", name: "Donut", category: "food", build: donut },
  { id: "skyscraper", name: "Skyscraper", category: "block", build: skyscraper },
  { id: "house", name: "Town House", category: "block", build: house },
  { id: "castle", name: "Castle Keep", category: "block", build: castle },
  { id: "dog", name: "Pixel Pup", category: "animal", build: dog },
  { id: "cat", name: "Pixel Cat", category: "animal", build: cat },
  { id: "penguin", name: "Penguin", category: "animal", build: penguin },
  { id: "tank", name: "Battle Tank", category: "military", build: tank },
  { id: "jet", name: "Fighter Jet", category: "military", build: jet },
  { id: "lamp", name: "Desk Lamp", category: "daily", build: lamp },
  { id: "chair", name: "Armchair", category: "daily", build: chair },
  { id: "camera", name: "Camera", category: "gadget", build: camera },
  { id: "globe", name: "Mini Globe", category: "planet", build: globe },
];

const VARIANTS = ["", " Prime", " Mk2", " Lite", " Neo", " Ultra", " Pro", " X"] as const;

export function shapeForIndex(index: number) {
  return SHAPE_LIBRARY[index % SHAPE_LIBRARY.length]!;
}

export function modelDisplayName(index: number): string {
  const shape = shapeForIndex(index);
  const variant = VARIANTS[Math.floor(index / SHAPE_LIBRARY.length) % VARIANTS.length] ?? "";
  return `${shape.name}${variant}`;
}

export function getMeshParts(shapeId: string, primary: string, accent: string): MeshPart[] {
  const shape = SHAPE_LIBRARY.find((s) => s.id === shapeId) ?? SHAPE_LIBRARY[0]!;
  return shape.build(primary, accent);
}
