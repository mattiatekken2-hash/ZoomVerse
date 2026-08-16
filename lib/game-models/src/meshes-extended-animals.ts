import { C, pt, type ShapeEntry } from "./mesh-utils.js";

function lion(_p: string, _a: string) {
  return [
    pt("body", "box", 0, 0.32, 0, 0.62, 0.28, 0.34, "#c8843a", { profile: "fur" }),
    pt("mane", "sphere", 0, 0.52, 0.04, 0.28, 0.24, 0.28, "#8b5a2a", { profile: "fur" }),
    pt("head", "sphere", 0, 0.52, 0.22, 0.2, 0.2, 0.2, "#c8843a", { profile: "fur" }),
    pt("snout", "box", 0, 0.46, 0.38, 0.12, 0.1, 0.1, "#d4a056", { profile: "fur" }),
    pt("leg1", "cyl", 0.2, 0.12, 0.12, 0.07, 0.22, 0.07, "#c8843a", { profile: "fur" }),
    pt("leg2", "cyl", 0.2, 0.12, -0.12, 0.07, 0.22, 0.07, "#c8843a", { profile: "fur" }),
    pt("leg3", "cyl", -0.2, 0.12, 0.12, 0.07, 0.22, 0.07, "#c8843a", { profile: "fur" }),
    pt("leg4", "cyl", -0.2, 0.12, -0.12, 0.07, 0.22, 0.07, "#c8843a", { profile: "fur" }),
    pt("tail", "capsule", -0.36, 0.38, 0, 0.05, 0.28, 0.05, "#8b5a2a", { rz: 0.6, profile: "fur" }),
    pt("eyeL", "sphere", -0.08, 0.56, 0.32, 0.03, 0.03, 0.03, C.DARK),
    pt("eyeR", "sphere", 0.08, 0.56, 0.32, 0.03, 0.03, 0.03, C.DARK),
  ];
}

function koala(_p: string, _a: string) {
  return [
    pt("body", "sphere", 0, 0.32, 0, 0.3, 0.32, 0.28, "#888", { profile: "fur" }),
    pt("head", "sphere", 0, 0.58, 0.08, 0.24, 0.22, 0.22, "#999", { profile: "fur" }),
    pt("earL", "sphere", -0.16, 0.72, 0.04, 0.1, 0.1, 0.08, "#666", { profile: "fur" }),
    pt("earR", "sphere", 0.16, 0.72, 0.04, 0.1, 0.1, 0.08, "#666", { profile: "fur" }),
    pt("nose", "sphere", 0, 0.52, 0.26, 0.08, 0.06, 0.08, C.DARK),
    pt("eyeL", "sphere", -0.08, 0.6, 0.2, 0.03, 0.03, 0.03, C.DARK),
    pt("eyeR", "sphere", 0.08, 0.6, 0.2, 0.03, 0.03, 0.03, C.DARK),
    pt("armL", "capsule", -0.22, 0.38, 0.12, 0.06, 0.18, 0.06, "#888", { profile: "fur" }),
    pt("armR", "capsule", 0.22, 0.38, 0.12, 0.06, 0.18, 0.06, "#888", { profile: "fur" }),
  ];
}

