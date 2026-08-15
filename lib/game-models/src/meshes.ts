import type { ModelCategory } from "./types.js";
import { EXTENDED_SHAPE_LIBRARY } from "./meshes-extended.js";

export type MeshPrim = "box" | "sphere" | "cyl" | "cone" | "torus" | "capsule";

/** PBR preset — drives realistic sheen/clearcoat in showcase renderer. */
export type MaterialProfile =
  | "default"
  | "fur"
  | "skin"
  | "food"
  | "food_glossy"
  | "metal"
  | "glass"
  | "rubber"
  | "fabric"
  | "liquid";

export interface MeshPart {
  id: string;
  prim: MeshPrim;
  x: number;
  y: number;
  z: number;
  rx?: number;
  ry?: number;
  rz?: number;
  /** box: w,h,d · sphere: radius · cyl: rTop, height, rBot · cone: r,h · torus: radius, tube · capsule: radius, length */
  sx: number;
  sy: number;
  sz: number;
  color: "p" | "a" | string;
  metal?: number;
  rough?: number;
  profile?: MaterialProfile;
}

function pt(
  id: string,
  prim: MeshPrim,
  x: number, y: number, z: number,
  sx: number, sy: number, sz: number,
  color: MeshPart["color"],
  extra?: Partial<Pick<MeshPart, "rx" | "ry" | "rz" | "metal" | "rough" | "profile">>,
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
const CHROME = "#c8d4e8";
const RUBBER = "#1e1e1e";

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
    pt("footL", "box", -0.16, 0.04, 0.04, 0.28, 0.08, 0.32, RUBBER, { rough: 0.85 }),
    pt("footR", "box", 0.16, 0.04, 0.04, 0.28, 0.08, 0.32, RUBBER, { rough: 0.85 }),
    pt("legL", "box", -0.16, 0.24, 0, 0.26, 0.42, 0.28, a),
    pt("legR", "box", 0.16, 0.24, 0, 0.26, 0.42, 0.28, a),
    pt("hips", "box", 0, 0.48, 0, 0.58, 0.14, 0.32, a),
    pt("belt", "box", 0, 0.54, 0.17, 0.52, 0.06, 0.04, DARK),
    pt("torso", "box", 0, 0.82, 0, 0.62, 0.52, 0.34, p),
    pt("chest", "box", 0, 0.84, 0.18, 0.22, 0.18, 0.04, a, { metal: 0.15 }),
    pt("armL", "cyl", -0.42, 0.78, 0, 0.1, 0.42, 0.1, YELLOW),
    pt("armR", "cyl", 0.42, 0.78, 0, 0.1, 0.42, 0.1, YELLOW),
    pt("handL", "sphere", -0.42, 0.54, 0, 0.11, 0.11, 0.11, YELLOW),
    pt("handR", "sphere", 0.42, 0.54, 0, 0.11, 0.11, 0.11, YELLOW),
    pt("head", "cyl", 0, 1.22, 0, 0.28, 0.32, 0.28, YELLOW),
    pt("stud", "cyl", 0, 1.42, 0, 0.12, 0.1, 0.12, YELLOW, { metal: 0.08 }),
    pt("eyeL", "box", -0.1, 1.24, 0.26, 0.08, 0.08, 0.04, DARK),
    pt("eyeR", "box", 0.1, 1.24, 0.26, 0.08, 0.08, 0.04, DARK),
    pt("pupilL", "box", -0.1, 1.24, 0.28, 0.04, 0.04, 0.02, WHITE),
    pt("pupilR", "box", 0.1, 1.24, 0.28, 0.04, 0.04, 0.02, WHITE),
    pt("smile", "box", 0, 1.12, 0.26, 0.16, 0.04, 0.03, DARK),
    pt("cheekL", "sphere", -0.16, 1.16, 0.22, 0.05, 0.05, 0.03, "#ffb8a8", { rough: 0.7 }),
    pt("cheekR", "sphere", 0.16, 1.16, 0.22, 0.05, 0.05, 0.03, "#ffb8a8", { rough: 0.7 }),
  ];
}

function plumber(p: string, a: string): MeshPart[] {
  const shirt = p || RED;
  const cap = a || RED;
  return [
    pt("shoeL", "box", -0.16, 0.06, 0.1, 0.24, 0.1, 0.36, BROWN, { rough: 0.75 }),
    pt("shoeR", "box", 0.16, 0.06, 0.1, 0.24, 0.1, 0.36, BROWN, { rough: 0.75 }),
    pt("legL", "box", -0.15, 0.32, 0, 0.22, 0.4, 0.24, BLUE),
    pt("legR", "box", 0.15, 0.32, 0, 0.22, 0.4, 0.24, BLUE),
    pt("overalls", "box", 0, 0.62, 0.16, 0.48, 0.28, 0.06, BLUE),
    pt("torso", "box", 0, 0.78, 0, 0.5, 0.5, 0.32, BLUE),
    pt("strapL", "box", -0.16, 0.86, 0.17, 0.1, 0.42, 0.04, cap),
    pt("strapR", "box", 0.16, 0.86, 0.17, 0.1, 0.42, 0.04, cap),
    pt("buckle", "box", 0, 0.58, 0.19, 0.1, 0.08, 0.04, YELLOW, { metal: 0.85 }),
    pt("shirt", "box", 0, 1.02, 0, 0.52, 0.18, 0.34, shirt),
    pt("btn1", "sphere", 0, 0.96, 0.18, 0.04, 0.04, 0.04, YELLOW, { metal: 0.6 }),
    pt("btn2", "sphere", 0, 0.88, 0.18, 0.04, 0.04, 0.04, YELLOW, { metal: 0.6 }),
    pt("armL", "cyl", -0.36, 0.86, 0, 0.09, 0.36, 0.09, shirt),
    pt("armR", "cyl", 0.36, 0.86, 0, 0.09, 0.36, 0.09, shirt),
    pt("gloveL", "sphere", -0.36, 0.64, 0.05, 0.1, 0.1, 0.1, WHITE, { rough: 0.65 }),
    pt("gloveR", "sphere", 0.36, 0.64, 0.05, 0.1, 0.1, 0.1, WHITE, { rough: 0.65 }),
    pt("head", "sphere", 0, 1.28, 0, 0.26, 0.26, 0.26, SKIN, { rough: 0.55 }),
    pt("nose", "sphere", 0, 1.24, 0.22, 0.08, 0.08, 0.08, SKIN),
    pt("stache", "box", 0, 1.18, 0.22, 0.28, 0.06, 0.08, DARK),
    pt("eyeL", "sphere", -0.1, 1.3, 0.2, 0.04, 0.04, 0.04, DARK),
    pt("eyeR", "sphere", 0.1, 1.3, 0.2, 0.04, 0.04, 0.04, DARK),
    pt("cap", "cyl", 0, 1.48, 0, 0.3, 0.12, 0.3, cap),
    pt("brim", "box", 0, 1.42, 0.22, 0.38, 0.05, 0.16, cap),
    pt("emblem", "box", 0, 1.5, 0.24, 0.08, 0.08, 0.02, WHITE),
  ];
}

