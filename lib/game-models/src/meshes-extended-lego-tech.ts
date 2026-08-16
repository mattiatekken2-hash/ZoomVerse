import { C, legoMinifig, pt, type ShapeEntry } from "./mesh-utils.js";

function legoAstronaut(_p: string, _a: string) {
  return legoMinifig(C.WHITE, C.WHITE, [
    pt("helmet", "sphere", 0, 1.28, 0, 0.32, 0.32, 0.32, C.GLASS, { profile: "glass" }),
    pt("visor", "box", 0, 1.24, 0.24, 0.22, 0.1, 0.04, "#1a3a5c", { profile: "glass" }),
    pt("pack", "box", 0, 0.82, -0.22, 0.4, 0.44, 0.12, C.WHITE),
  ], [
    pt("badge", "box", 0, 0.88, 0.18, 0.12, 0.1, 0.03, C.BLUE),
    pt("flag", "box", 0.42, 0.72, 0, 0.08, 0.06, 0.02, C.RED),
  ]);
}

function legoPirate(_p: string, _a: string) {
  return legoMinifig(C.RED, C.DARK, [
    pt("bandana", "box", 0, 1.38, 0.08, 0.34, 0.08, 0.28, C.RED),
    pt("patch", "box", -0.1, 1.24, 0.27, 0.1, 0.08, 0.03, C.DARK),
    pt("earring", "torus", 0.18, 1.14, 0.2, 0.04, 0.01, 0.04, C.YELLOW, { metal: 0.9 }),
  ], [
    pt("sash", "box", 0, 0.72, 0.18, 0.5, 0.08, 0.04, C.YELLOW),
    pt("sword", "box", 0.48, 0.62, 0, 0.04, 0.5, 0.04, C.CHROME, { metal: 0.9 }),
  ]);
}

function legoChef(_p: string, _a: string) {
  return legoMinifig(C.WHITE, C.DARK, [
    pt("hat", "cyl", 0, 1.52, 0, 0.28, 0.18, 0.28, C.WHITE),
    pt("hatTop", "cyl", 0, 1.62, 0, 0.2, 0.08, 0.2, C.WHITE),
  ], [
    pt("apron", "box", 0, 0.62, 0.18, 0.42, 0.36, 0.04, C.WHITE),
    pt("spoon", "cyl", 0.44, 0.58, 0.08, 0.04, 0.22, 0.04, C.CHROME, { metal: 0.85 }),
  ]);
}

function legoPolice(_p: string, _a: string) {
  return legoMinifig(C.BLUE, C.DARK, [
    pt("cap", "cyl", 0, 1.44, 0, 0.3, 0.1, 0.3, C.DARK),
    pt("brim", "box", 0, 1.4, 0.2, 0.34, 0.04, 0.14, C.DARK),
    pt("badgeHat", "box", 0, 1.46, 0.22, 0.08, 0.06, 0.02, C.YELLOW, { metal: 0.8 }),
  ], [
    pt("badge", "box", 0, 0.88, 0.18, 0.1, 0.1, 0.03, C.YELLOW, { metal: 0.85 }),
    pt("belt", "box", 0, 0.56, 0.17, 0.52, 0.06, 0.04, C.DARK),
  ]);
}

function legoFirefighter(_p: string, _a: string) {
  return legoMinifig(C.YELLOW, C.DARK, [
    pt("helmet", "cyl", 0, 1.46, 0, 0.32, 0.14, 0.32, C.YELLOW),
    pt("shield", "box", 0, 1.48, 0.22, 0.12, 0.08, 0.02, C.RED),
  ], [
    pt("jacket", "box", 0, 0.82, 0, 0.64, 0.52, 0.36, C.YELLOW),
    pt("axe", "box", 0.46, 0.68, 0, 0.06, 0.28, 0.04, C.CHROME, { metal: 0.8 }),
  ]);
}