function pig(_p: string, _a: string) {
  return [
    pt("body", "box", 0, 0.32, 0, 0.42, 0.28, 0.34, "#f48fb1", { profile: "fur" }),
    pt("head", "box", 0, 0.52, 0.22, 0.22, 0.2, 0.22, "#f48fb1", { profile: "fur" }),
    pt("snout", "box", 0, 0.46, 0.38, 0.14, 0.12, 0.1, "#f06292", { profile: "fur" }),
    pt("nostrilL", "sphere", -0.04, 0.46, 0.44, 0.02, 0.02, 0.02, C.DARK),
    pt("nostrilR", "sphere", 0.04, 0.46, 0.44, 0.02, 0.02, 0.02, C.DARK),
    pt("earL", "box", -0.12, 0.62, 0.2, 0.06, 0.08, 0.06, "#f48fb1", { profile: "fur" }),
    pt("earR", "box", 0.12, 0.62, 0.2, 0.06, 0.08, 0.06, "#f48fb1", { profile: "fur" }),
    pt("leg1", "cyl", 0.14, 0.12, 0.12, 0.06, 0.18, 0.06, "#f48fb1", { profile: "fur" }),
    pt("leg2", "cyl", -0.14, 0.12, 0.12, 0.06, 0.18, 0.06, "#f48fb1", { profile: "fur" }),
    pt("leg3", "cyl", 0.14, 0.12, -0.12, 0.06, 0.18, 0.06, "#f48fb1", { profile: "fur" }),
    pt("leg4", "cyl", -0.14, 0.12, -0.12, 0.06, 0.18, 0.06, "#f48fb1", { profile: "fur" }),
    pt("tail", "capsule", 0.22, 0.38, -0.18, 0.04, 0.16, 0.04, "#f48fb1", { rz: 0.8, profile: "fur" }),
    pt("eyeL", "sphere", -0.08, 0.56, 0.34, 0.03, 0.03, 0.03, C.DARK),
    pt("eyeR", "sphere", 0.08, 0.56, 0.34, 0.03, 0.03, 0.03, C.DARK),
  ];
}

function dragon(_p: string, _a: string) {
  return [
    pt("body", "box", 0, 0.36, 0, 0.38, 0.28, 0.3, "#7b1fa2", { profile: "fur" }),
    pt("head", "box", 0, 0.58, 0.18, 0.24, 0.22, 0.24, "#7b1fa2", { profile: "fur" }),
    pt("snout", "box", 0, 0.52, 0.34, 0.14, 0.1, 0.12, "#7b1fa2", { profile: "fur" }),
    pt("hornL", "cone", -0.08, 0.72, 0.28, 0.04, 0.1, 0.04, "#ffeb3b", { profile: "fur" }),
    pt("hornR", "cone", 0.08, 0.72, 0.28, 0.04, 0.1, 0.04, "#ffeb3b", { profile: "fur" }),
    pt("wingL", "box", -0.34, 0.42, 0, 0.08, 0.04, 0.32, "#ffd54f", { profile: "fur" }),
    pt("wingR", "box", 0.34, 0.42, 0, 0.08, 0.04, 0.32, "#ffd54f", { profile: "fur" }),
    pt("leg1", "cyl", 0.12, 0.12, 0.1, 0.06, 0.18, 0.06, "#7b1fa2", { profile: "fur" }),
    pt("leg2", "cyl", -0.12, 0.12, 0.1, 0.06, 0.18, 0.06, "#7b1fa2", { profile: "fur" }),
    pt("leg3", "cyl", 0.12, 0.12, -0.1, 0.06, 0.18, 0.06, "#7b1fa2", { profile: "fur" }),
    pt("leg4", "cyl", -0.12, 0.12, -0.1, 0.06, 0.18, 0.06, "#7b1fa2", { profile: "fur" }),
    pt("tail", "capsule", -0.28, 0.34, -0.08, 0.05, 0.28, 0.05, "#7b1fa2", { rz: 0.5, profile: "fur" }),
    pt("eyeL", "sphere", -0.08, 0.6, 0.3, 0.03, 0.03, 0.03, C.DARK),
    pt("eyeR", "sphere", 0.08, 0.6, 0.3, 0.03, 0.03, 0.03, C.DARK),
  ];
}