function ninja(p: string, a: string): MeshPart[] {
  return [
    pt("tabiL", "box", -0.14, 0.06, 0.06, 0.22, 0.08, 0.28, DARK, { rough: 0.8 }),
    pt("tabiR", "box", 0.14, 0.06, 0.06, 0.22, 0.08, 0.28, DARK, { rough: 0.8 }),
    pt("legL", "box", -0.14, 0.28, 0, 0.2, 0.52, 0.22, DARK),
    pt("legR", "box", 0.14, 0.28, 0, 0.2, 0.52, 0.22, DARK),
    pt("torso", "box", 0, 0.78, 0, 0.46, 0.48, 0.28, p),
    pt("ob", "box", 0, 0.62, 0.16, 0.5, 0.1, 0.06, a),
    pt("sash", "box", 0, 0.56, 0.15, 0.44, 0.06, 0.08, a, { metal: 0.2 }),
    pt("armL", "cyl", -0.32, 0.78, 0, 0.08, 0.38, 0.08, DARK),
    pt("armR", "cyl", 0.32, 0.78, 0, 0.08, 0.38, 0.08, DARK),
    pt("head", "sphere", 0, 1.18, 0, 0.22, 0.22, 0.22, SKIN, { rough: 0.55 }),
    pt("mask", "box", 0, 1.14, 0.18, 0.36, 0.16, 0.08, p),
    pt("eyeL", "box", -0.08, 1.16, 0.24, 0.08, 0.05, 0.03, WHITE),
    pt("eyeR", "box", 0.08, 1.16, 0.24, 0.08, 0.05, 0.03, WHITE),
    pt("blade", "box", 0.52, 0.72, 0, 0.04, 0.78, 0.04, CHROME, { metal: 0.95, rough: 0.12 }),
    pt("guard", "box", 0.48, 0.72, 0, 0.08, 0.06, 0.1, a, { metal: 0.75 }),
    pt("hilt", "cyl", 0.44, 0.72, 0, 0.04, 0.14, 0.04, DARK, { metal: 0.5 }),
  ];
}

function robot(p: string, a: string): MeshPart[] {
  return [
    pt("footL", "box", -0.18, 0.04, 0.06, 0.24, 0.08, 0.28, DARK, { metal: 0.7, rough: 0.35 }),
    pt("footR", "box", 0.18, 0.04, 0.06, 0.24, 0.08, 0.28, DARK, { metal: 0.7, rough: 0.35 }),
    pt("legL", "box", -0.18, 0.22, 0, 0.22, 0.4, 0.24, p, { metal: 0.65 }),
    pt("legR", "box", 0.18, 0.22, 0, 0.22, 0.4, 0.24, p, { metal: 0.65 }),
    pt("torso", "box", 0, 0.72, 0, 0.58, 0.5, 0.38, p, { metal: 0.7, rough: 0.25 }),
    pt("chest", "box", 0, 0.76, 0.2, 0.28, 0.22, 0.06, a, { metal: 0.45 }),
    pt("ventL", "box", -0.18, 0.74, 0.2, 0.06, 0.14, 0.04, DARK),
    pt("ventR", "box", 0.18, 0.74, 0.2, 0.06, 0.14, 0.04, DARK),
    pt("shoulderL", "sphere", -0.38, 0.88, 0, 0.12, 0.12, 0.12, p, { metal: 0.75 }),
    pt("shoulderR", "sphere", 0.38, 0.88, 0, 0.12, 0.12, 0.12, p, { metal: 0.75 }),
    pt("armL", "box", -0.42, 0.7, 0, 0.16, 0.46, 0.16, p, { metal: 0.6 }),
    pt("armR", "box", 0.42, 0.7, 0, 0.16, 0.46, 0.16, p, { metal: 0.6 }),
    pt("head", "box", 0, 1.14, 0, 0.4, 0.34, 0.34, a, { metal: 0.65 }),
    pt("eyeL", "cyl", -0.1, 1.16, 0.18, 0.07, 0.06, 0.07, "#00ff88", { rx: 1.57 }),
    pt("eyeR", "cyl", 0.1, 1.16, 0.18, 0.07, 0.06, 0.07, "#00ff88", { rx: 1.57 }),
    pt("antBase", "cyl", 0.12, 1.34, 0, 0.05, 0.06, 0.05, DARK, { metal: 0.5 }),
    pt("ant", "cyl", 0.12, 1.44, 0, 0.03, 0.22, 0.03, DARK),
    pt("antTip", "sphere", 0.12, 1.56, 0, 0.05, 0.05, 0.05, a),
  ];
}

function knight(p: string, a: string): MeshPart[] {
  return [
    pt("bootL", "box", -0.14, 0.06, 0.04, 0.24, 0.12, 0.28, p, { metal: 0.85, rough: 0.28 }),
    pt("bootR", "box", 0.14, 0.06, 0.04, 0.24, 0.12, 0.28, p, { metal: 0.85, rough: 0.28 }),
    pt("legL", "box", -0.14, 0.26, 0, 0.22, 0.48, 0.24, p, { metal: 0.8, rough: 0.3 }),
    pt("legR", "box", 0.14, 0.26, 0, 0.22, 0.48, 0.24, p, { metal: 0.8, rough: 0.3 }),
    pt("torso", "box", 0, 0.78, 0, 0.5, 0.5, 0.32, p, { metal: 0.85, rough: 0.25 }),
    pt("pauldronL", "sphere", -0.34, 0.96, 0, 0.14, 0.1, 0.14, p, { metal: 0.9, rough: 0.22 }),
    pt("pauldronR", "sphere", 0.34, 0.96, 0, 0.14, 0.1, 0.14, p, { metal: 0.9, rough: 0.22 }),
    pt("helm", "sphere", 0, 1.22, 0, 0.24, 0.24, 0.24, a, { metal: 0.9, rough: 0.2 }),
    pt("visor", "box", 0, 1.2, 0.18, 0.32, 0.1, 0.08, DARK),
    pt("crest", "box", 0, 1.46, 0, 0.06, 0.22, 0.28, RED),
    pt("shield", "box", -0.46, 0.7, 0.08, 0.08, 0.5, 0.38, a, { metal: 0.5 }),
    pt("shieldBoss", "sphere", -0.46, 0.72, 0.28, 0.06, 0.06, 0.06, CHROME, { metal: 0.95 }),
    pt("swordBlade", "box", 0.42, 0.72, 0, 0.05, 0.72, 0.05, CHROME, { metal: 0.95, rough: 0.15 }),
    pt("swordGuard", "box", 0.42, 0.38, 0, 0.14, 0.04, 0.04, a, { metal: 0.8 }),
    pt("swordGrip", "cyl", 0.42, 0.32, 0, 0.04, 0.12, 0.04, BROWN, { rough: 0.7 }),
  ];
}