function legoWizard(_p: string, a: string) {
  return legoMinifig(a || "#4a148c", C.DARK, [
    pt("hat", "cone", 0, 1.58, 0, 0.22, 0.38, 0.22, a || "#4a148c"),
    pt("star", "box", 0, 1.72, 0.12, 0.06, 0.06, 0.02, C.YELLOW, { metal: 0.7 }),
  ], [
    pt("robe", "box", 0, 0.72, 0, 0.66, 0.62, 0.38, a || "#4a148c"),
    pt("staff", "cyl", 0.48, 0.72, 0, 0.04, 0.72, 0.04, C.BROWN),
    pt("orb", "sphere", 0.48, 1.1, 0, 0.08, 0.08, 0.08, C.GLASS, { profile: "glass" }),
  ]);
}

function legoBuilder(_p: string, _a: string) {
  return legoMinifig(C.ORANGE, C.BLUE, [
    pt("hardhat", "cyl", 0, 1.44, 0, 0.32, 0.1, 0.32, C.YELLOW),
    pt("brim", "box", 0, 1.4, 0.18, 0.36, 0.04, 0.16, C.YELLOW),
  ], [
    pt("vest", "box", 0, 0.82, 0.18, 0.48, 0.4, 0.04, C.ORANGE),
    pt("stripe1", "box", 0, 0.88, 0.2, 0.4, 0.04, 0.02, C.YELLOW),
    pt("stripe2", "box", 0, 0.76, 0.2, 0.4, 0.04, 0.02, C.YELLOW),
    pt("hammer", "box", 0.44, 0.58, 0.06, 0.08, 0.06, 0.04, C.CHROME, { metal: 0.85 }),
  ]);
}

function keyboard(p: string, a: string) {
  return [
    pt("base", "box", 0, 0.08, 0, 0.9, 0.08, 0.38, a || C.DARK, { metal: 0.3, rough: 0.45 }),
    pt("row1", "box", 0, 0.12, -0.1, 0.82, 0.04, 0.06, C.DARK),
    pt("row2", "box", 0, 0.12, 0, 0.82, 0.04, 0.06, C.DARK),
    pt("row3", "box", 0, 0.12, 0.1, 0.72, 0.04, 0.06, C.DARK),
    pt("space", "box", 0, 0.12, 0.14, 0.28, 0.04, 0.06, C.DARK),
    pt("key1", "box", -0.28, 0.12, -0.1, 0.06, 0.03, 0.04, p || C.WHITE),
    pt("key2", "box", 0, 0.12, -0.1, 0.06, 0.03, 0.04, p || C.WHITE),
    pt("key3", "box", 0.28, 0.12, -0.1, 0.06, 0.03, 0.04, p || C.WHITE),
    pt("led", "box", 0.38, 0.12, -0.16, 0.04, 0.02, 0.02, C.GREEN),
  ];
}

function mouse(p: string, a: string) {
  return [
    pt("body", "capsule", 0, 0.18, 0, 0.18, 0.28, 0.24, a || C.DARK, { rough: 0.55 }),
    pt("btnL", "box", -0.06, 0.24, 0.1, 0.08, 0.04, 0.1, p || "#333", { rough: 0.5 }),
    pt("btnR", "box", 0.06, 0.24, 0.1, 0.08, 0.04, 0.1, p || "#333", { rough: 0.5 }),
    pt("wheel", "cyl", 0, 0.26, 0.12, 0.03, 0.04, 0.03, C.CHROME, { metal: 0.7 }),
    pt("skid", "box", 0, 0.06, 0, 0.12, 0.02, 0.16, C.RUBBER, { rough: 0.85 }),
    pt("logo", "box", 0, 0.2, -0.1, 0.04, 0.04, 0.02, C.BLUE),
  ];
}