function pony(_p: string, _a: string) {
  return [
    pt("body", "box", 0, 0.36, 0, 0.38, 0.26, 0.3, "#7b1fa2", { profile: "fur" }),
    pt("head", "box", 0.18, 0.52, 0.12, 0.2, 0.2, 0.2, "#7b1fa2", { profile: "fur" }),
    pt("snout", "box", 0.32, 0.46, 0.18, 0.1, 0.08, 0.1, "#e1bee7", { profile: "fur" }),
    pt("mane", "box", 0.12, 0.62, 0.08, 0.06, 0.14, 0.08, "#e1bee7", { profile: "fur" }),
    pt("horn", "cone", 0.18, 0.72, 0.14, 0.04, 0.12, 0.04, "#ffffff", { profile: "fur" }),
    pt("wingL", "box", -0.32, 0.4, 0.04, 0.06, 0.04, 0.28, "#b3e5fc", { profile: "fur" }),
    pt("wingR", "box", 0.32, 0.4, 0.04, 0.06, 0.04, 0.28, "#b3e5fc", { profile: "fur" }),
    pt("leg1", "cyl", 0.14, 0.12, 0.1, 0.05, 0.2, 0.05, "#7b1fa2", { profile: "fur" }),
    pt("leg2", "cyl", -0.14, 0.12, 0.1, 0.05, 0.2, 0.05, "#7b1fa2", { profile: "fur" }),
    pt("leg3", "cyl", 0.14, 0.12, -0.1, 0.05, 0.2, 0.05, "#7b1fa2", { profile: "fur" }),
    pt("leg4", "cyl", -0.14, 0.12, -0.1, 0.05, 0.2, 0.05, "#7b1fa2", { profile: "fur" }),
    pt("tail", "capsule", -0.28, 0.36, 0, 0.04, 0.24, 0.04, "#e1bee7", { rz: 0.3, profile: "fur" }),
    pt("eyeL", "sphere", 0.12, 0.56, 0.22, 0.03, 0.03, 0.03, C.DARK),
    pt("eyeR", "sphere", 0.24, 0.56, 0.22, 0.03, 0.03, 0.03, C.DARK),
  ];
}

function monkey(_p: string, _a: string) {
  return [
    pt("body", "sphere", 0, 0.36, 0, 0.28, 0.32, 0.26, "#8b5a2a", { profile: "fur" }),
    pt("head", "sphere", 0, 0.62, 0.1, 0.22, 0.22, 0.22, "#a06830", { profile: "fur" }),
    pt("face", "sphere", 0, 0.58, 0.24, 0.14, 0.12, 0.12, "#d4a880", { profile: "skin" }),
    pt("earL", "sphere", -0.14, 0.68, 0.06, 0.06, 0.06, 0.05, "#8b5a2a", { profile: "fur" }),
    pt("earR", "sphere", 0.14, 0.68, 0.06, 0.06, 0.06, 0.05, "#8b5a2a", { profile: "fur" }),
    pt("tail", "capsule", 0.08, 0.32, -0.28, 0.05, 0.42, 0.05, "#8b5a2a", { rz: -1.1, profile: "fur" }),
    pt("armL", "capsule", -0.24, 0.48, 0.14, 0.06, 0.22, 0.06, "#a06830", { profile: "fur" }),
    pt("armR", "capsule", 0.24, 0.48, 0.14, 0.06, 0.22, 0.06, "#a06830", { profile: "fur" }),
    pt("eyeL", "sphere", -0.07, 0.64, 0.22, 0.03, 0.03, 0.03, C.DARK),
    pt("eyeR", "sphere", 0.07, 0.64, 0.22, 0.03, 0.03, 0.03, C.DARK),
  ];
}

function bear(_p: string, _a: string) {
  return [
    pt("body", "sphere", 0, 0.34, 0, 0.32, 0.36, 0.3, "#6b4423", { profile: "fur" }),
    pt("head", "sphere", 0, 0.62, 0.1, 0.26, 0.24, 0.24, "#7a5030", { profile: "fur" }),
    pt("snout", "sphere", 0, 0.56, 0.28, 0.12, 0.1, 0.1, "#9a7050", { profile: "fur" }),
    pt("earL", "sphere", -0.14, 0.76, 0.06, 0.08, 0.08, 0.08, "#6b4423", { profile: "fur" }),
    pt("earR", "sphere", 0.14, 0.76, 0.06, 0.08, 0.08, 0.08, "#6b4423", { profile: "fur" }),
    pt("leg1", "cyl", 0.14, 0.12, 0.1, 0.08, 0.2, 0.08, "#6b4423", { profile: "fur" }),
    pt("leg2", "cyl", -0.14, 0.12, 0.1, 0.08, 0.2, 0.08, "#6b4423", { profile: "fur" }),
    pt("nose", "sphere", 0, 0.56, 0.34, 0.04, 0.04, 0.04, C.DARK),
  ];
}