function supercar(p: string, a: string): MeshPart[] {
  return [
    pt("body", "box", 0, 0.28, 0, 1.5, 0.28, 0.7, p, { metal: 0.75, rough: 0.22 }),
    pt("sideSkirtL", "box", 0, 0.18, 0.36, 1.2, 0.08, 0.04, DARK, { metal: 0.6 }),
    pt("sideSkirtR", "box", 0, 0.18, -0.36, 1.2, 0.08, 0.04, DARK, { metal: 0.6 }),
    pt("cabin", "box", -0.1, 0.52, 0, 0.7, 0.22, 0.62, a, { metal: 0.3, rough: 0.15 }),
    pt("wind", "box", 0.22, 0.52, 0, 0.28, 0.18, 0.58, GLASS, { metal: 0.1, rough: 0.05 }),
    pt("hood", "box", 0.52, 0.36, 0, 0.42, 0.12, 0.64, p, { metal: 0.8 }),
    pt("hoodVent", "box", 0.38, 0.42, 0, 0.12, 0.04, 0.24, DARK),
    pt("spoiler", "box", -0.72, 0.5, 0, 0.08, 0.08, 0.72, a),
    pt("spoilerStrutL", "box", -0.68, 0.42, 0.28, 0.04, 0.12, 0.04, DARK),
    pt("spoilerStrutR", "box", -0.68, 0.42, -0.28, 0.04, 0.12, 0.04, DARK),
    pt("wFL", "cyl", 0.48, 0.16, 0.4, 0.16, 0.12, 0.16, RUBBER, { rz: 1.57, rough: 0.9 }),
    pt("wFR", "cyl", 0.48, 0.16, -0.4, 0.16, 0.12, 0.16, RUBBER, { rz: 1.57, rough: 0.9 }),
    pt("wRL", "cyl", -0.5, 0.16, 0.4, 0.18, 0.12, 0.18, RUBBER, { rz: 1.57, rough: 0.9 }),
    pt("wRR", "cyl", -0.5, 0.16, -0.4, 0.18, 0.12, 0.18, RUBBER, { rz: 1.57, rough: 0.9 }),
    pt("hubFL", "cyl", 0.48, 0.16, 0.4, 0.08, 0.04, 0.08, CHROME, { rz: 1.57, metal: 0.95 }),
    pt("hubFR", "cyl", 0.48, 0.16, -0.4, 0.08, 0.04, 0.08, CHROME, { rz: 1.57, metal: 0.95 }),
    pt("lightL", "box", 0.76, 0.3, 0.22, 0.04, 0.08, 0.12, YELLOW),
    pt("lightR", "box", 0.76, 0.3, -0.22, 0.04, 0.08, 0.12, YELLOW),
    pt("tailL", "box", -0.76, 0.32, 0.22, 0.04, 0.06, 0.1, RED),
    pt("tailR", "box", -0.76, 0.32, -0.22, 0.04, 0.06, 0.1, RED),
    pt("exhaustL", "cyl", -0.72, 0.22, 0.18, 0.04, 0.08, 0.04, CHROME, { metal: 0.9 }),
    pt("exhaustR", "cyl", -0.72, 0.22, -0.18, 0.04, 0.08, 0.04, CHROME, { metal: 0.9 }),
  ];
}

function motorcycle(p: string, a: string): MeshPart[] {
  return [
    pt("wF", "cyl", 0.42, 0.28, 0, 0.26, 0.1, 0.26, RUBBER, { rz: 1.57, rough: 0.9 }),
    pt("wR", "cyl", -0.42, 0.28, 0, 0.28, 0.1, 0.28, RUBBER, { rz: 1.57, rough: 0.9 }),
    pt("hubF", "cyl", 0.42, 0.28, 0, 0.1, 0.04, 0.1, CHROME, { rz: 1.57, metal: 0.95 }),
    pt("hubR", "cyl", -0.42, 0.28, 0, 0.12, 0.04, 0.12, CHROME, { rz: 1.57, metal: 0.95 }),
    pt("forkL", "cyl", 0.42, 0.48, 0.08, 0.03, 0.42, 0.03, CHROME, { metal: 0.85 }),
    pt("forkR", "cyl", 0.42, 0.48, -0.08, 0.03, 0.42, 0.03, CHROME, { metal: 0.85 }),
    pt("body", "box", 0, 0.38, 0, 0.7, 0.18, 0.22, p, { metal: 0.7 }),
    pt("tank", "sphere", 0.08, 0.5, 0, 0.2, 0.16, 0.16, a, { metal: 0.65 }),
    pt("tankCap", "cyl", 0.08, 0.62, 0, 0.04, 0.06, 0.04, DARK, { metal: 0.5 }),
    pt("seat", "box", -0.18, 0.48, 0, 0.32, 0.08, 0.2, DARK, { rough: 0.75 }),
    pt("bar", "cyl", 0.32, 0.62, 0, 0.03, 0.42, 0.03, CHROME, { rz: 1.57, metal: 0.85 }),
    pt("gripL", "cyl", 0.52, 0.62, 0.1, 0.04, 0.08, 0.04, DARK, { rough: 0.8 }),
    pt("gripR", "cyl", 0.52, 0.62, -0.1, 0.04, 0.08, 0.04, DARK, { rough: 0.8 }),
    pt("headlight", "sphere", 0.52, 0.42, 0, 0.06, 0.06, 0.06, YELLOW),
    pt("pipe", "cyl", -0.1, 0.22, 0.16, 0.04, 0.5, 0.04, CHROME, { rz: 1.2, metal: 0.9 }),
    pt("pipeTip", "cyl", -0.38, 0.12, 0.22, 0.05, 0.08, 0.05, DARK, { metal: 0.6 }),
  ];
}