function desktopPc(p: string, a: string) {
  return [
    pt("case", "box", 0, 0.48, 0, 0.38, 0.88, 0.72, a || "#2a2a2a", { metal: 0.45, rough: 0.4 }),
    pt("front", "box", 0, 0.48, 0.37, 0.34, 0.8, 0.04, p || "#1a1a1a"),
    pt("power", "sphere", 0.12, 0.78, 0.39, 0.04, 0.04, 0.04, C.GREEN),
    pt("usb", "box", -0.08, 0.62, 0.39, 0.08, 0.04, 0.02, C.CHROME, { metal: 0.7 }),
    pt("vent1", "box", 0, 0.2, 0.39, 0.24, 0.04, 0.02, C.DARK),
    pt("vent2", "box", 0, 0.12, 0.39, 0.24, 0.04, 0.02, C.DARK),
    pt("sideLed", "box", 0.2, 0.48, 0, 0.02, 0.5, 0.6, C.BLUE, { metal: 0.2 }),
  ];
}

function gpu(p: string, a: string) {
  return [
    pt("pcb", "box", 0, 0.12, 0, 0.72, 0.04, 0.32, "#1b5e20", { metal: 0.2 }),
    pt("shroud", "box", 0, 0.22, 0, 0.68, 0.16, 0.28, a || C.DARK, { metal: 0.5 }),
    pt("fan1", "cyl", -0.18, 0.24, 0, 0.14, 0.04, 0.14, p || "#333", { metal: 0.4 }),
    pt("fan2", "cyl", 0.18, 0.24, 0, 0.14, 0.04, 0.14, p || "#333", { metal: 0.4 }),
    pt("blades1", "box", -0.18, 0.26, 0, 0.02, 0.02, 0.12, C.CHROME, { metal: 0.8 }),
    pt("blades2", "box", 0.18, 0.26, 0, 0.02, 0.02, 0.12, C.CHROME, { metal: 0.8 }),
    pt("port", "box", -0.38, 0.14, 0, 0.06, 0.08, 0.12, C.CHROME, { metal: 0.75 }),
    pt("rgb", "box", 0, 0.28, 0.15, 0.5, 0.02, 0.02, C.BLUE),
  ];
}

function laptop(p: string, a: string) {
  return [
    pt("base", "box", 0, 0.08, 0, 0.72, 0.08, 0.48, a || C.DARK, { metal: 0.45 }),
    pt("keyboard", "box", 0, 0.12, 0.04, 0.62, 0.02, 0.32, "#222"),
    pt("track", "box", 0, 0.12, -0.14, 0.18, 0.02, 0.12, C.CHROME, { metal: 0.5 }),
    pt("screen", "box", 0, 0.42, -0.22, 0.68, 0.48, 0.04, C.DARK, { metal: 0.4 }),
    pt("display", "box", 0, 0.42, -0.2, 0.62, 0.42, 0.02, p || C.GLASS, { profile: "glass" }),
    pt("cam", "sphere", 0, 0.62, -0.18, 0.02, 0.02, 0.02, C.DARK),
    pt("hinge", "cyl", 0, 0.12, -0.22, 0.06, 0.04, 0.06, C.CHROME, { metal: 0.7 }),
  ];
}

function monitor(p: string, a: string) {
  return [
    pt("screen", "box", 0, 0.52, 0, 0.82, 0.52, 0.06, a || C.DARK, { metal: 0.4 }),
    pt("panel", "box", 0, 0.52, 0.04, 0.76, 0.46, 0.02, p || "#111"),
    pt("bezel", "box", 0, 0.52, 0.03, 0.8, 0.5, 0.02, C.DARK),
    pt("standNeck", "box", 0, 0.18, 0, 0.08, 0.24, 0.06, C.DARK, { metal: 0.5 }),
    pt("standBase", "box", 0, 0.04, 0, 0.32, 0.04, 0.2, C.DARK, { metal: 0.5 }),
    pt("powerLed", "sphere", 0.32, 0.28, 0.04, 0.02, 0.02, 0.02, C.BLUE),
  ];
}