function giraffe(_p: string, _a: string) {
  return [
    pt("body", "box", 0, 0.38, 0, 0.5, 0.28, 0.28, "#f5c842", { profile: "fur" }),
    pt("neck", "cyl", 0, 0.78, 0.08, 0.1, 0.52, 0.1, "#f0c030", { profile: "fur" }),
    pt("head", "box", 0, 1.08, 0.18, 0.16, 0.14, 0.2, "#f5c842", { profile: "fur" }),
    pt("spot1", "sphere", 0.12, 0.42, 0.12, 0.06, 0.05, 0.04, "#c8843a", { profile: "fur" }),
    pt("spot2", "sphere", -0.1, 0.36, -0.08, 0.05, 0.04, 0.04, "#c8843a", { profile: "fur" }),
    pt("spot3", "sphere", 0.04, 0.72, 0.12, 0.04, 0.04, 0.03, "#c8843a", { profile: "fur" }),
    pt("leg1", "cyl", 0.16, 0.16, 0.1, 0.06, 0.32, 0.06, "#f5c842", { profile: "fur" }),
    pt("leg2", "cyl", -0.16, 0.16, 0.1, 0.06, 0.32, 0.06, "#f5c842", { profile: "fur" }),
    pt("leg3", "cyl", 0.16, 0.16, -0.1, 0.06, 0.32, 0.06, "#f5c842", { profile: "fur" }),
    pt("leg4", "cyl", -0.16, 0.16, -0.1, 0.06, 0.32, 0.06, "#f5c842", { profile: "fur" }),
    pt("hornL", "cyl", -0.05, 1.16, 0.2, 0.02, 0.06, 0.02, C.DARK),
    pt("hornR", "cyl", 0.05, 1.16, 0.2, 0.02, 0.06, 0.02, C.DARK),
  ];
}

function zebra(_p: string, _a: string) {
  return [
    pt("body", "box", 0, 0.36, 0, 0.62, 0.28, 0.32, C.WHITE, { profile: "fur" }),
    pt("stripe1", "box", 0, 0.4, 0.14, 0.58, 0.06, 0.02, C.DARK, { profile: "fur" }),
    pt("stripe2", "box", 0, 0.32, 0.14, 0.58, 0.06, 0.02, C.DARK, { profile: "fur" }),
    pt("stripe3", "box", 0, 0.24, 0.14, 0.58, 0.06, 0.02, C.DARK, { profile: "fur" }),
    pt("head", "box", 0.38, 0.48, 0.08, 0.22, 0.2, 0.22, C.WHITE, { profile: "fur" }),
    pt("mane", "box", 0.28, 0.58, 0.04, 0.04, 0.16, 0.08, C.DARK, { profile: "fur" }),
    pt("leg1", "cyl", 0.2, 0.12, 0.1, 0.06, 0.24, 0.06, C.WHITE, { profile: "fur" }),
    pt("leg2", "cyl", 0.2, 0.12, -0.1, 0.06, 0.24, 0.06, C.WHITE, { profile: "fur" }),
    pt("leg3", "cyl", -0.2, 0.12, 0.1, 0.06, 0.24, 0.06, C.WHITE, { profile: "fur" }),
    pt("leg4", "cyl", -0.2, 0.12, -0.1, 0.06, 0.24, 0.06, C.WHITE, { profile: "fur" }),
    pt("tail", "capsule", -0.34, 0.4, 0, 0.04, 0.22, 0.04, C.DARK, { rz: 0.5, profile: "fur" }),
  ];
}

function elephant(_p: string, _a: string) {
  return [
    pt("body", "sphere", 0, 0.38, 0, 0.38, 0.36, 0.34, "#888", { profile: "fur" }),
    pt("head", "sphere", 0.28, 0.48, 0.12, 0.28, 0.28, 0.28, "#999", { profile: "fur" }),
    pt("trunk1", "capsule", 0.42, 0.38, 0.28, 0.08, 0.16, 0.08, "#888", { profile: "fur" }),
    pt("trunk2", "capsule", 0.48, 0.28, 0.36, 0.07, 0.14, 0.07, "#888", { rz: 0.4, profile: "fur" }),
    pt("earL", "box", 0.12, 0.58, 0.28, 0.22, 0.18, 0.04, "#777", { profile: "fur" }),
    pt("earR", "box", 0.12, 0.58, -0.04, 0.22, 0.18, 0.04, "#777", { profile: "fur" }),
    pt("tuskL", "cyl", 0.38, 0.36, 0.18, 0.03, 0.12, 0.03, C.WHITE, { metal: 0.1 }),
    pt("tuskR", "cyl", 0.38, 0.36, 0.06, 0.03, 0.12, 0.03, C.WHITE, { metal: 0.1 }),
    pt("leg1", "cyl", 0.16, 0.12, 0.12, 0.1, 0.24, 0.1, "#888", { profile: "fur" }),
    pt("leg2", "cyl", -0.16, 0.12, 0.12, 0.1, 0.24, 0.1, "#888", { profile: "fur" }),
  ];
}