function rocket(p: string, a: string): MeshPart[] {
  return [
    pt("body", "cyl", 0, 0.7, 0, 0.28, 1.1, 0.28, p, { metal: 0.55 }),
    pt("stripe1", "box", 0, 0.5, 0.29, 0.04, 0.5, 0.04, a),
    pt("stripe2", "box", 0, 0.9, 0.29, 0.04, 0.5, 0.04, a),
    pt("nose", "cone", 0, 1.5, 0, 0.28, 0.5, 0.28, a, { metal: 0.4 }),
    pt("finL", "box", -0.32, 0.28, 0, 0.22, 0.36, 0.06, a),
    pt("finR", "box", 0.32, 0.28, 0, 0.22, 0.36, 0.06, a),
    pt("finB", "box", 0, 0.28, -0.32, 0.06, 0.36, 0.22, a),
    pt("win", "box", 0, 1.05, 0.26, 0.16, 0.14, 0.04, GLASS),
    pt("winFrame", "box", 0, 1.05, 0.28, 0.18, 0.16, 0.02, DARK, { metal: 0.5 }),
    pt("nozzle", "cyl", 0, 0.08, 0, 0.2, 0.1, 0.2, DARK, { metal: 0.7 }),
    pt("flame", "cone", 0, -0.05, 0, 0.16, 0.28, 0.16, "#ff8a3d"),
    pt("flameCore", "cone", 0, 0.02, 0, 0.1, 0.18, 0.1, "#ffdd44"),
  ];
}

function helicopter(p: string, a: string): MeshPart[] {
  return [
    pt("body", "sphere", 0, 0.4, 0, 0.38, 0.28, 0.28, p, { metal: 0.45 }),
    pt("nose", "cone", 0.32, 0.42, 0, 0.14, 0.22, 0.14, p, { rz: -1.57 }),
    pt("tail", "box", -0.7, 0.42, 0, 0.7, 0.1, 0.1, p),
    pt("tailR", "box", -1.02, 0.55, 0, 0.08, 0.28, 0.22, a),
    pt("tailRotor", "box", -1.02, 0.68, 0, 0.04, 0.04, 0.32, DARK),
    pt("skidL", "box", 0.05, 0.12, 0.22, 0.7, 0.04, 0.06, DARK, { metal: 0.5 }),
    pt("skidR", "box", 0.05, 0.12, -0.22, 0.7, 0.04, 0.06, DARK, { metal: 0.5 }),
    pt("skidPostL", "cyl", 0.2, 0.22, 0.22, 0.03, 0.18, 0.03, DARK),
    pt("skidPostR", "cyl", 0.2, 0.22, -0.22, 0.03, 0.18, 0.03, DARK),
    pt("mast", "cyl", 0, 0.72, 0, 0.04, 0.18, 0.04, DARK, { metal: 0.6 }),
    pt("blade", "box", 0, 0.82, 0, 1.6, 0.04, 0.1, a),
    pt("blade2", "box", 0, 0.82, 0, 0.1, 0.04, 1.6, a),
    pt("win", "box", 0.22, 0.46, 0, 0.18, 0.16, 0.32, GLASS),
    pt("winFrame", "box", 0.22, 0.46, 0, 0.2, 0.18, 0.34, DARK, { metal: 0.4 }),
    pt("light", "sphere", 0.38, 0.44, 0, 0.05, 0.05, 0.05, YELLOW),
  ];
}

function wineGlass(_p: string, a: string): MeshPart[] {
  return [
    pt("base", "cyl", 0, 0.06, 0, 0.32, 0.06, 0.32, WHITE, { metal: 0.2, rough: 0.1 }),
    pt("stem", "cyl", 0, 0.42, 0, 0.05, 0.66, 0.05, WHITE, { metal: 0.15, rough: 0.08 }),
    pt("bowl", "cyl", 0, 0.92, 0, 0.28, 0.38, 0.18, GLASS, { metal: 0.05, rough: 0.05 }),
    pt("wine", "cyl", 0, 0.82, 0, 0.22, 0.2, 0.16, a || WINE, { metal: 0.05, rough: 0.28, profile: "liquid" }),
    pt("meniscus", "sphere", 0, 0.92, 0, 0.2, 0.04, 0.14, a || WINE, { rough: 0.35, profile: "liquid" }),
    pt("rim", "torus", 0, 1.1, 0, 0.26, 0.02, 0.26, WHITE, { metal: 0.2 }),
    pt("highlight", "box", 0.08, 0.88, 0.14, 0.04, 0.2, 0.02, WHITE, { metal: 0.1 }),
  ];
}

function burger(_p: string, a: string): MeshPart[] {
  const bread = "#e8b050";
  const breadLight = "#f0c868";
  const R = 0.5;
  return [
    // panino basso — sempre colore pane dorato (mai il primary grigio del catalogo)
    pt("bunBot", "cyl", 0, 0.05, 0, R, 0.1, R, bread, { rough: 0.52, profile: "food_glossy" }),
    pt("bunBotTop", "sphere", 0, 0.105, 0, R * 0.93, 0.055, R * 0.93, breadLight, { rough: 0.5, profile: "food_glossy" }),

    // hamburger
    pt("patty", "cyl", 0, 0.2, 0, R * 1.02, 0.11, R * 1.02, "#5a3820", { rough: 0.82, profile: "food" }),

    // insalata
    pt("lettuce1", "box", 0, 0.265, 0, R * 1.1, 0.022, R * 0.9, "#5cb85c", { profile: "food", ry: 0.06 }),
    pt("lettuce2", "box", -0.36, 0.27, 0.05, 0.18, 0.02, 0.11, "#6ecf72", { profile: "food", ry: 0.32 }),
    pt("lettuce3", "box", 0.34, 0.268, -0.04, 0.16, 0.02, 0.1, "#6ecf72", { profile: "food", ry: -0.28 }),

    // pomodoro
    pt("tomato", "cyl", 0, 0.3, 0, R * 0.88, 0.048, R * 0.88, "#e53935", { rough: 0.4, profile: "food_glossy" }),

    // panino alto chiuso
    pt("bunTopSkirt", "cyl", 0, 0.345, 0, R * 0.98, 0.11, R * 0.98, bread, { rough: 0.52, profile: "food_glossy" }),
    pt("bunTopSeal", "cyl", 0, 0.295, 0, R * 0.94, 0.025, R * 0.94, breadLight, { rough: 0.5, profile: "food_glossy" }),
    pt("bunTopDome", "cone", 0, 0.415, 0, R * 0.94, 0.065, R * 0.94, bread, { rx: Math.PI, rough: 0.5, profile: "food_glossy" }),

    pt("seed1", "sphere", -0.14, 0.435, 0.1, 0.02, 0.02, 0.02, "#fafafa", { profile: "food_glossy" }),
    pt("seed2", "sphere", 0.11, 0.44, -0.08, 0.018, 0.018, 0.018, "#fafafa", { profile: "food_glossy" }),
    pt("seed3", "sphere", 0, 0.442, 0.12, 0.016, 0.016, 0.016, a || "#fafafa", { profile: "food_glossy" }),
  ];
}

