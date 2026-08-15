import type { MaterialProfile, MeshPart, MeshPrim } from "./meshes.js";

export function pt(
  id: string,
  prim: MeshPrim,
  x: number, y: number, z: number,
  sx: number, sy: number, sz: number,
  color: MeshPart["color"],
  extra?: Partial<Pick<MeshPart, "rx" | "ry" | "rz" | "metal" | "rough" | "profile">>,
): MeshPart {
  return { id, prim, x, y, z, sx, sy, sz, color, ...extra };
}

export const C = {
  SKIN: "#f2c9a1",
  DARK: "#1a1a1a",
  WHITE: "#f4f4f4",
  BROWN: "#6b3e26",
  RED: "#e23b3b",
  BLUE: "#2b6cff",
  YELLOW: "#f5d031",
  GLASS: "#9ad4ff",
  CHROME: "#c8d4e8",
  RUBBER: "#1e1e1e",
  GREEN: "#4caf50",
  ORANGE: "#ff9800",
} as const;

export type ShapeBuilder = (primary: string, accent: string) => MeshPart[];
export type ShapeEntry = {
  id: string;
  name: string;
  category: import("./types.js").ModelCategory;
  build: ShapeBuilder;
};

export function legoMinifig(
  torso: string,
  legs: string,
  headExtra: MeshPart[] = [],
  bodyExtra: MeshPart[] = [],
): MeshPart[] {
  return [
    pt("footL", "box", -0.16, 0.04, 0.04, 0.28, 0.08, 0.32, C.RUBBER, { rough: 0.85 }),
    pt("footR", "box", 0.16, 0.04, 0.04, 0.28, 0.08, 0.32, C.RUBBER, { rough: 0.85 }),
    pt("legL", "box", -0.16, 0.24, 0, 0.26, 0.42, 0.28, legs),
    pt("legR", "box", 0.16, 0.24, 0, 0.26, 0.42, 0.28, legs),
    pt("hips", "box", 0, 0.48, 0, 0.58, 0.14, 0.32, legs),
    pt("torso", "box", 0, 0.82, 0, 0.62, 0.52, 0.34, torso),
    pt("armL", "cyl", -0.42, 0.78, 0, 0.1, 0.42, 0.1, C.YELLOW),
    pt("armR", "cyl", 0.42, 0.78, 0, 0.1, 0.42, 0.1, C.YELLOW),
    pt("handL", "sphere", -0.42, 0.54, 0, 0.11, 0.11, 0.11, C.YELLOW),
    pt("handR", "sphere", 0.42, 0.54, 0, 0.11, 0.11, 0.11, C.YELLOW),
    pt("head", "cyl", 0, 1.22, 0, 0.28, 0.32, 0.28, C.YELLOW),
    pt("stud", "cyl", 0, 1.42, 0, 0.12, 0.1, 0.12, C.YELLOW, { metal: 0.08 }),
    pt("eyeL", "box", -0.1, 1.24, 0.26, 0.08, 0.08, 0.04, C.DARK),
    pt("eyeR", "box", 0.1, 1.24, 0.26, 0.08, 0.08, 0.04, C.DARK),
    pt("smile", "box", 0, 1.12, 0.26, 0.16, 0.04, 0.03, C.DARK),
    ...bodyExtra,
    ...headExtra,
  ];
}

export function sodaCan(can: string, label: string, accent: string, tab = C.CHROME): MeshPart[] {
  return [
    pt("can", "cyl", 0, 0.42, 0, 0.22, 0.84, 0.22, can, { metal: 0.55, rough: 0.28, profile: "metal" as MaterialProfile }),
    pt("label", "cyl", 0, 0.42, 0, 0.225, 0.42, 0.225, label, { rough: 0.4 }),
    pt("stripe", "box", 0, 0.42, 0.23, 0.36, 0.08, 0.02, accent),
    pt("top", "cyl", 0, 0.86, 0, 0.2, 0.04, 0.2, C.CHROME, { metal: 0.85 }),
    pt("tab", "box", 0, 0.88, 0.08, 0.1, 0.02, 0.06, tab, { metal: 0.9 }),
    pt("base", "cyl", 0, 0.02, 0, 0.22, 0.04, 0.22, C.DARK, { metal: 0.5 }),
  ];
}