function headphones(p: string, a: string) {
  return [
    pt("band", "torus", 0, 0.72, 0, 0.38, 0.04, 0.38, a || C.DARK, { rx: 1.57, rough: 0.55 }),
    pt("cupL", "cyl", -0.36, 0.42, 0, 0.16, 0.12, 0.16, p || C.DARK, { rough: 0.5 }),
    pt("cupR", "cyl", 0.36, 0.42, 0, 0.16, 0.12, 0.16, p || C.DARK, { rough: 0.5 }),
    pt("padL", "torus", -0.36, 0.42, 0.1, 0.12, 0.03, 0.12, C.DARK, { rough: 0.8 }),
    pt("padR", "torus", 0.36, 0.42, 0.1, 0.12, 0.03, 0.12, C.DARK, { rough: 0.8 }),
    pt("logoL", "box", -0.36, 0.42, 0.12, 0.06, 0.06, 0.02, C.BLUE),
  ];
}

function smartphone(p: string, a: string) {
  return [
    pt("body", "box", 0, 0.42, 0, 0.28, 0.56, 0.06, a || C.DARK, { metal: 0.55, rough: 0.35 }),
    pt("screen", "box", 0, 0.42, 0.04, 0.24, 0.5, 0.02, p || "#111"),
    pt("glass", "box", 0, 0.42, 0.05, 0.22, 0.46, 0.01, C.GLASS, { profile: "glass" }),
    pt("cam", "cyl", 0.08, 0.62, -0.04, 0.04, 0.02, 0.04, C.DARK, { metal: 0.6 }),
    pt("speaker", "box", 0, 0.66, -0.03, 0.08, 0.02, 0.02, C.DARK),
    pt("btn", "box", 0.16, 0.42, -0.04, 0.02, 0.08, 0.02, C.CHROME, { metal: 0.7 }),
  ];
}

function pickaxe(_p: string, _a: string) {
  return [
    pt("handle", "cyl", 0, 0.42, 0, 0.04, 0.72, 0.04, "#6d4c41", { rough: 0.65 }),
    pt("head", "box", 0, 0.82, 0, 0.14, 0.08, 0.08, "#78909c", { metal: 0.5 }),
    pt("bladeL", "box", -0.18, 0.86, 0, 0.2, 0.06, 0.06, "#78909c", { metal: 0.55 }),
    pt("bladeR", "box", 0.18, 0.86, 0, 0.2, 0.06, 0.06, "#78909c", { metal: 0.55 }),
    pt("tip", "box", 0, 0.9, 0, 0.06, 0.06, 0.06, "#546e7a", { metal: 0.6 }),
  ];
}

export const LEGO_TECH_SHAPES: ShapeEntry[] = [
  { id: "lego_astronaut", name: "Lego Astronaut", category: "character", build: legoAstronaut },
  { id: "lego_pirate", name: "Lego Pirate", category: "character", build: legoPirate },
  { id: "lego_chef", name: "Lego Chef", category: "character", build: legoChef },
  { id: "lego_police", name: "Lego Police", category: "character", build: legoPolice },
  { id: "lego_firefighter", name: "Lego Firefighter", category: "character", build: legoFirefighter },
  { id: "lego_wizard", name: "Lego Wizard", category: "character", build: legoWizard },
  { id: "lego_builder", name: "Lego Builder", category: "character", build: legoBuilder },
  { id: "keyboard", name: "Keyboard", category: "gadget", build: keyboard },
  { id: "mouse", name: "Gaming Mouse", category: "gadget", build: mouse },
  { id: "desktop_pc", name: "Desktop PC", category: "gadget", build: desktopPc },
  { id: "gpu", name: "Graphics Card", category: "gadget", build: gpu },
  { id: "laptop", name: "Laptop", category: "gadget", build: laptop },
  { id: "monitor", name: "Monitor", category: "gadget", build: monitor },
  { id: "headphones", name: "Headphones", category: "gadget", build: headphones },
  { id: "smartphone", name: "Smartphone", category: "gadget", build: smartphone },
  { id: "pickaxe", name: "Pickaxe", category: "gadget", build: pickaxe },
];