function tiger(_p: string, _a: string) {
  return [
    pt("body", "box", 0, 0.34, 0, 0.58, 0.26, 0.3, "#e88c2a", { profile: "fur" }),
    pt("stripe1", "box", 0, 0.38, 0.14, 0.5, 0.04, 0.02, C.DARK, { profile: "fur" }),
    pt("stripe2", "box", 0.12, 0.32, 0.14, 0.04, 0.12, 0.02, C.DARK, { profile: "fur" }),
    pt("head", "box", 0.34, 0.46, 0.08, 0.22, 0.2, 0.22, "#e88c2a", { profile: "fur" }),
    pt("earL", "cone", 0.28, 0.58, 0.16, 0.05, 0.08, 0.05, "#e88c2a", { profile: "fur" }),
    pt("earR", "cone", 0.28, 0.58, 0, 0.05, 0.08, 0.05, "#e88c2a", { profile: "fur" }),
    pt("tail", "capsule", -0.32, 0.38, 0, 0.05, 0.3, 0.05, "#e88c2a", { rz: 0.4, profile: "fur" }),
    pt("leg1", "cyl", 0.18, 0.12, 0.1, 0.06, 0.22, 0.06, "#e88c2a", { profile: "fur" }),
    pt("leg2", "cyl", -0.18, 0.12, 0.1, 0.06, 0.22, 0.06, "#e88c2a", { profile: "fur" }),
  ];
}

function panda(_p: string, _a: string) {
  return [
    pt("body", "sphere", 0, 0.34, 0, 0.32, 0.34, 0.3, C.WHITE, { profile: "fur" }),
    pt("head", "sphere", 0, 0.62, 0.1, 0.24, 0.22, 0.24, C.WHITE, { profile: "fur" }),
    pt("earL", "sphere", -0.12, 0.76, 0.06, 0.08, 0.08, 0.08, C.DARK, { profile: "fur" }),
    pt("earR", "sphere", 0.12, 0.76, 0.06, 0.08, 0.08, 0.08, C.DARK, { profile: "fur" }),
    pt("patchL", "sphere", -0.1, 0.62, 0.2, 0.08, 0.08, 0.06, C.DARK, { profile: "fur" }),
    pt("patchR", "sphere", 0.1, 0.62, 0.2, 0.08, 0.08, 0.06, C.DARK, { profile: "fur" }),
    pt("armL", "capsule", -0.24, 0.38, 0.12, 0.08, 0.18, 0.08, C.DARK, { profile: "fur" }),
    pt("armR", "capsule", 0.24, 0.38, 0.12, 0.08, 0.18, 0.08, C.DARK, { profile: "fur" }),
    pt("nose", "sphere", 0, 0.56, 0.28, 0.04, 0.04, 0.04, C.DARK),
  ];
}

function fox(_p: string, _a: string) {
  return [
    pt("body", "box", 0, 0.32, 0, 0.52, 0.24, 0.28, "#e8702a", { profile: "fur" }),
    pt("chest", "box", 0.12, 0.34, 0.08, 0.2, 0.18, 0.2, C.WHITE, { profile: "fur" }),
    pt("head", "box", 0.32, 0.42, 0.1, 0.2, 0.18, 0.2, "#e8702a", { profile: "fur" }),
    pt("snout", "box", 0.48, 0.38, 0.12, 0.1, 0.08, 0.1, C.WHITE, { profile: "fur" }),
    pt("earL", "cone", 0.28, 0.56, 0.18, 0.06, 0.12, 0.06, "#e8702a", { profile: "fur" }),
    pt("earR", "cone", 0.28, 0.56, 0.04, 0.06, 0.12, 0.06, "#e8702a", { profile: "fur" }),
    pt("tail", "capsule", -0.32, 0.36, 0, 0.08, 0.32, 0.08, "#e8702a", { rz: 0.5, profile: "fur" }),
    pt("tailTip", "sphere", -0.42, 0.48, 0.08, 0.06, 0.06, 0.06, C.WHITE, { profile: "fur" }),
  ];
}