function mug(p: string, a: string): MeshPart[] {
  return [
    pt("cup", "cyl", 0, 0.38, 0, 0.32, 0.7, 0.32, p, { rough: 0.55 }),
    pt("rim", "torus", 0, 0.72, 0, 0.32, 0.03, 0.32, p, { metal: 0.1 }),
    pt("inner", "cyl", 0, 0.55, 0, 0.24, 0.4, 0.24, a || BROWN, { rough: 0.4 }),
    pt("steam1", "cyl", -0.06, 0.88, 0.04, 0.02, 0.12, 0.02, WHITE, { rough: 0.9 }),
    pt("steam2", "cyl", 0.08, 0.92, -0.02, 0.02, 0.1, 0.02, WHITE, { rough: 0.9 }),
    pt("handle", "torus", 0.38, 0.38, 0, 0.16, 0.05, 0.16, p, { rz: 1.57 }),
    pt("base", "cyl", 0, 0.04, 0, 0.34, 0.06, 0.34, p),
    pt("logo", "box", 0, 0.42, 0.33, 0.12, 0.12, 0.02, a),
  ];
}

function donut(p: string, a: string): MeshPart[] {
  return [
    pt("dough", "torus", 0, 0.28, 0, 0.38, 0.16, 0.38, "#d4a056", { rough: 0.6, profile: "food" }),
    pt("icing", "torus", 0, 0.38, 0, 0.36, 0.1, 0.36, p, { rough: 0.35, profile: "food_glossy" }),
    pt("drip1", "sphere", 0.22, 0.32, 0.08, 0.06, 0.08, 0.06, p),
    pt("drip2", "sphere", -0.2, 0.3, -0.1, 0.05, 0.07, 0.05, p),
    pt("spr1", "box", 0.2, 0.5, 0.1, 0.04, 0.04, 0.12, a, { ry: 0.6 }),
    pt("spr2", "box", -0.18, 0.5, 0.16, 0.04, 0.04, 0.12, RED, { ry: -0.4 }),
    pt("spr3", "box", 0.05, 0.52, -0.22, 0.04, 0.04, 0.12, YELLOW),
    pt("spr4", "box", -0.22, 0.5, -0.08, 0.04, 0.04, 0.12, BLUE),
    pt("spr5", "box", 0.12, 0.48, 0.2, 0.04, 0.04, 0.12, a, { ry: 1.2 }),
  ];
}

function skyscraper(p: string, a: string): MeshPart[] {
  return [
    pt("base", "box", 0, 0.2, 0, 0.9, 0.4, 0.7, "#3a3a3a", { metal: 0.3 }),
    pt("lobby", "box", 0, 0.42, 0.36, 0.5, 0.24, 0.04, GLASS),
    pt("mid", "box", 0, 1.0, 0, 0.72, 1.2, 0.58, p),
    pt("ledge1", "box", 0, 0.62, 0.3, 0.74, 0.04, 0.04, DARK),
    pt("ledge2", "box", 0, 1.22, 0.3, 0.74, 0.04, 0.04, DARK),
    pt("top", "box", 0, 1.85, 0, 0.5, 0.5, 0.42, a),
    pt("ant", "cyl", 0, 2.28, 0, 0.04, 0.4, 0.04, DARK, { metal: 0.6 }),
    pt("antTip", "sphere", 0, 2.5, 0, 0.04, 0.04, 0.04, RED),
    pt("w1", "box", 0, 0.7, 0.3, 0.5, 0.12, 0.04, GLASS),
    pt("w2", "box", 0, 1.0, 0.3, 0.5, 0.12, 0.04, GLASS),
    pt("w3", "box", 0, 1.3, 0.3, 0.5, 0.12, 0.04, GLASS),
    pt("w4", "box", 0, 1.6, 0.3, 0.36, 0.1, 0.04, GLASS),
    pt("w5", "box", 0.37, 1.0, 0, 0.04, 0.9, 0.36, GLASS),
    pt("w6", "box", -0.37, 1.0, 0, 0.04, 0.9, 0.36, GLASS),
  ];
}

function house(p: string, a: string): MeshPart[] {
  return [
    pt("foundation", "box", 0, 0.08, 0, 0.96, 0.12, 0.76, "#555"),
    pt("body", "box", 0, 0.4, 0, 0.9, 0.7, 0.7, p),
    pt("roof", "cone", 0, 1.05, 0, 0.72, 0.45, 0.72, a),
    pt("chimCap", "box", 0.28, 1.32, -0.1, 0.16, 0.06, 0.16, "#444"),
    pt("door", "box", 0, 0.28, 0.36, 0.22, 0.4, 0.04, BROWN, { rough: 0.7 }),
    pt("knob", "sphere", 0.08, 0.28, 0.38, 0.03, 0.03, 0.03, YELLOW, { metal: 0.8 }),
    pt("winL", "box", -0.28, 0.5, 0.36, 0.18, 0.16, 0.04, GLASS),
    pt("winR", "box", 0.28, 0.5, 0.36, 0.18, 0.16, 0.04, GLASS),
    pt("frameL", "box", -0.28, 0.5, 0.37, 0.2, 0.18, 0.02, WHITE),
    pt("frameR", "box", 0.28, 0.5, 0.37, 0.2, 0.18, 0.02, WHITE),
    pt("chim", "box", 0.28, 1.15, -0.1, 0.14, 0.28, 0.14, "#555"),
    pt("step", "box", 0, 0.04, 0.42, 0.28, 0.04, 0.12, "#666"),
  ];
}

function castle(p: string, a: string): MeshPart[] {
  return [
    pt("wallL", "box", -0.55, 0.35, 0, 0.12, 0.6, 0.82, p),
    pt("wallR", "box", 0.55, 0.35, 0, 0.12, 0.6, 0.82, p),
    pt("keep", "box", 0, 0.5, 0, 0.8, 0.9, 0.8, p),
    pt("merlon1", "box", -0.3, 0.98, 0.42, 0.12, 0.1, 0.12, a),
    pt("merlon2", "box", 0, 0.98, 0.42, 0.12, 0.1, 0.12, a),
    pt("merlon3", "box", 0.3, 0.98, 0.42, 0.12, 0.1, 0.12, a),
    pt("tL", "cyl", -0.5, 0.7, 0.5, 0.18, 1.3, 0.18, a),
    pt("tR", "cyl", 0.5, 0.7, 0.5, 0.18, 1.3, 0.18, a),
    pt("tB", "cyl", -0.5, 0.55, -0.5, 0.16, 1.0, 0.16, a),
    pt("tLcap", "cone", -0.5, 1.42, 0.5, 0.2, 0.18, 0.2, a),
    pt("tRcap", "cone", 0.5, 1.42, 0.5, 0.2, 0.18, 0.2, a),
    pt("gate", "box", 0, 0.28, 0.42, 0.28, 0.4, 0.08, DARK),
    pt("portcullis", "box", 0, 0.38, 0.44, 0.22, 0.22, 0.02, CHROME, { metal: 0.7 }),
    pt("flag", "box", 0.5, 1.5, 0.5, 0.22, 0.12, 0.04, RED),
    pt("pole", "cyl", 0.5, 1.42, 0.5, 0.03, 0.28, 0.03, DARK, { metal: 0.4 }),
  ];
}