function rabbit(_p: string, _a: string) {
  return [
    pt("body", "sphere", 0, 0.28, 0, 0.26, 0.28, 0.24, C.WHITE, { profile: "fur" }),
    pt("head", "sphere", 0, 0.52, 0.08, 0.2, 0.2, 0.2, C.WHITE, { profile: "fur" }),
    pt("earL", "capsule", -0.08, 0.82, 0.04, 0.05, 0.28, 0.05, C.WHITE, { profile: "fur" }),
    pt("earR", "capsule", 0.08, 0.82, 0.04, 0.05, 0.28, 0.05, C.WHITE, { profile: "fur" }),
    pt("earInL", "capsule", -0.08, 0.8, 0.06, 0.03, 0.22, 0.03, "#ffb8b8", { profile: "skin" }),
    pt("earInR", "capsule", 0.08, 0.8, 0.06, 0.03, 0.22, 0.03, "#ffb8b8", { profile: "skin" }),
    pt("nose", "sphere", 0, 0.48, 0.22, 0.04, 0.04, 0.04, "#ffb0b0"),
    pt("tail", "sphere", 0, 0.24, -0.2, 0.08, 0.08, 0.08, C.WHITE, { profile: "fur" }),
  ];
}

function eagle(_p: string, _a: string) {
  return [
    pt("body", "box", 0, 0.42, 0, 0.28, 0.22, 0.32, "#5a4030", { profile: "fur" }),
    pt("head", "sphere", 0, 0.58, 0.18, 0.14, 0.14, 0.14, C.WHITE),
    pt("beak", "cone", 0, 0.54, 0.32, 0.05, 0.1, 0.05, C.YELLOW, { rx: 1.57 }),
    pt("wingL", "box", -0.32, 0.42, 0, 0.12, 0.06, 0.48, "#4a3020", { profile: "fur" }),
    pt("wingR", "box", 0.32, 0.42, 0, 0.12, 0.06, 0.48, "#4a3020", { profile: "fur" }),
    pt("tail", "box", 0, 0.32, -0.28, 0.1, 0.04, 0.18, "#5a4030", { profile: "fur" }),
    pt("legL", "cyl", -0.06, 0.22, 0.1, 0.02, 0.1, 0.02, C.YELLOW),
    pt("legR", "cyl", 0.06, 0.22, 0.1, 0.02, 0.1, 0.02, C.YELLOW),
    pt("eyeL", "sphere", -0.04, 0.6, 0.24, 0.02, 0.02, 0.02, C.DARK),
    pt("eyeR", "sphere", 0.04, 0.6, 0.24, 0.02, 0.02, 0.02, C.DARK),
  ];
}

function pokeball(_p: string, _a: string) {
  return [
    pt("bot", "sphere", 0, 0.22, 0, 0.36, 0.22, 0.36, C.WHITE, { rough: 0.35, profile: "food_glossy" }),
    pt("top", "sphere", 0, 0.46, 0, 0.36, 0.22, 0.36, C.RED, { rough: 0.35, profile: "food_glossy" }),
    pt("band", "cyl", 0, 0.34, 0, 0.37, 0.04, 0.37, C.DARK, { metal: 0.4 }),
    pt("btnOuter", "sphere", 0, 0.34, 0.34, 0.1, 0.1, 0.06, C.WHITE, { metal: 0.2 }),
    pt("btnInner", "sphere", 0, 0.34, 0.38, 0.05, 0.05, 0.03, C.WHITE, { metal: 0.1 }),
    pt("btnRing", "torus", 0, 0.34, 0.36, 0.08, 0.015, 0.08, C.DARK, { metal: 0.5 }),
  ];
}