function dog(p: string, a: string): MeshPart[] {
  return [
    pt("body", "box", 0, 0.32, 0, 0.7, 0.32, 0.36, p, { rough: 0.65 }),
    pt("chest", "box", 0.18, 0.36, 0, 0.28, 0.24, 0.32, a),
    pt("head", "box", 0.42, 0.48, 0, 0.32, 0.28, 0.3, p),
    pt("snout", "box", 0.62, 0.4, 0, 0.16, 0.14, 0.18, a),
    pt("earL", "cone", 0.38, 0.7, 0.12, 0.08, 0.2, 0.08, a),
    pt("earR", "cone", 0.38, 0.7, -0.12, 0.08, 0.2, 0.08, a),
    pt("collar", "torus", 0.28, 0.44, 0, 0.14, 0.03, 0.14, RED),
    pt("tag", "box", 0.28, 0.38, 0.14, 0.04, 0.06, 0.02, YELLOW, { metal: 0.7 }),
    pt("leg1", "cyl", 0.22, 0.12, 0.12, 0.07, 0.22, 0.07, p),
    pt("leg2", "cyl", 0.22, 0.12, -0.12, 0.07, 0.22, 0.07, p),
    pt("leg3", "cyl", -0.22, 0.12, 0.12, 0.07, 0.22, 0.07, p),
    pt("leg4", "cyl", -0.22, 0.12, -0.12, 0.07, 0.22, 0.07, p),
    pt("paw1", "sphere", 0.22, 0.02, 0.12, 0.06, 0.04, 0.06, DARK),
    pt("paw2", "sphere", 0.22, 0.02, -0.12, 0.06, 0.04, 0.06, DARK),
    pt("tail", "cyl", -0.4, 0.48, 0, 0.05, 0.28, 0.05, a, { rz: 0.8 }),
    pt("nose", "sphere", 0.72, 0.42, 0, 0.05, 0.05, 0.05, DARK),
    pt("eyeL", "sphere", 0.52, 0.54, 0.12, 0.04, 0.04, 0.04, DARK),
    pt("eyeR", "sphere", 0.52, 0.54, -0.12, 0.04, 0.04, 0.04, DARK),
  ];
}

function cat(p: string, a: string): MeshPart[] {
  const fur = p || "#c8843a";
  const dark = a || "#8b5a2a";
  return [
    pt("hip", "sphere", 0, 0.2, -0.08, 0.24, 0.16, 0.22, fur, { rough: 0.75, profile: "fur" }),
    pt("body", "sphere", 0, 0.38, 0, 0.26, 0.3, 0.24, fur, { rough: 0.75, profile: "fur" }),
    pt("chest", "sphere", 0, 0.36, 0.12, 0.18, 0.2, 0.14, "#faf0e6", { profile: "fur" }),
    pt("stripe1", "box", 0, 0.42, 0.14, 0.08, 0.14, 0.02, dark, { profile: "fur" }),
    pt("stripe2", "box", -0.06, 0.34, 0.13, 0.06, 0.1, 0.02, dark, { profile: "fur" }),
    pt("pawFL", "capsule", -0.14, 0.1, 0.2, 0.055, 0.16, 0.055, fur, { profile: "fur" }),
    pt("pawFR", "capsule", 0.14, 0.1, 0.2, 0.055, 0.16, 0.055, fur, { profile: "fur" }),
    pt("padFL", "sphere", -0.14, 0.03, 0.24, 0.07, 0.025, 0.06, "#f0dcc8", { profile: "skin" }),
    pt("padFR", "sphere", 0.14, 0.03, 0.24, 0.07, 0.025, 0.06, "#f0dcc8", { profile: "skin" }),
    pt("toeFL1", "sphere", -0.18, 0.02, 0.28, 0.022, 0.018, 0.022, "#f0dcc8", { profile: "skin" }),
    pt("toeFL2", "sphere", -0.14, 0.02, 0.3, 0.022, 0.018, 0.022, "#f0dcc8", { profile: "skin" }),
    pt("toeFR1", "sphere", 0.18, 0.02, 0.28, 0.022, 0.018, 0.022, "#f0dcc8", { profile: "skin" }),
    pt("toeFR2", "sphere", 0.14, 0.02, 0.3, 0.022, 0.018, 0.022, "#f0dcc8", { profile: "skin" }),
    pt("head", "sphere", 0, 0.58, 0.04, 0.24, 0.22, 0.22, fur, { rough: 0.72, profile: "fur" }),
    pt("cheekL", "sphere", -0.14, 0.54, 0.14, 0.09, 0.08, 0.07, fur, { profile: "fur" }),
    pt("cheekR", "sphere", 0.14, 0.54, 0.14, 0.09, 0.08, 0.07, fur, { profile: "fur" }),
    pt("muzzle", "sphere", 0, 0.52, 0.24, 0.11, 0.09, 0.1, "#f0dcc8", { profile: "skin" }),
    pt("earL", "cone", -0.13, 0.76, 0.06, 0.08, 0.16, 0.08, fur, { profile: "fur" }),
    pt("earR", "cone", 0.13, 0.76, 0.06, 0.08, 0.16, 0.08, fur, { profile: "fur" }),
    pt("earInL", "cone", -0.13, 0.74, 0.06, 0.045, 0.11, 0.045, "#ffb8b8", { profile: "skin" }),
    pt("earInR", "cone", 0.13, 0.74, 0.06, 0.045, 0.11, 0.045, "#ffb8b8", { profile: "skin" }),
    pt("whiskerL1", "cyl", -0.06, 0.5, 0.28, 0.006, 0.2, 0.006, WHITE, { rz: 0.12 }),
    pt("whiskerL2", "cyl", -0.02, 0.48, 0.3, 0.006, 0.18, 0.006, WHITE, { rz: 0.04 }),
    pt("whiskerL3", "cyl", 0.02, 0.46, 0.28, 0.006, 0.16, 0.006, WHITE, { rz: -0.06 }),
    pt("whiskerR1", "cyl", 0.06, 0.5, 0.28, 0.006, 0.2, 0.006, WHITE, { rz: -0.12 }),
    pt("whiskerR2", "cyl", 0.02, 0.48, 0.3, 0.006, 0.18, 0.006, WHITE, { rz: -0.04 }),
    pt("whiskerR3", "cyl", -0.02, 0.46, 0.28, 0.006, 0.16, 0.006, WHITE, { rz: 0.06 }),
    pt("eyeL", "sphere", -0.09, 0.6, 0.2, 0.038, 0.042, 0.038, "#88cc44", { profile: "glass" }),
    pt("eyeR", "sphere", 0.09, 0.6, 0.2, 0.038, 0.042, 0.038, "#88cc44", { profile: "glass" }),
    pt("pupilL", "sphere", -0.09, 0.6, 0.23, 0.018, 0.024, 0.018, DARK),
    pt("pupilR", "sphere", 0.09, 0.6, 0.23, 0.018, 0.024, 0.018, DARK),
    pt("shineL", "sphere", -0.1, 0.62, 0.24, 0.008, 0.008, 0.008, WHITE),
    pt("shineR", "sphere", 0.08, 0.62, 0.24, 0.008, 0.008, 0.008, WHITE),
    pt("nose", "sphere", 0, 0.5, 0.32, 0.028, 0.022, 0.028, "#ffb0b0", { profile: "skin" }),
    pt("mouthL", "box", -0.03, 0.46, 0.32, 0.025, 0.008, 0.008, DARK),
    pt("mouthR", "box", 0.03, 0.46, 0.32, 0.025, 0.008, 0.008, DARK),
    pt("tail1", "capsule", 0.06, 0.3, -0.24, 0.055, 0.14, 0.055, fur, { rz: -0.5, profile: "fur" }),
    pt("tail2", "capsule", 0.14, 0.4, -0.32, 0.05, 0.16, 0.05, fur, { rz: -0.9, profile: "fur" }),
    pt("tail3", "capsule", 0.1, 0.52, -0.28, 0.045, 0.14, 0.045, dark, { rz: -1.3, profile: "fur" }),
  ];
}