function soccerBall(_p: string, _a: string) {
  return [
    pt("ball", "sphere", 0, 0.34, 0, 0.34, 0.34, 0.34, C.WHITE, { rough: 0.55 }),
    pt("patch1", "box", 0, 0.52, 0.08, 0.12, 0.1, 0.04, C.DARK),
    pt("patch2", "box", 0.14, 0.38, 0.22, 0.1, 0.08, 0.04, C.DARK),
    pt("patch3", "box", -0.12, 0.3, 0.2, 0.1, 0.08, 0.04, C.DARK),
    pt("patch4", "box", 0.04, 0.28, -0.22, 0.1, 0.08, 0.04, C.DARK),
    pt("seam1", "box", 0.2, 0.34, 0, 0.02, 0.28, 0.02, "#ccc"),
  ];
}

function basketball(_p: string, _a: string) {
  return [
    pt("ball", "sphere", 0, 0.34, 0, 0.34, 0.34, 0.34, C.ORANGE, { rough: 0.65, profile: "rubber" }),
    pt("line1", "torus", 0, 0.34, 0, 0.35, 0.015, 0.35, C.DARK, { rx: 1.57 }),
    pt("line2", "torus", 0, 0.34, 0, 0.35, 0.015, 0.35, C.DARK),
    pt("line3", "box", 0, 0.34, 0.34, 0.02, 0.32, 0.02, C.DARK),
  ];
}

function guitar(p: string, a: string) {
  return [
    pt("body", "box", 0, 0.32, 0, 0.38, 0.42, 0.12, a || "#8b4513", { rough: 0.6 }),
    pt("waist", "box", 0, 0.32, 0, 0.22, 0.28, 0.1, a || "#8b4513", { rough: 0.6 }),
    pt("neck", "box", 0, 0.62, 0, 0.08, 0.42, 0.06, "#5a3010", { rough: 0.55 }),
    pt("head", "box", 0, 0.88, 0, 0.12, 0.1, 0.06, "#5a3010"),
    pt("sound", "cyl", 0, 0.32, 0.07, 0.12, 0.02, 0.12, C.DARK),
    pt("bridge", "box", 0, 0.22, 0.07, 0.08, 0.02, 0.04, C.CHROME, { metal: 0.8 }),
    pt("string1", "cyl", 0, 0.52, 0.08, 0.005, 0.62, 0.005, C.CHROME, { metal: 0.9 }),
    pt("string2", "cyl", 0.02, 0.52, 0.08, 0.005, 0.62, 0.005, C.CHROME, { metal: 0.9 }),
    pt("string3", "cyl", -0.02, 0.52, 0.08, 0.005, 0.62, 0.005, C.CHROME, { metal: 0.9 }),
  ];
}

function diamond(p: string, a: string) {
  return [
    pt("crown", "cyl", 0, 0.42, 0, 0.22, 0.12, 0.22, a || C.GLASS, { metal: 0.1, rough: 0.05, profile: "glass" }),
    pt("pavilion", "cone", 0, 0.18, 0, 0.22, 0.28, 0.22, p || "#b3e5fc", { profile: "glass" }),
    pt("table", "cyl", 0, 0.48, 0, 0.12, 0.02, 0.12, C.WHITE, { profile: "glass" }),
    pt("facet1", "box", 0.1, 0.36, 0.1, 0.04, 0.12, 0.02, C.GLASS, { profile: "glass" }),
    pt("facet2", "box", -0.1, 0.36, -0.08, 0.04, 0.12, 0.02, C.GLASS, { profile: "glass" }),
    pt("sparkle", "sphere", 0.06, 0.44, 0.08, 0.02, 0.02, 0.02, C.WHITE),
  ];
}