function penguin(p: string, _a: string): MeshPart[] {
  const wing = p || DARK;
  return [
    pt("body", "sphere", 0, 0.5, 0, 0.32, 0.42, 0.28, DARK, { rough: 0.55 }),
    pt("belly", "sphere", 0, 0.48, 0.12, 0.22, 0.32, 0.16, WHITE),
    pt("head", "sphere", 0, 0.92, 0, 0.24, 0.22, 0.22, DARK),
    pt("beak", "cone", 0, 0.88, 0.24, 0.08, 0.16, 0.08, "#ff9800", { rx: 1.57 }),
    pt("beakTip", "cone", 0, 0.86, 0.32, 0.04, 0.08, 0.04, "#e65100", { rx: 1.57 }),
    pt("eyeL", "sphere", -0.08, 0.96, 0.16, 0.04, 0.04, 0.04, WHITE),
    pt("eyeR", "sphere", 0.08, 0.96, 0.16, 0.04, 0.04, 0.04, WHITE),
    pt("pupilL", "sphere", -0.08, 0.96, 0.18, 0.02, 0.02, 0.02, DARK),
    pt("pupilR", "sphere", 0.08, 0.96, 0.18, 0.02, 0.02, 0.02, DARK),
    pt("flipL", "box", -0.32, 0.5, 0, 0.1, 0.32, 0.08, wing),
    pt("flipR", "box", 0.32, 0.5, 0, 0.1, 0.32, 0.08, wing),
    pt("bowtie", "box", 0, 0.72, 0.2, 0.12, 0.06, 0.04, RED),
    pt("footL", "box", -0.1, 0.08, 0.12, 0.14, 0.06, 0.22, "#ff9800"),
    pt("footR", "box", 0.1, 0.08, 0.12, 0.14, 0.06, 0.22, "#ff9800"),
  ];
}

function tank(p: string, a: string): MeshPart[] {
  return [
    pt("hull", "box", 0, 0.28, 0, 1.2, 0.32, 0.7, p, { metal: 0.55, rough: 0.4 }),
    pt("trackL", "box", 0, 0.14, 0.42, 1.15, 0.18, 0.16, DARK, { metal: 0.4 }),
    pt("trackR", "box", 0, 0.14, -0.42, 1.15, 0.18, 0.16, DARK, { metal: 0.4 }),
    pt("wheelL1", "cyl", 0.42, 0.14, 0.42, 0.08, 0.06, 0.08, CHROME, { rz: 1.57, metal: 0.8 }),
    pt("wheelL2", "cyl", -0.42, 0.14, 0.42, 0.08, 0.06, 0.08, CHROME, { rz: 1.57, metal: 0.8 }),
    pt("wheelR1", "cyl", 0.42, 0.14, -0.42, 0.08, 0.06, 0.08, CHROME, { rz: 1.57, metal: 0.8 }),
    pt("wheelR2", "cyl", -0.42, 0.14, -0.42, 0.08, 0.06, 0.08, CHROME, { rz: 1.57, metal: 0.8 }),
    pt("turret", "cyl", 0, 0.55, 0, 0.32, 0.22, 0.32, a, { metal: 0.5 }),
    pt("barrel", "cyl", 0.55, 0.58, 0, 0.06, 0.7, 0.06, a, { rz: 1.57, metal: 0.7 }),
    pt("muzzle", "cyl", 0.92, 0.58, 0, 0.08, 0.06, 0.08, DARK, { rz: 1.57, metal: 0.6 }),
    pt("hatch", "cyl", 0, 0.7, 0, 0.12, 0.08, 0.12, DARK, { metal: 0.5 }),
    pt("periscope", "cyl", 0.08, 0.78, 0, 0.03, 0.12, 0.03, DARK, { metal: 0.6 }),
    pt("periscopeGlass", "box", 0.08, 0.86, 0, 0.04, 0.04, 0.04, GLASS),
  ];
}

function jet(p: string, a: string): MeshPart[] {
  return [
    pt("fuse", "cyl", 0, 0.28, 0, 0.14, 1.4, 0.14, p, { rz: 1.57, metal: 0.5 }),
    pt("nose", "cone", 0.78, 0.28, 0, 0.14, 0.28, 0.14, a, { rz: -1.57, metal: 0.55 }),
    pt("wingL", "box", 0, 0.26, 0.5, 0.45, 0.05, 0.7, p, { metal: 0.45 }),
    pt("wingR", "box", 0, 0.26, -0.5, 0.45, 0.05, 0.7, p, { metal: 0.45 }),
    pt("wingTipL", "box", -0.08, 0.28, 0.82, 0.12, 0.04, 0.08, a),
    pt("wingTipR", "box", -0.08, 0.28, -0.82, 0.12, 0.04, 0.08, a),
    pt("tail", "box", -0.55, 0.42, 0, 0.18, 0.28, 0.06, a, { metal: 0.5 }),
    pt("tailFinL", "box", -0.62, 0.38, 0.18, 0.08, 0.2, 0.04, a),
    pt("tailFinR", "box", -0.62, 0.38, -0.18, 0.08, 0.2, 0.04, a),
    pt("cockpit", "sphere", 0.28, 0.38, 0, 0.12, 0.1, 0.1, GLASS),
    pt("cockpitFrame", "box", 0.28, 0.38, 0, 0.14, 0.12, 0.12, DARK, { metal: 0.4 }),
    pt("intakeL", "cyl", 0.1, 0.22, 0.22, 0.06, 0.2, 0.06, DARK, { metal: 0.6 }),
    pt("intakeR", "cyl", 0.1, 0.22, -0.22, 0.06, 0.2, 0.06, DARK, { metal: 0.6 }),
    pt("exhaust", "cyl", -0.68, 0.28, 0, 0.08, 0.1, 0.08, DARK, { rz: 1.57, metal: 0.7 }),
  ];
}