function crown(p: string, a: string) {
  return [
    pt("band", "cyl", 0, 0.18, 0, 0.32, 0.08, 0.32, a || C.YELLOW, { metal: 0.85, rough: 0.2 }),
    pt("spike1", "cone", 0, 0.42, 0, 0.08, 0.28, 0.08, a || C.YELLOW, { metal: 0.85 }),
    pt("spike2", "cone", -0.14, 0.36, 0.08, 0.07, 0.22, 0.07, a || C.YELLOW, { metal: 0.85 }),
    pt("spike3", "cone", 0.14, 0.36, 0.08, 0.07, 0.22, 0.07, a || C.YELLOW, { metal: 0.85 }),
    pt("spike4", "cone", -0.14, 0.36, -0.08, 0.07, 0.22, 0.07, a || C.YELLOW, { metal: 0.85 }),
    pt("spike5", "cone", 0.14, 0.36, -0.08, 0.07, 0.22, 0.07, a || C.YELLOW, { metal: 0.85 }),
    pt("gem", "sphere", 0, 0.22, 0.28, 0.06, 0.06, 0.04, p || C.RED, { profile: "glass" }),
    pt("gemL", "sphere", -0.12, 0.2, 0.26, 0.04, 0.04, 0.03, C.BLUE, { profile: "glass" }),
    pt("gemR", "sphere", 0.12, 0.2, 0.26, 0.04, 0.04, 0.03, C.BLUE, { profile: "glass" }),
  ];
}

function treasureChest(p: string, a: string) {
  return [
    pt("base", "box", 0, 0.22, 0, 0.62, 0.28, 0.42, a || "#8b4513", { rough: 0.65 }),
    pt("lid", "box", 0, 0.48, 0, 0.64, 0.22, 0.44, a || "#6b3410", { rough: 0.6 }),
    pt("lidCurve", "cyl", 0, 0.58, 0, 0.32, 0.12, 0.32, a || "#6b3410", { rx: 1.57, rough: 0.6 }),
    pt("lock", "box", 0, 0.38, 0.22, 0.08, 0.1, 0.04, C.YELLOW, { metal: 0.85 }),
    pt("band1", "box", 0, 0.22, 0.22, 0.64, 0.06, 0.04, C.CHROME, { metal: 0.75 }),
    pt("band2", "box", 0, 0.48, 0.22, 0.66, 0.06, 0.04, C.CHROME, { metal: 0.75 }),
    pt("gold1", "sphere", 0.12, 0.28, 0.04, 0.06, 0.04, 0.06, C.YELLOW, { metal: 0.9 }),
    pt("gold2", "sphere", -0.1, 0.24, -0.06, 0.05, 0.04, 0.05, C.YELLOW, { metal: 0.9 }),
    pt("coin", "cyl", 0, 0.32, 0.02, 0.08, 0.02, 0.08, C.YELLOW, { metal: 0.9 }),
  ];
}

export const ANIMAL_MISC_SHAPES: ShapeEntry[] = [
  { id: "lion", name: "Lion", category: "animal", build: lion },
  { id: "koala", name: "Koala", category: "animal", build: koala },
  { id: "pig", name: "Pig", category: "animal", build: pig },
  { id: "dragon", name: "Dragon", category: "animal", build: dragon },
  { id: "pony", name: "Pony", category: "animal", build: pony },
  { id: "monkey", name: "Monkey", category: "animal", build: monkey },
  { id: "bear", name: "Brown Bear", category: "animal", build: bear },
  { id: "giraffe", name: "Giraffe", category: "animal", build: giraffe },
  { id: "zebra", name: "Zebra", category: "animal", build: zebra },
  { id: "elephant", name: "Elephant", category: "animal", build: elephant },
  { id: "tiger", name: "Tiger", category: "animal", build: tiger },
  { id: "panda", name: "Panda", category: "animal", build: panda },
  { id: "fox", name: "Fox", category: "animal", build: fox },
  { id: "rabbit", name: "Rabbit", category: "animal", build: rabbit },
  { id: "eagle", name: "Eagle", category: "animal", build: eagle },
  { id: "pokeball", name: "Pokeball", category: "gadget", build: pokeball },
  { id: "soccer_ball", name: "Soccer Ball", category: "daily", build: soccerBall },
  { id: "basketball", name: "Basketball", category: "daily", build: basketball },
  { id: "guitar", name: "Guitar", category: "daily", build: guitar },
  { id: "diamond", name: "Diamond Gem", category: "gadget", build: diamond },
  { id: "crown", name: "Royal Crown", category: "daily", build: crown },
  { id: "treasure_chest", name: "Treasure Chest", category: "daily", build: treasureChest },
];