function lamp(p: string, a: string): MeshPart[] {
  return [
    pt("base", "cyl", 0, 0.06, 0, 0.28, 0.08, 0.28, DARK, { metal: 0.6 }),
    pt("stem", "cyl", 0, 0.45, 0, 0.05, 0.7, 0.05, p, { metal: 0.7 }),
    pt("joint", "sphere", 0.12, 0.82, 0, 0.06, 0.06, 0.06, CHROME, { metal: 0.85 }),
    pt("arm", "cyl", 0.22, 0.82, 0, 0.04, 0.45, 0.04, p, { rz: 1.1, metal: 0.7 }),
    pt("shade", "cone", 0.42, 0.7, 0, 0.22, 0.22, 0.22, a, { rough: 0.5 }),
    pt("shadeRim", "torus", 0.42, 0.58, 0, 0.2, 0.02, 0.2, a),
    pt("bulb", "sphere", 0.42, 0.62, 0, 0.08, 0.08, 0.08, "#fff6c8"),
    pt("glow", "sphere", 0.42, 0.56, 0, 0.12, 0.06, 0.12, "#fff6c8", { rough: 0.9 }),
    pt("switch", "box", 0.14, 0.22, 0.14, 0.04, 0.08, 0.04, DARK, { metal: 0.5 }),
  ];
}

function chair(p: string, a: string): MeshPart[] {
  return [
    pt("seat", "box", 0, 0.42, 0, 0.7, 0.1, 0.7, p, { rough: 0.55 }),
    pt("cushion", "box", 0, 0.48, 0, 0.62, 0.06, 0.62, a, { rough: 0.7 }),
    pt("back", "box", 0, 0.85, -0.3, 0.7, 0.75, 0.1, a, { rough: 0.55 }),
    pt("backCush", "box", 0, 0.82, -0.24, 0.58, 0.6, 0.06, p, { rough: 0.7 }),
    pt("armL", "box", -0.36, 0.58, 0, 0.08, 0.12, 0.5, p),
    pt("armR", "box", 0.36, 0.58, 0, 0.08, 0.12, 0.5, p),
    pt("leg1", "cyl", 0.28, 0.2, 0.28, 0.05, 0.4, 0.05, DARK, { metal: 0.4 }),
    pt("leg2", "cyl", -0.28, 0.2, 0.28, 0.05, 0.4, 0.05, DARK, { metal: 0.4 }),
    pt("leg3", "cyl", 0.28, 0.2, -0.28, 0.05, 0.4, 0.05, DARK, { metal: 0.4 }),
    pt("leg4", "cyl", -0.28, 0.2, -0.28, 0.05, 0.4, 0.05, DARK, { metal: 0.4 }),
  ];
}

function camera(p: string, a: string): MeshPart[] {
  return [
    pt("body", "box", 0, 0.32, 0, 0.7, 0.42, 0.4, p, { metal: 0.4, rough: 0.35 }),
    pt("topPlate", "box", 0, 0.56, 0, 0.5, 0.04, 0.32, DARK, { metal: 0.5 }),
    pt("lens", "cyl", 0.12, 0.32, 0.28, 0.18, 0.22, 0.18, DARK, { rx: 1.57, metal: 0.7 }),
    pt("lensRing", "torus", 0.12, 0.32, 0.38, 0.1, 0.02, 0.1, CHROME, { rx: 1.57, metal: 0.9 }),
    pt("glass", "cyl", 0.12, 0.32, 0.4, 0.12, 0.04, 0.12, GLASS, { rx: 1.57 }),
    pt("flash", "box", 0.28, 0.5, 0.12, 0.16, 0.1, 0.1, a),
    pt("flashLens", "box", 0.28, 0.52, 0.18, 0.1, 0.06, 0.02, GLASS),
    pt("viewfinder", "box", -0.08, 0.52, -0.08, 0.14, 0.08, 0.1, DARK),
    pt("shutter", "cyl", 0.32, 0.38, 0, 0.06, 0.04, 0.06, CHROME, { metal: 0.85 }),
    pt("grip", "box", -0.28, 0.22, 0, 0.16, 0.28, 0.28, DARK, { rough: 0.75 }),
    pt("strapLug", "cyl", 0.32, 0.48, 0.18, 0.03, 0.04, 0.03, CHROME, { metal: 0.9 }),
  ];
}

function globe(p: string, a: string): MeshPart[] {
  return [
    pt("ball", "sphere", 0, 0.55, 0, 0.42, 0.42, 0.42, p, { metal: 0.15, rough: 0.45 }),
    pt("land1", "sphere", 0.12, 0.62, 0.28, 0.12, 0.1, 0.08, "#4caf50", { rough: 0.6 }),
    pt("land2", "sphere", -0.18, 0.48, 0.32, 0.1, 0.08, 0.06, "#4caf50", { rough: 0.6 }),
    pt("land3", "sphere", 0.08, 0.42, -0.3, 0.08, 0.06, 0.05, "#4caf50", { rough: 0.6 }),
    pt("band", "torus", 0, 0.55, 0, 0.44, 0.03, 0.44, a, { metal: 0.8 }),
    pt("meridian", "torus", 0, 0.55, 0, 0.44, 0.02, 0.44, CHROME, { metal: 0.85, rx: 1.57 }),
    pt("armL", "cyl", -0.38, 0.55, 0, 0.03, 0.5, 0.03, CHROME, { metal: 0.7, rz: 0.5 }),
    pt("armR", "cyl", 0.38, 0.55, 0, 0.03, 0.5, 0.03, CHROME, { metal: 0.7, rz: -0.5 }),
    pt("stand", "cyl", 0, 0.12, 0, 0.08, 0.2, 0.08, "#888", { metal: 0.6 }),
    pt("base", "cyl", 0, 0.04, 0, 0.28, 0.06, 0.28, "#666", { metal: 0.5 }),
    pt("baseRing", "torus", 0, 0.04, 0, 0.3, 0.02, 0.3, CHROME, { metal: 0.75 }),
  ];
}

export const SHAPE_LIBRARY: readonly {
  id: string;
  name: string;
  category: ModelCategory;
  build: (primary: string, accent: string) => MeshPart[];
}[] = [
  { id: "minifig", name: "Minion", category: "character", build: minifig },
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
  ...EXTENDED_SHAPE_LIBRARY,
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
