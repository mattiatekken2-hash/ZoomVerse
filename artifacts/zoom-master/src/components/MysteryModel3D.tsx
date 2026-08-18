import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { RGBELoader } from "three/examples/jsm/loaders/RGBELoader.js";
import { FORGE_CLAY, FORGE_CLAY_HEX, FORGE_VOXEL_SIZE, getMeshParts, getShapeGlbUrl, meshPartsToVoxels, mysteryKitParts, FORGE_SPHERE_SHAPE_ID, getForgeSphereBlueprint, isLabCollectibleVoxelRarity, labForgeMorphT, showcaseVoxelHex, getShowcaseVoxelHex, getShowcasePaletteForRarity, getShowcaseRarityStyle, quantizeToShowcasePalette, isBattleScarVoxel, shouldPlanetShowRing, type MaterialProfile, type MeshPart, type VoxelCell } from "@workspace/game-models";
import { FLOAT_PLANET_TYPES } from "../utils/planetFloat";

const DEFAULT_PARTS = mysteryKitParts();

/** Fade-in threshold — opacity ramp instead of popping visible on/off. */
const MIN_PART_LOCK = 0.08;

const GLASS_COLORS = new Set(["#9ad4ff", "#bff7ff", "#a8e7ff", "#88cc44"]);

/** Cached studio HDRI — shared across all showcase views. */
let cachedStudioEnv: THREE.Texture | null = null;
let studioEnvPromise: Promise<THREE.Texture> | null = null;

const STUDIO_HDR = "/assets/env/studio_small_09_1k.hdr";

/** Internal render scale — 3 ⇒ 156px canvas renders at ~52×52 then upscales blocky. */
const PIXEL_SCALE = 3;
const PIXEL_MIN_INTERNAL = 16;
/** Internal supersampling for premium planet card thumbs (SUN, etc.). */
const PLANET_THUMB_RENDER_SCALE = 2;
/** Display sizes at/above this get hi-fi internal resolution + DPR. */
const PLANET_THUMB_HIFI_MIN = 80;
/** Forge voxel — solid face + EdgesGeometry line per cube. */
const FORGE_VOXEL_CUBE_FILL = 0.98;
/** Farm card thumbs — smaller cubes + gaps so blocks read at ~128px. */
const LAB_THUMB_CUBE_FILL = 0.86;

function resolveForgeVoxelPosition(v: VoxelCell, morphT: number, out: THREE.Vector3): void {
  const mx = v.morphX;
  const my = v.morphY;
  const mz = v.morphZ;
  if (mx === undefined || my === undefined || mz === undefined || morphT <= 0) {
    out.set(v.x, v.y, v.z);
    return;
  }
  if (morphT >= 1) {
    out.set(mx, my, mz);
    return;
  }
  out.set(
    v.x + (mx - v.x) * morphT,
    v.y + (my - v.y) * morphT,
    v.z + (mz - v.z) * morphT,
  );
}
const FORGE_VOXEL_EDGE = 0x454545;

/** Unit 1×1×1 box edge vertices — scaled per voxel in the animate loop. */
let unitBoxEdgeCache: { positions: Float32Array; vertCount: number } | null = null;
function getUnitBoxEdgeTemplate(): { positions: Float32Array; vertCount: number } {
  if (unitBoxEdgeCache) return unitBoxEdgeCache;
  const box = new THREE.BoxGeometry(1, 1, 1);
  const edges = new THREE.EdgesGeometry(box, 1);
  unitBoxEdgeCache = {
    vertCount: edges.attributes.position.count,
    positions: new Float32Array(edges.attributes.position.array),
  };
  box.dispose();
  edges.dispose();
  return unitBoxEdgeCache;
}

type GeoDetail = "low" | "standard" | "showcase" | "ultra";

type PartMaterial = THREE.MeshStandardMaterial | THREE.MeshPhysicalMaterial;

function isShowcaseView(
  performanceMode: boolean,
  size: number,
  interactive: boolean,
  opaqueBackground: boolean,
  revealed: boolean,
  forgeVoxelBuild: boolean,
  planetShowcase: boolean,
  labCollectibleShowcase: boolean,
): boolean {
  if (planetShowcase) return false;
  if (labCollectibleShowcase) return false;
  if (performanceMode) return false;
  if (forgeVoxelBuild && !revealed) return false;
  if (interactive && !revealed) return false;
  return size >= 96 || opaqueBackground || (revealed && size >= 72);
}

function showcaseVoxelColor(
  v: VoxelCell,
  step: number,
  radius: number,
  primary: string,
  accent: string,
  out: THREE.Color,
  rarity?: string,
  floatValue = 1,
): void {
  const ix = Math.round(v.x / step);
  const iy = Math.round(v.y / step);
  const iz = Math.round(v.z / step);
  const hex = rarity
    ? getShowcaseVoxelHex(rarity, v.color, primary, accent, ix, iy, iz, radius, floatValue)
    : showcaseVoxelHex(v.color, primary, accent, ix, iy, iz, radius);
  out.set(hex);
  // Guard — invalid hex strings paint instanced voxels black in WebGL.
  if (!Number.isFinite(out.r) || (out.r + out.g + out.b) < 0.001) {
    out.set(primary && primary.startsWith("#") ? primary : `#${primary || "8892b0"}`);
  }
}

/** Remove Lab tap-257 reveal meshes — same path as Farm card thumbs. */
function removeForgeLabRevealVisuals(
  group: THREE.Group,
  forgeEdgeLinesRef: { current: THREE.LineSegments | null },
): void {
  const toRemove: THREE.Object3D[] = [];
  group.children.forEach((child) => {
    const ud = (child as THREE.Object3D).userData;
    if (
      ud?.["forgeLabRevealVisual"]
      || ud?.["labCollectibleBucket"]
      || ud?.["planetAtmosphere"]
      || ud?.["planetCorona"]
      || ud?.["planetRing"]
      || ud?.["perfectFloatSparkle"]
    ) {
      toRemove.push(child);
    }
  });
  for (const child of toRemove) {
    group.remove(child);
    const mesh = child as THREE.Mesh;
    mesh.geometry?.dispose();
    const mat = mesh.material;
    if (Array.isArray(mat)) mat.forEach((m) => m.dispose());
    else (mat as THREE.Material | undefined)?.dispose();
  }
  const edgeLines = forgeEdgeLinesRef.current;
  if (edgeLines?.userData?.["forgeLabRevealVisual"]) {
    group.remove(edgeLines);
    edgeLines.geometry.dispose();
    (edgeLines.material as THREE.Material).dispose();
    forgeEdgeLinesRef.current = null;
  }
}

/** Lab tap-257 reveal — identical voxel paint + decor as Farm inventory cards. */
function addForgeLabCollectibleRevealVisual(
  group: THREE.Group,
  forgeVoxels: VoxelCell[],
  voxelStep: number,
  forgeSphereRadius: number,
  primaryColor: string,
  accentColor: string,
  rarity: string,
  floatValue: number,
  worldRadius: number,
  voxelDummy: THREE.Object3D,
  edgeScratch: THREE.Vector3,
  forgeEdgeLinesRef: { current: THREE.LineSegments | null },
): THREE.BoxGeometry {
  removeForgeLabRevealVisuals(group, forgeEdgeLinesRef);

  const labThumbCubeFill = LAB_THUMB_CUBE_FILL;
  const labBoxGeo = new THREE.BoxGeometry(
    voxelStep * labThumbCubeFill,
    voxelStep * labThumbCubeFill,
    voxelStep * labThumbCubeFill,
  );

  const edgeLines = addLabCollectibleBucketMeshes(
    group,
    forgeVoxels,
    labBoxGeo,
    voxelDummy,
    voxelStep,
    forgeSphereRadius,
    primaryColor,
    accentColor,
    rarity,
    floatValue,
    labThumbCubeFill,
    edgeScratch,
  );
  edgeLines.userData["forgeLabRevealVisual"] = true;
  forgeEdgeLinesRef.current = edgeLines;

  addLabPlanetDecorations(
    group,
    worldRadius,
    primaryColor,
    accentColor,
    rarity,
    floatValue,
    forgeVoxels,
    voxelStep,
    forgeSphereRadius,
    labThumbCubeFill,
    labBoxGeo,
    voxelDummy,
  );

  group.children.forEach((child) => {
    if ((child as THREE.Object3D).userData?.["labCollectibleBucket"]) {
      (child as THREE.Object3D).userData["forgeLabRevealVisual"] = true;
    }
  });

  return labBoxGeo;
}

/** Snap shell cubes so outer faces sit on a perfect sphere envelope. */
function rareVoxelWorldPos(
  v: VoxelCell,
  step: number,
  radius: number,
  cubeFill: number,
  out: THREE.Vector3,
): void {
  const ix = Math.round(v.x / step);
  const iy = Math.round(v.y / step);
  const iz = Math.round(v.z / step);
  const len = Math.sqrt(ix * ix + iy * iy + iz * iz);
  if (len < 0.001) {
    out.set(0, 0, 0);
    return;
  }
  const dist = len / Math.max(radius, 1);
  const nx = ix / len;
  const ny = iy / len;
  const nz = iz / len;
  const half = step * cubeFill * 0.5;
  const outerR = radius * step;

  if (dist > 0.76) {
    const centerR = Math.max(half, outerR - half);
    out.set(nx * centerR, ny * centerR, nz * centerR);
    return;
  }
  out.set(v.x, v.y, v.z);
}

function rareVoxelScale(_v: VoxelCell, _step: number, _radius: number): number {
  return 1;
}

/** Drop isolated surface voxels that break the circular silhouette. */
function filterRareOutlierVoxels(voxels: VoxelCell[], step: number, radius: number): VoxelCell[] {
  const inSphere = (ix: number, iy: number, iz: number) =>
    ix * ix + iy * iy + iz * iz <= radius * radius;
  const dirs: Array<[number, number, number]> = [
    [1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1],
  ];
  return voxels.filter((v) => {
    const ix = Math.round(v.x / step);
    const iy = Math.round(v.y / step);
    const iz = Math.round(v.z / step);
    const len = Math.sqrt(ix * ix + iy * iy + iz * iz);
    const dist = len / Math.max(radius, 1);
    if (dist < 0.9) return true;
    let neighbors = 0;
    for (const [dx, dy, dz] of dirs) {
      if (inSphere(ix + dx, iy + dy, iz + dz)) neighbors++;
    }
    return neighbors >= 4;
  });
}

function addPremiumBandVoxelMeshes(
  group: THREE.Group,
  forgeVoxels: VoxelCell[],
  boxGeo: THREE.BoxGeometry,
  voxelDummy: THREE.Object3D,
  voxelStep: number,
  forgeSphereRadius: number,
  primaryColor: string,
  accentColor: string,
  rarity: string,
  floatValue: number,
  planetId: string,
  cubeFill: number,
): { hotSpots: VoxelCell[]; glowSurface: VoxelCell[] } {
  const style = getShowcaseRarityStyle(rarity);
  const palette = getShowcasePaletteForRarity(rarity, primaryColor, accentColor);
  const voxels = filterRareOutlierVoxels(forgeVoxels, voxelStep, forgeSphereRadius);
  const coreBuckets = new Map<string, VoxelCell[]>();
  const shellBuckets = new Map<string, VoxelCell[]>();
  const posScratch = new THREE.Vector3();
  const hotSpots: VoxelCell[] = [];
  const glowSurface: VoxelCell[] = [];
  const f = Math.max(0, Math.min(1, floatValue));
  const hotChance = style === "SUN" ? 29 : f >= 1 ? 37 : f >= 0.8 ? 41 : f >= 0.5 ? 47 : 999;
  const brightSet = new Set<string>(palette.slice(-2));

  for (const v of voxels) {
    const ix = Math.round(v.x / voxelStep);
    const iy = Math.round(v.y / voxelStep);
    const iz = Math.round(v.z / voxelStep);
    const dist = Math.sqrt(ix * ix + iy * iy + iz * iz) / Math.max(forgeSphereRadius, 1);
    const hash = (ix * 17 + iy * 31 + iz * 13) & 255;
    let hex = dist < 0.58
      ? palette[hash % 2 === 0 ? 0 : 1]!
      : quantizeToShowcasePalette(
          getShowcaseVoxelHex(rarity, v.color, primaryColor, accentColor, ix, iy, iz, forgeSphereRadius, f),
          palette,
        );
    if (isBattleScarVoxel(planetId, ix, iy, iz, f)) {
      hex = palette[0]!;
    }
    const buckets = dist > 0.82 ? shellBuckets : coreBuckets;
    if (!buckets.has(hex)) buckets.set(hex, []);
    buckets.get(hex)!.push(v);
    if ((style === "RARE" || style === "SUN") && dist > 0.84 && hash % hotChance === 0) hotSpots.push(v);
    if (style === "SUN" && dist > 0.82 && brightSet.has(hex)) hotSpots.push(v);
    if (style === "STANDARD" && dist > 0.82 && brightSet.has(hex) && f >= 0.5) glowSurface.push(v);
    if (f >= 1 && dist > 0.86 && hash % 53 === 0) hotSpots.push(v);
  }

  const placeCells = (
    cells: VoxelCell[],
    mat: THREE.MeshBasicMaterial,
    renderOrder: number,
  ) => {
    const mesh = new THREE.InstancedMesh(boxGeo, mat, cells.length);
    mesh.frustumCulled = false;
    mesh.renderOrder = renderOrder;
    for (let i = 0; i < cells.length; i++) {
      const v = cells[i]!;
      if (style === "BASIC") {
        basicVoxelWorldPos(v, voxelStep, forgeSphereRadius, cubeFill, posScratch);
        voxelDummy.position.copy(posScratch);
        voxelDummy.scale.setScalar(basicVoxelScale(v, voxelStep, forgeSphereRadius));
      } else {
        rareVoxelWorldPos(v, voxelStep, forgeSphereRadius, cubeFill, posScratch);
        voxelDummy.position.copy(posScratch);
        voxelDummy.scale.setScalar(rareVoxelScale(v, voxelStep, forgeSphereRadius));
      }
      voxelDummy.updateMatrix();
      mesh.setMatrixAt(i, voxelDummy.matrix);
    }
    mesh.count = cells.length;
    mesh.instanceMatrix.needsUpdate = true;
    group.add(mesh);
  };

  for (const [hex, cells] of coreBuckets) {
    placeCells(cells, new THREE.MeshBasicMaterial({ color: hex, toneMapped: false }), 0);
  }
  for (const [hex, cells] of shellBuckets) {
    placeCells(cells, new THREE.MeshBasicMaterial({ color: hex, toneMapped: false }), 1);
  }

  return { hotSpots, glowSurface };
}

/** Farm/Market lab-voxel cards — color buckets + greeble shell + edge lines (no instanceColor). */
function addLabCollectibleBucketMeshes(
  group: THREE.Group,
  forgeVoxels: VoxelCell[],
  boxGeo: THREE.BoxGeometry,
  voxelDummy: THREE.Object3D,
  voxelStep: number,
  forgeSphereRadius: number,
  primaryColor: string,
  accentColor: string,
  rarity: string,
  floatValue: number,
  cubeFill: number,
  edgeScratch: THREE.Vector3,
): THREE.LineSegments {
  const style = getShowcaseRarityStyle(rarity);
  const buckets = new Map<string, Array<{ x: number; y: number; z: number; scale: number }>>();
  const posScratch = new THREE.Vector3();
  const placed: Array<{ x: number; y: number; z: number; scale: number; hex: string }> = [];

  for (const v of forgeVoxels) {
    const ix = Math.round(v.x / voxelStep);
    const iy = Math.round(v.y / voxelStep);
    const iz = Math.round(v.z / voxelStep);
    const hex = getShowcaseVoxelHex(rarity, v.color, primaryColor, accentColor, ix, iy, iz, forgeSphereRadius, floatValue);
    let scale = 1;
    if (style === "BASIC") {
      basicVoxelWorldPos(v, voxelStep, forgeSphereRadius, cubeFill, posScratch);
      scale = basicVoxelScale(v, voxelStep, forgeSphereRadius);
    } else {
      rareVoxelWorldPos(v, voxelStep, forgeSphereRadius, cubeFill, posScratch);
      scale = rareVoxelScale(v, voxelStep, forgeSphereRadius);
    }
    const entry = { x: posScratch.x, y: posScratch.y, z: posScratch.z, scale, hex };
    placed.push(entry);
    const list = buckets.get(hex);
    if (list) list.push(entry);
    else buckets.set(hex, [entry]);
  }

  for (const [hex, cells] of buckets) {
    const mat = new THREE.MeshLambertMaterial({
      color: hex,
      flatShading: true,
      toneMapped: false,
    });
    const mesh = new THREE.InstancedMesh(boxGeo, mat, cells.length);
    mesh.frustumCulled = false;
    for (let i = 0; i < cells.length; i++) {
      const p = cells[i]!;
      voxelDummy.position.set(p.x, p.y, p.z);
      voxelDummy.scale.setScalar(p.scale);
      voxelDummy.rotation.set(0, 0, 0);
      voxelDummy.updateMatrix();
      mesh.setMatrixAt(i, voxelDummy.matrix);
    }
    mesh.count = cells.length;
    mesh.instanceMatrix.needsUpdate = true;
    mesh.userData["labCollectibleBucket"] = true;
    group.add(mesh);
  }

  const tpl = getUnitBoxEdgeTemplate();
  const edgeBuf = new Float32Array(placed.length * tpl.vertCount * 3);
  const cubeSize = voxelStep * cubeFill;
  for (let vi = 0; vi < placed.length; vi++) {
    const p = placed[vi]!;
    voxelDummy.position.set(p.x, p.y, p.z);
    voxelDummy.scale.setScalar(p.scale);
    voxelDummy.rotation.set(0, 0, 0);
    voxelDummy.updateMatrix();
    const scaledCube = cubeSize * p.scale;
    const base = vi * tpl.vertCount * 3;
    for (let j = 0; j < tpl.vertCount; j++) {
      const t = j * 3;
      edgeScratch.set(
        tpl.positions[t]! * scaledCube,
        tpl.positions[t + 1]! * scaledCube,
        tpl.positions[t + 2]! * scaledCube,
      );
      edgeScratch.applyMatrix4(voxelDummy.matrix);
      edgeBuf[base + t] = edgeScratch.x;
      edgeBuf[base + t + 1] = edgeScratch.y;
      edgeBuf[base + t + 2] = edgeScratch.z;
    }
  }

  const edgeBufferGeo = new THREE.BufferGeometry();
  edgeBufferGeo.setAttribute("position", new THREE.BufferAttribute(edgeBuf, 3));
  const edgeLines = new THREE.LineSegments(
    edgeBufferGeo,
    new THREE.LineBasicMaterial({ color: FORGE_VOXEL_EDGE, toneMapped: false }),
  );
  edgeLines.frustumCulled = false;
  edgeLines.renderOrder = 2;
  group.add(edgeLines);
  return edgeLines;
}

/** Farm card — atmosphere halo, perfect-float sparkles, EPIC+ ring. */
function addLabPlanetDecorations(
  group: THREE.Group,
  worldRadius: number,
  primaryColor: string,
  accentColor: string,
  rarity: string,
  floatValue: number,
  forgeVoxels: VoxelCell[],
  voxelStep: number,
  forgeSphereRadius: number,
  cubeFill: number,
  boxGeo: THREE.BoxGeometry,
  voxelDummy: THREE.Object3D,
): void {
  const f = Math.max(0, Math.min(1, floatValue));
  const style = getShowcaseRarityStyle(rarity);
  const posScratch = new THREE.Vector3();

  const atmBackOpacity = 0.07 + 0.14 * f;
  const atmBack = new THREE.Mesh(
    new THREE.SphereGeometry(worldRadius * 1.1, 22, 16),
    new THREE.MeshBasicMaterial({
      color: primaryColor,
      transparent: true,
      opacity: atmBackOpacity,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.BackSide,
      toneMapped: false,
    }),
  );
  atmBack.renderOrder = -2;
  atmBack.userData["planetAtmosphere"] = true;
  atmBack.userData["baseOpacity"] = atmBackOpacity;
  group.add(atmBack);

  const atmRimOpacity = 0.04 + 0.09 * f;
  const atmRim = new THREE.Mesh(
    new THREE.SphereGeometry(worldRadius * 1.04, 22, 16),
    new THREE.MeshBasicMaterial({
      color: accentColor,
      transparent: true,
      opacity: atmRimOpacity,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      toneMapped: false,
    }),
  );
  atmRim.renderOrder = -1;
  atmRim.userData["planetAtmosphere"] = true;
  atmRim.userData["baseOpacity"] = atmRimOpacity;
  group.add(atmRim);

  if (f >= 0.98 || getShowcaseRarityStyle(rarity) === "SUN") {
    const sparkles: VoxelCell[] = [];
    for (const v of forgeVoxels) {
      const ix = Math.round(v.x / voxelStep);
      const iy = Math.round(v.y / voxelStep);
      const iz = Math.round(v.z / voxelStep);
      const dist = Math.sqrt(ix * ix + iy * iy + iz * iz) / Math.max(forgeSphereRadius, 1);
      const hash = (ix * 17 + iy * 31 + iz * 13) & 255;
      if (dist > 0.86 && hash % 37 === 0) sparkles.push(v);
    }
    if (sparkles.length > 0) {
      const glowMat = new THREE.MeshBasicMaterial({
        color: "#fffef0",
        transparent: true,
        opacity: 0.62,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        toneMapped: false,
      });
      const glowInst = new THREE.InstancedMesh(boxGeo, glowMat, sparkles.length);
      glowInst.frustumCulled = false;
      glowInst.renderOrder = 4;
      for (let i = 0; i < sparkles.length; i++) {
        const v = sparkles[i]!;
        if (style === "BASIC") {
          basicVoxelWorldPos(v, voxelStep, forgeSphereRadius, cubeFill, posScratch);
          voxelDummy.scale.setScalar(basicVoxelScale(v, voxelStep, forgeSphereRadius) * 1.18);
        } else {
          rareVoxelWorldPos(v, voxelStep, forgeSphereRadius, cubeFill, posScratch);
          voxelDummy.scale.setScalar(1.18);
        }
        voxelDummy.position.copy(posScratch);
        voxelDummy.rotation.set(0, 0, 0);
        voxelDummy.updateMatrix();
        glowInst.setMatrixAt(i, voxelDummy.matrix);
      }
      glowInst.count = sparkles.length;
      glowInst.instanceMatrix.needsUpdate = true;
      glowInst.userData["planetGlow"] = true;
      glowInst.userData["perfectFloatSparkle"] = true;
      group.add(glowInst);
    }

    const coronaOpacity = 0.1 + 0.08 * Math.sin(0);
    const corona = new THREE.Mesh(
      new THREE.SphereGeometry(worldRadius * 1.14, 18, 12),
      new THREE.MeshBasicMaterial({
        color: primaryColor,
        transparent: true,
        opacity: coronaOpacity,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.BackSide,
        toneMapped: false,
      }),
    );
    corona.renderOrder = -3;
    corona.userData["planetCorona"] = true;
    corona.userData["baseOpacity"] = 0.12;
    group.add(corona);
  }

  if (shouldPlanetShowRing(rarity, f)) {
    const ringOpacity = 0.16 + 0.22 * f;
    const ringMat = new THREE.MeshBasicMaterial({
      color: accentColor,
      transparent: true,
      opacity: ringOpacity,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
      toneMapped: false,
    });
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(worldRadius * 1.38, worldRadius * 1.78, 56),
      ringMat,
    );
    ring.rotation.x = Math.PI / 2.25;
    ring.rotation.z = 0.12;
    ring.renderOrder = 3;
    ring.userData["planetRing"] = true;
    ring.userData["baseOpacity"] = ringOpacity;
    group.add(ring);

    const innerRing = new THREE.Mesh(
      new THREE.RingGeometry(worldRadius * 1.3, worldRadius * 1.42, 48),
      ringMat.clone(),
    );
    const innerMat = innerRing.material as THREE.MeshBasicMaterial;
    innerMat.opacity = ringOpacity * 0.55;
    innerRing.rotation.copy(ring.rotation);
    innerRing.rotation.z += 0.06;
    innerRing.renderOrder = 3;
    innerRing.userData["planetRing"] = true;
    innerRing.userData["baseOpacity"] = innerMat.opacity;
    group.add(innerRing);
  }
}

function basicGreebleOffset(
  ix: number,
  iy: number,
  iz: number,
  radius: number,
  step: number,
): number {
  const len = Math.sqrt(ix * ix + iy * iy + iz * iz);
  const dist = len / Math.max(radius, 1);
  if (dist < 0.78) return 0;
  const hash = (ix * 17 + iy * 31 + iz * 13) & 255;
  const panelHash = (Math.floor(ix / 2) * 7 + Math.floor(iy / 2) * 13 + Math.floor(iz / 2) * 11) & 255;
  if (panelHash % 5 === 0) return -step * 0.34;
  if (hash % 9 === 0) return step * 0.26;
  if (hash % 13 === 0) return -step * 0.16;
  if (hash % 17 === 0) return step * 0.14;
  return 0;
}

/** Surface greeble — recessed panels + protruding blocks on a round envelope. */
function basicVoxelWorldPos(
  v: VoxelCell,
  step: number,
  radius: number,
  cubeFill: number,
  out: THREE.Vector3,
): void {
  const ix = Math.round(v.x / step);
  const iy = Math.round(v.y / step);
  const iz = Math.round(v.z / step);
  const len = Math.sqrt(ix * ix + iy * iy + iz * iz);
  if (len < 0.001) {
    out.set(0, 0, 0);
    return;
  }
  const dist = len / Math.max(radius, 1);
  const nx = ix / len;
  const ny = iy / len;
  const nz = iz / len;
  const half = step * cubeFill * 0.5;
  const outerR = radius * step;

  if (dist > 0.74) {
    let centerR = Math.max(half, outerR - half);
    centerR = Math.max(half, centerR + basicGreebleOffset(ix, iy, iz, radius, step));
    out.set(nx * centerR, ny * centerR, nz * centerR);
    return;
  }
  out.set(v.x, v.y, v.z);
}

function basicVoxelScale(v: VoxelCell, step: number, radius: number): number {
  const ix = Math.round(v.x / step);
  const iy = Math.round(v.y / step);
  const iz = Math.round(v.z / step);
  const len = Math.sqrt(ix * ix + iy * iy + iz * iz);
  const dist = len / Math.max(radius, 1);
  if (dist < 0.78) return 1;
  const hash = (ix * 17 + iy * 31 + iz * 13) & 255;
  const panelHash = (Math.floor(ix / 2) * 7 + Math.floor(iy / 2) * 13 + Math.floor(iz / 2) * 11) & 255;
  if (hash % 9 === 0) return 1.06;
  if (panelHash % 5 === 0) return 0.94;
  return 1;
}

function isGlassPart(part: MeshPart): boolean {
  return typeof part.color === "string" && GLASS_COLORS.has(part.color.toLowerCase());
}

function setupRenderer(renderer: THREE.WebGLRenderer, showcase: boolean): void {
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  if (showcase) {
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.18;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  } else {
    renderer.toneMapping = THREE.NoToneMapping;
    renderer.toneMappingExposure = 1;
    renderer.shadowMap.enabled = false;
  }
}

function loadStudioHDRI(renderer: THREE.WebGLRenderer): Promise<THREE.Texture> {
  if (cachedStudioEnv) return Promise.resolve(cachedStudioEnv);
  if (studioEnvPromise) return studioEnvPromise;
  studioEnvPromise = new Promise((resolve, reject) => {
    const loader = new RGBELoader();
    loader.load(
      STUDIO_HDR,
      (hdr) => {
        const pmrem = new THREE.PMREMGenerator(renderer);
        pmrem.compileEquirectangularShader();
        const env = pmrem.fromEquirectangular(hdr).texture;
        hdr.dispose();
        pmrem.dispose();
        cachedStudioEnv = env;
        resolve(env);
      },
      undefined,
      () => {
        studioEnvPromise = null;
        reject(new Error("HDRI load failed"));
      },
    );
  });
  return studioEnvPromise;
}

function createStudioEnvironment(renderer: THREE.WebGLRenderer): THREE.Texture {
  const pmrem = new THREE.PMREMGenerator(renderer);
  pmrem.compileEquirectangularShader();
  const room = new RoomEnvironment();
  const envMap = pmrem.fromScene(room, 0.04).texture;
  pmrem.dispose();
  return envMap;
}

function addShowcaseGround(
  scene: THREE.Scene,
  maxDim: number,
  accentColor: string,
): THREE.Object3D[] {
  const extras: THREE.Object3D[] = [];

  const floor = new THREE.Mesh(
    new THREE.CircleGeometry(maxDim * 1.1, 64),
    new THREE.MeshStandardMaterial({
      color: 0x0a0c14,
      roughness: 0.92,
      metalness: 0.04,
      transparent: true,
      opacity: 0.55,
    }),
  );
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -maxDim * 0.5;
  floor.receiveShadow = true;
  floor.renderOrder = -3;
  scene.add(floor);
  extras.push(floor);

  const shadow = new THREE.Mesh(
    new THREE.CircleGeometry(maxDim * 0.58, 48),
    new THREE.MeshBasicMaterial({
      color: 0x000000,
      transparent: true,
      opacity: 0.38,
      depthWrite: false,
    }),
  );
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = -maxDim * 0.495;
  shadow.renderOrder = -2;
  scene.add(shadow);
  extras.push(shadow);

  const accentGlow = new THREE.Mesh(
    new THREE.CircleGeometry(maxDim * 0.34, 32),
    new THREE.MeshBasicMaterial({
      color: new THREE.Color(accentColor),
      transparent: true,
      opacity: 0.09,
      depthWrite: false,
    }),
  );
  accentGlow.rotation.x = -Math.PI / 2;
  accentGlow.position.y = -maxDim * 0.494;
  accentGlow.renderOrder = -1;
  scene.add(accentGlow);
  extras.push(accentGlow);

  return extras;
}

/** Infinite space grid for Lab voxel forge — no floor disc. */
/** Medium grey clay voxels while assembling in the Lab. */
const FORGE_CLAY_LIGHT = 0xbcbcbc;
const FORGE_CLAY_MID = 0xa8a8a8;
const FORGE_CLAY_HI = 0xc4c4c4;

function forgeClayTone(index: number): THREE.Color {
  const tones = [FORGE_CLAY, FORGE_CLAY_LIGHT, FORGE_CLAY_MID, FORGE_CLAY_HI];
  return new THREE.Color(tones[index % tones.length]!);
}

function addForgeSpaceGrid(scene: THREE.Scene, maxDim: number): THREE.Object3D[] {
  const extras: THREE.Object3D[] = [];
  const span = maxDim * 3.6;
  const cells = 22;

  const tuneGrid = (grid: THREE.GridHelper, opacity: number) => {
    const mats = Array.isArray(grid.material) ? grid.material : [grid.material];
    for (const m of mats) {
      m.transparent = true;
      m.opacity = opacity;
      m.depthWrite = false;
    }
    grid.renderOrder = -10;
  };

  const floorGrid = new THREE.GridHelper(span, cells, 0xb8c0cc, 0x6a7280);
  tuneGrid(floorGrid, 0.38);
  floorGrid.position.y = -maxDim * 0.46;
  scene.add(floorGrid);
  extras.push(floorGrid);

  const backGrid = new THREE.GridHelper(span, cells, 0xa0a8b8, 0x505868);
  tuneGrid(backGrid, 0.2);
  backGrid.rotation.x = Math.PI / 2;
  backGrid.position.set(0, maxDim * 0.05, -maxDim * 1.05);
  scene.add(backGrid);
  extras.push(backGrid);

  const starGeo = new THREE.BufferGeometry();
  const starCount = 120;
  const starPos = new Float32Array(starCount * 3);
  for (let i = 0; i < starCount; i++) {
    const r = maxDim * (1.8 + Math.random() * 2.4);
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(2 * Math.random() - 1);
    starPos[i * 3] = r * Math.sin(phi) * Math.cos(theta);
    starPos[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta) * 0.55;
    starPos[i * 3 + 2] = r * Math.cos(phi);
  }
  starGeo.setAttribute("position", new THREE.BufferAttribute(starPos, 3));
  const stars = new THREE.Points(
    starGeo,
    new THREE.PointsMaterial({
      color: 0xc8d8f0,
      size: maxDim * 0.028,
      transparent: true,
      opacity: 0.55,
      depthWrite: false,
      sizeAttenuation: true,
    }),
  );
  stars.renderOrder = -12;
  scene.add(stars);
  extras.push(stars);

  return extras;
}

interface PixelPass {
  renderScene: (scene: THREE.Scene, camera: THREE.Camera) => void;
  dispose: () => void;
}

function createPixelPass(
  renderer: THREE.WebGLRenderer,
  outputSize: number,
  transparent: boolean,
): PixelPass {
  const getPixelSize = () => Math.max(PIXEL_MIN_INTERNAL, Math.floor(outputSize / PIXEL_SCALE));

  const fullRT = new THREE.WebGLRenderTarget(1, 1, {
    minFilter: THREE.LinearFilter,
    magFilter: THREE.LinearFilter,
    generateMipmaps: false,
    depthBuffer: true,
    stencilBuffer: false,
  });

  const pixelRT = new THREE.WebGLRenderTarget(1, 1, {
    minFilter: THREE.NearestFilter,
    magFilter: THREE.NearestFilter,
    generateMipmaps: false,
    depthBuffer: false,
    stencilBuffer: false,
  });

  const ortho = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

  const downsampleScene = new THREE.Scene();
  const downsampleMat = new THREE.MeshBasicMaterial({
    map: fullRT.texture,
    toneMapped: false,
  });
  downsampleScene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), downsampleMat));

  const upscaleScene = new THREE.Scene();
  const upscaleMat = new THREE.MeshBasicMaterial({
    map: pixelRT.texture,
    transparent,
    depthTest: false,
    depthWrite: false,
    toneMapped: false,
  });
  upscaleScene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), upscaleMat));

  const renderScene = (scene: THREE.Scene, camera: THREE.Camera) => {
    const dpr = renderer.getPixelRatio();
    const w = Math.max(1, Math.floor(outputSize * dpr));
    const px = getPixelSize();

    if (fullRT.width !== w || fullRT.height !== w) fullRT.setSize(w, w);
    if (pixelRT.width !== px || pixelRT.height !== px) pixelRT.setSize(px, px);

    const prevToneMapping = renderer.toneMapping;

    // 1) Full-res 3D — smooth while rotating
    renderer.setRenderTarget(fullRT);
    renderer.setClearColor(0x000000, transparent ? 0 : 1);
    renderer.render(scene, camera);

    // 2) Screen-aligned downsample — stable pixel grid (fixed screen blocks)
    fullRT.texture.minFilter = THREE.NearestFilter;
    fullRT.texture.magFilter = THREE.NearestFilter;
    renderer.setRenderTarget(pixelRT);
    renderer.setClearColor(0x000000, transparent ? 0 : 1);
    renderer.render(downsampleScene, ortho);

    // 3) Nearest upscale to canvas
    renderer.setRenderTarget(null);
    renderer.toneMapping = THREE.NoToneMapping;
    renderer.render(upscaleScene, ortho);
    renderer.toneMapping = prevToneMapping;
  };

  return {
    renderScene,
    dispose: () => {
      fullRT.dispose();
      pixelRT.dispose();
      downsampleMat.dispose();
      upscaleMat.dispose();
      downsampleScene.children.forEach((c) => (c as THREE.Mesh).geometry.dispose());
      upscaleScene.children.forEach((c) => (c as THREE.Mesh).geometry.dispose());
    },
  };
}

function inferProfile(part: MeshPart): MaterialProfile {
  if (part.profile) return part.profile;
  if (isGlassPart(part)) return "glass";
  if ((part.metal ?? 0) >= 0.55) return "metal";
  if (part.color === RUBBER_CONST) return "rubber";
  return "default";
}

const RUBBER_CONST = "#1e1e1e";

function applyProfileToMaterial(
  mat: PartMaterial,
  part: MeshPart,
  color: THREE.Color,
  showcase: boolean,
  envMap: THREE.Texture | null,
): void {
  if (!(mat instanceof THREE.MeshPhysicalMaterial)) return;

  const profile = inferProfile(part);
  mat.color.copy(color);
  mat.envMap = envMap;
  mat.envMapIntensity = showcase ? 1.35 : 1.05;

  mat.transmission = 0;
  mat.thickness = 0;
  mat.sheen = 0;
  mat.sheenRoughness = 0.5;
  mat.sheenColor.set(0xffffff);
  mat.clearcoat = 0;
  mat.clearcoatRoughness = 0.2;
  mat.ior = 1.5;

  switch (profile) {
    case "fur":
      mat.metalness = 0;
      mat.roughness = part.rough ?? 0.78;
      mat.sheen = 1;
      mat.sheenRoughness = 0.82;
      mat.sheenColor.set("#fff8f0");
      mat.clearcoat = 0.12;
      mat.clearcoatRoughness = 0.45;
      break;
    case "skin":
      mat.metalness = 0;
      mat.roughness = part.rough ?? 0.52;
      mat.sheen = 0.65;
      mat.sheenRoughness = 0.55;
      mat.sheenColor.set("#ffe8d8");
      mat.clearcoat = 0.08;
      break;
    case "food":
      mat.metalness = 0;
      mat.roughness = part.rough ?? 0.58;
      mat.clearcoat = 0.42;
      mat.clearcoatRoughness = 0.32;
      break;
    case "food_glossy":
      mat.metalness = 0;
      mat.roughness = part.rough ?? 0.42;
      mat.clearcoat = 0.88;
      mat.clearcoatRoughness = 0.22;
      mat.sheen = 0.35;
      mat.sheenRoughness = 0.4;
      mat.sheenColor.set("#fff5e0");
      break;
    case "metal":
      mat.metalness = Math.min(1, (part.metal ?? 0.75) + 0.15);
      mat.roughness = Math.max(0.1, (part.rough ?? 0.28) - 0.08);
      mat.clearcoat = 0.55;
      mat.clearcoatRoughness = 0.15;
      break;
    case "glass":
      mat.metalness = 0.04;
      mat.roughness = 0.04;
      mat.transmission = 0.82;
      mat.thickness = 0.4;
      mat.ior = 1.48;
      mat.clearcoat = 0.75;
      mat.clearcoatRoughness = 0.08;
      break;
    case "rubber":
      mat.metalness = 0;
      mat.roughness = part.rough ?? 0.88;
      mat.sheen = 0.2;
      mat.sheenRoughness = 0.7;
      break;
    case "fabric":
      mat.metalness = 0;
      mat.roughness = part.rough ?? 0.72;
      mat.sheen = 0.85;
      mat.sheenRoughness = 0.75;
      break;
    case "liquid":
      mat.metalness = 0;
      mat.roughness = part.rough ?? 0.28;
      mat.transmission = 0.55;
      mat.thickness = 0.25;
      mat.clearcoat = 0.95;
      mat.clearcoatRoughness = 0.1;
      break;
    default:
      mat.metalness = part.metal ?? 0.22;
      mat.roughness = part.rough ?? 0.48;
      mat.clearcoat = showcase ? 0.25 : 0;
      mat.clearcoatRoughness = 0.18;
      break;
  }
}

export interface ForgeMeshHandle {
  /** Screen-space targets (canvas center origin) for parts currently assembling. */
  getPartScreenTargets: (maxCount?: number) => Array<{ x: number; y: number; strength?: number }>;
  /** Next voxel landing slot — for pixel-in particle on the latest tap. */
  getIncomingVoxelTarget: () => { x: number; y: number; color: string; sizePx: number } | null;
  /** Lab forge — place the next voxel at the tap ray (or sequential if no point). */
  queueForgeTapPlacement: (point?: { x: number; y: number }) => void;
}

interface ObjectMesh3DProps {
  parts?: MeshPart[];
  shapeId?: string;
  primaryColor: string;
  accentColor: string;
  /** 0–1 assembly progress */
  progress?: number;
  revealed?: boolean;
  size: number;
  onTap?: (point?: { x: number; y: number }) => void;
  autoSpin?: boolean;
  /** Lab forge — block-by-block Minecraft build (not part fly-in). */
  forgeVoxelBuild?: boolean;
  /** After last tap — close gaps / inflate into a round planet shell before morph-out. */
  forgeSeal?: boolean;
  /** Lab forge cinematic — burst + color paint without remounting the WebGL scene. */
  forgeRevealPhase?: "idle" | "wheel" | "flash" | "waiting" | "revealed";
  /** Softer particle timing (auto-tap). */
  forgeTapRelaxed?: boolean;
  interactive?: boolean;
  /** Solid dark backdrop instead of transparent canvas (Farm detail view). */
  opaqueBackground?: boolean;
  /** Lower GPU cost for live Lab forging. */
  performanceMode?: boolean;
  onGlFailed?: () => void;
  onGlContextLost?: () => void;
  /** Farm planet card rarity — premium voxel + float grading. */
  planetRarity?: string;
  /** Cosmetic float in [0, 1] — drives voxel wear / vividness. */
  displayFloat?: number;
  /** Planet id — stable seed for battle-scar placement. */
  planetId?: string;
  /** Supersample planet card thumbs (Farm/Market). */
  thumbHiQuality?: boolean;
  /** Lab backdrop forge — keep one GL session; space grid bg; simple rarity paint at end. */
  labForgeBackdrop?: boolean;
}

function resolveColor(c: MeshPart["color"], primary: string, accent: string): string {
  if (c === "p") return primary;
  if (c === "a") return accent;
  return c;
}

function makeGeometry(part: MeshPart, detail: GeoDetail = "standard"): THREE.BufferGeometry {
  const capSeg = detail === "ultra" ? 16 : detail === "showcase" ? 12 : detail === "low" ? 4 : 8;
  const radSeg = detail === "ultra" ? 48 : detail === "showcase" ? 32 : detail === "low" ? 10 : 18;

  if (detail === "low") {
    switch (part.prim) {
      case "sphere":
        return new THREE.SphereGeometry(part.sx, 10, 8);
      case "capsule":
        return new THREE.CapsuleGeometry(part.sx, part.sy, 4, 10);
      case "cyl":
        return new THREE.CylinderGeometry(part.sx, part.sz, part.sy, 10);
      case "cone":
        return new THREE.ConeGeometry(part.sx, part.sy, 10);
      case "torus":
        return new THREE.TorusGeometry(part.sx, part.sy, 8, 12);
      default:
        return new THREE.BoxGeometry(part.sx, part.sy, part.sz);
    }
  }
  if (detail === "showcase" || detail === "ultra") {
    switch (part.prim) {
      case "sphere":
        return new THREE.SphereGeometry(part.sx, radSeg, Math.floor(radSeg * 0.85));
      case "capsule":
        return new THREE.CapsuleGeometry(part.sx, part.sy, capSeg, radSeg);
      case "cyl":
        return new THREE.CylinderGeometry(part.sx, part.sz, part.sy, radSeg);
      case "cone":
        return new THREE.ConeGeometry(part.sx, part.sy, radSeg);
      case "torus":
        return new THREE.TorusGeometry(part.sx, part.sy, capSeg + 4, radSeg);
      default:
        return new THREE.BoxGeometry(part.sx, part.sy, part.sz);
    }
  }
  switch (part.prim) {
    case "sphere":
      return new THREE.SphereGeometry(part.sx, 18, 14);
    case "capsule":
      return new THREE.CapsuleGeometry(part.sx, part.sy, 8, 16);
    case "cyl":
      return new THREE.CylinderGeometry(part.sx, part.sz, part.sy, 14);
    case "cone":
      return new THREE.ConeGeometry(part.sx, part.sy, 14);
    case "torus":
      return new THREE.TorusGeometry(part.sx, part.sy, 10, 18);
    default:
      return new THREE.BoxGeometry(part.sx, part.sy, part.sz);
  }
}

function createPartMaterial(
  part: MeshPart,
  showcase: boolean,
  envMap: THREE.Texture | null,
  usePhysical: boolean,
  pixelMode: boolean,
): PartMaterial {
  if (showcase && usePhysical) {
    const mat = new THREE.MeshPhysicalMaterial({ color: "#888888", flatShading: false });
    applyProfileToMaterial(mat, part, new THREE.Color("#888888"), showcase, envMap);
    return mat;
  }

  const metal = part.metal ?? 0.25;
  const rough = part.rough ?? 0.55;
  const glass = isGlassPart(part);

  if (showcase && usePhysical && (glass || metal >= 0.4)) {
    return new THREE.MeshPhysicalMaterial({
      color: "#3a3a3a",
      flatShading: false,
      metalness: glass ? 0.05 : Math.min(1, metal + 0.15),
      roughness: glass ? 0.06 : Math.max(0.12, rough - 0.12),
      transmission: glass ? 0.88 : 0,
      thickness: glass ? 0.35 : 0,
      ior: 1.48,
      clearcoat: glass ? 0.65 : 0.35,
      clearcoatRoughness: 0.18,
      envMap: envMap ?? undefined,
      envMapIntensity: glass ? 1.35 : 1.1,
    });
  }

  return new THREE.MeshStandardMaterial({
    color: FORGE_CLAY,
    flatShading: false,
    metalness: Math.min(metal, 0.08),
    roughness: Math.max(rough, 0.72),
    envMap: showcase && envMap ? envMap : undefined,
    envMapIntensity: showcase ? 1.05 : 1,
  });
}

function scatterDir(id: string): THREE.Vector3 {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0;
  const a = ((h >>> 0) % 628) / 100;
  const b = (((h >>> 8) % 314) / 100) - 0.5;
  return new THREE.Vector3(Math.cos(a), 0.4 + b, Math.sin(a)).normalize();
}

function computeForgeBounds(meshParts: MeshPart[], forgeVoxels: VoxelCell[], voxelStep: number): THREE.Box3 {
  const box = new THREE.Box3();
  const half = Math.max(voxelStep, FORGE_VOXEL_SIZE) * 0.55;

  if (forgeVoxels.length > 0) {
    for (const v of forgeVoxels) {
      box.expandByPoint(new THREE.Vector3(v.x - half, v.y - half, v.z - half));
      box.expandByPoint(new THREE.Vector3(v.x + half, v.y + half, v.z + half));
    }
  } else {
    for (const part of meshParts) {
      const hx = part.sx / 2;
      const hy = part.sy / 2;
      const hz = part.sz / 2;
      box.expandByPoint(new THREE.Vector3(part.x - hx, part.y - hy, part.z - hz));
      box.expandByPoint(new THREE.Vector3(part.x + hx, part.y + hy, part.z + hz));
    }
  }

  if (box.isEmpty()) {
    box.set(new THREE.Vector3(-0.5, -0.5, -0.5), new THREE.Vector3(0.5, 0.5, 0.5));
  }
  return box;
}

/** Clay silhouette assembles while tapping, then paints with rarity colors. */
export const ObjectMesh3D = forwardRef<ForgeMeshHandle, ObjectMesh3DProps>(function ObjectMesh3D({
  parts,
  shapeId,
  primaryColor,
  accentColor,
  progress = 0,
  revealed = false,
  size,
  onTap,
  autoSpin = true,
  interactive = true,
  forgeVoxelBuild = false,
  forgeSeal = false,
  forgeRevealPhase = "idle",
  forgeTapRelaxed = false,
  opaqueBackground = false,
  performanceMode = false,
  onGlFailed,
  onGlContextLost,
  planetRarity,
  displayFloat,
  planetId = "planet",
  thumbHiQuality,
  labForgeBackdrop = false,
}, ref) {
  const mountRef = useRef<HTMLDivElement>(null);
  const onTapRef = useRef(onTap);
  const onGlFailedRef = useRef(onGlFailed);
  const onGlContextLostRef = useRef(onGlContextLost);
  onGlFailedRef.current = onGlFailed;
  onGlContextLostRef.current = onGlContextLost;
  const groupRef = useRef<THREE.Group | null>(null);
  const partsRef = useRef<MeshPart[]>([]);
  const voxelsRef = useRef<VoxelCell[]>([]);
  const voxelStepRef = useRef(FORGE_VOXEL_SIZE);
  const forgeEdgeLinesRef = useRef<THREE.LineSegments | null>(null);
  const forgeEdgePositionsRef = useRef<Float32Array | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const assemblyRef = useRef(progress);
  const stateRef = useRef({
    progress,
    revealed,
    primaryColor,
    accentColor,
    planetRarity: planetRarity ?? "BASIC",
    displayFloat: typeof displayFloat === "number" ? displayFloat : 1,
  });
  const forgeSealRef = useRef(forgeSeal);
  const forgeRevealPhaseRef = useRef(forgeRevealPhase);
  const forgeSphereRadiusRef = useRef(4);
  const forgeWorldRadiusRef = useRef(2);
  const displayFloatRef = useRef(typeof displayFloat === "number" ? displayFloat : 1);
  const placedMaskRef = useRef<boolean[]>([]);
  const lastPlacedIdxRef = useRef(-1);
  const dropAnimStartRef = useRef(0);
  const tapPickScratch = useRef(new THREE.Vector3());
  const raycasterRef = useRef(new THREE.Raycaster());
  onTapRef.current = onTap;
  forgeSealRef.current = forgeSeal;
  forgeRevealPhaseRef.current = forgeRevealPhase;
  displayFloatRef.current = typeof displayFloat === "number" && Number.isFinite(displayFloat) ? displayFloat : 1;
  stateRef.current = {
    progress,
    revealed,
    primaryColor,
    accentColor,
    planetRarity: planetRarity ?? "BASIC",
    displayFloat: displayFloatRef.current,
  };

  useEffect(() => {
    if (progress <= 0 && placedMaskRef.current.length > 0) {
      placedMaskRef.current.fill(false);
      lastPlacedIdxRef.current = -1;
    }
  }, [progress]);

  const meshParts = parts && parts.length > 0 ? parts : DEFAULT_PARTS;

  useImperativeHandle(ref, () => ({
    queueForgeTapPlacement(point?: { x: number; y: number }) {
      if (!labForgeBackdrop || voxelsRef.current.length === 0) return;
      const list = voxelsRef.current;
      let placed = placedMaskRef.current;
      if (placed.length !== list.length) {
        placed = new Array(list.length).fill(false);
        placedMaskRef.current = placed;
      }
      const camera = cameraRef.current;
      const group = groupRef.current;
      const renderer = rendererRef.current;
      if (!camera || !group || !renderer) return;

      const morphT = labForgeMorphT(assemblyRef.current);
      const vec = tapPickScratch.current;
      let bestIdx = -1;
      let bestScore = Infinity;

      if (point && Number.isFinite(point.x) && Number.isFinite(point.y)) {
        const w = renderer.domElement.clientWidth;
        const h = renderer.domElement.clientHeight;
        if (w > 0 && h > 0) {
          const ndc = new THREE.Vector2(point.x / (w / 2), -point.y / (h / 2));
          raycasterRef.current.setFromCamera(ndc, camera);
          const camWorld = new THREE.Vector3();
          camera.getWorldPosition(camWorld);
          const groupWorld = new THREE.Vector3();
          group.getWorldPosition(groupWorld);
          for (let i = 0; i < list.length; i++) {
            if (placed[i]) continue;
            resolveForgeVoxelPosition(list[i]!, morphT, vec);
            const world = vec.clone();
            group.localToWorld(world);
            const normal = world.clone().sub(groupWorld);
            const nLen = normal.length();
            if (nLen < 1e-6) continue;
            normal.multiplyScalar(1 / nLen);
            const toCam = camWorld.clone().sub(world).normalize();
            if (normal.dot(toCam) < 0.12) continue;
            const dist = raycasterRef.current.ray.distanceToPoint(world);
            if (dist < bestScore) {
              bestScore = dist;
              bestIdx = i;
            }
          }
        }
      }

      if (bestIdx < 0) {
        bestIdx = placed.findIndex((p) => !p);
      }
      if (bestIdx >= 0 && !placed[bestIdx]) {
        placed[bestIdx] = true;
        lastPlacedIdxRef.current = bestIdx;
        dropAnimStartRef.current = performance.now();
      }
    },
    getIncomingVoxelTarget() {
      const camera = cameraRef.current;
      const renderer = rendererRef.current;
      const group = groupRef.current;
      const list = voxelsRef.current;
      if (!camera || !renderer || !group || list.length === 0) return null;

      const st = stateRef.current;
      const n = list.length;
      const placedCount = Math.min(n, Math.round(Math.min(1, Math.max(0, st.progress)) * n));
      if (placedCount <= 0) return null;

      const idx = placedCount - 1;
      const v = list[idx]!;
      const morphT = labForgeMorphT(assemblyRef.current);
      const w = renderer.domElement.clientWidth;
      const h = renderer.domElement.clientHeight;
      const vec = new THREE.Vector3();
      resolveForgeVoxelPosition(v, morphT, vec);
      group.localToWorld(vec);
      vec.project(camera);
      if (!Number.isFinite(vec.x) || vec.z > 1) return null;

      const sx = vec.x * (w / 2);
      const sy = -vec.y * (h / 2);
      const half = voxelStepRef.current * 0.5;
      const edgeLocal = new THREE.Vector3();
      resolveForgeVoxelPosition(v, morphT, edgeLocal);
      edgeLocal.x += half;
      edgeLocal.y += half;
      const edge = edgeLocal.clone();
      group.localToWorld(edge);
      edge.project(camera);
      const sizePx = Math.max(7, Math.min(22, Math.hypot((edge.x - vec.x) * w, (edge.y - vec.y) * h) * 1.15));

      return { x: sx, y: sy, color: FORGE_CLAY_HEX, sizePx };
    },
    getPartScreenTargets(maxCount = 5) {
      const camera = cameraRef.current;
      const renderer = rendererRef.current;
      const group = groupRef.current;
      const list = voxelsRef.current.length > 0 ? voxelsRef.current : partsRef.current;
      if (!camera || !renderer || !group || list.length === 0) return [];

      const n = list.length;
      const assembly = assemblyRef.current;
      const scaledParts = assembly * n;
      const partsDone = Math.floor(scaledParts);
      const activePartFrac = scaledParts - partsDone;
      const w = renderer.domElement.clientWidth;
      const h = renderer.domElement.clientHeight;
      const vec = new THREE.Vector3();
      const out: Array<{ x: number; y: number; strength?: number }> = [];

      const indices: number[] = [];
      if (partsDone < n) indices.push(partsDone);
      for (let j = 1; j < maxCount && partsDone + j < n; j++) indices.push(partsDone + j);
      if (indices.length === 0 && n > 0) indices.push(n - 1);

      for (let k = 0; k < indices.length && out.length < maxCount; k++) {
        const idx = indices[k]!;
        const part = list[idx]!;
        if (!part) continue;

        const dir = voxelsRef.current.length > 0
          ? new THREE.Vector3(0, 0, 0)
          : scatterDir((part as MeshPart).id);
        let lock = 0;
        if (idx < partsDone) {
          continue;
        } else if (idx === partsDone) {
          lock = 1;
        } else {
          lock = 0.12 + (k % 3) * 0.05;
        }

        const eased = lock * lock * (3 - 2 * lock);
        const scatter = voxelsRef.current.length > 0 ? 0 : (1 - eased) * 1.65;
        const px = voxelsRef.current.length > 0 ? (part as VoxelCell).x : (part as MeshPart).x;
        const py = voxelsRef.current.length > 0 ? (part as VoxelCell).y : (part as MeshPart).y;
        const pz = voxelsRef.current.length > 0 ? (part as VoxelCell).z : (part as MeshPart).z;
        vec.set(
          px + dir.x * scatter,
          py + dir.y * scatter * 0.55,
          pz + dir.z * scatter,
        );
        group.localToWorld(vec);

        vec.project(camera);
        if (!Number.isFinite(vec.x) || vec.z > 1) continue;
        let sx = vec.x * (w / 2);
        let sy = -vec.y * (h / 2);
        const minR = Math.min(w, h) * 0.26;
        const dist = Math.hypot(sx, sy);
        if (dist < minR) {
          const angle = dist < 0.5
            ? ((idx * 2.399963229728653) % (Math.PI * 2))
            : Math.atan2(sy, sx);
          sx = Math.cos(angle) * (minR + k * 8);
          sy = Math.sin(angle) * (minR + k * 8);
        }
        if (Math.hypot(sx, sy) < minR * 0.92) continue;
        const strength = idx === partsDone ? 1 : 0.55 - k * 0.08;
        out.push({ x: sx, y: sy, strength: Math.max(0.35, strength) });
      }

      return out;
    },
  }), []);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount || size <= 0) return;

    const labCollectibleView = forgeVoxelBuild
      && shapeId === FORGE_SPHERE_SHAPE_ID
      && isLabCollectibleVoxelRarity(planetRarity);
    const labCollectibleShowcase = labCollectibleView && revealed && !interactive;
    const planetShowcase = forgeVoxelBuild
      && shapeId === FORGE_SPHERE_SHAPE_ID
      && revealed
      && !interactive
      && !labCollectibleView;
    const premiumPlanetShowcase = planetShowcase;
    const isFloatGraded = !!planetRarity && FLOAT_PLANET_TYPES.has(planetRarity.toUpperCase());
    const effectiveFloat = isFloatGraded && typeof displayFloat === "number" && Number.isFinite(displayFloat)
      ? Math.max(0, Math.min(1, displayFloat))
      : 1;
    const showcaseRarity = planetRarity ?? "BASIC";
    const showcase = isShowcaseView(performanceMode, size, interactive, opaqueBackground, revealed, forgeVoxelBuild, planetShowcase, labCollectibleShowcase);
    const isStaticShowcase = showcase && revealed && !interactive;
    const useForgeVoxels = forgeVoxelBuild;
    const forgeSpaceMode = useForgeVoxels && !revealed && !planetShowcase && !labCollectibleShowcase;
    const pixelMode = showcase && revealed && !performanceMode && !planetShowcase;
    const isLabFarmThumb = labCollectibleShowcase;
    const geoDetail: GeoDetail = performanceMode
      ? "low"
      : pixelMode || (isStaticShowcase && size >= 140)
        ? "showcase"
        : showcase
          ? "showcase"
          : useForgeVoxels
            ? "standard"
            : "standard";
    const usePhysicalMats = showcase && revealed;

    const scene = new THREE.Scene();
    if (showcase && !planetShowcase && !labCollectibleShowcase) scene.background = new THREE.Color(0x060810);
    else if (forgeSpaceMode) scene.background = null;
    const camera = new THREE.PerspectiveCamera(showcase ? 38 : 42, 1, 0.1, 100);
    cameraRef.current = camera;
    const thumbHiFi = (planetShowcase || isLabFarmThumb) && (thumbHiQuality ?? size >= PLANET_THUMB_HIFI_MIN);
    // Farm lab-voxel thumbs: 1:1 canvas like Lab forge — sharp squares via DPR, not supersample downscale.
    const maxDpr = isLabFarmThumb
      ? (performanceMode ? 1.25 : (size > 90 ? 1.75 : 1.25))
      : (planetShowcase)
        ? Math.min(window.devicePixelRatio, thumbHiFi ? 2.75 : 2)
        : performanceMode
          ? 1.25
          : showcase
            ? Math.min(window.devicePixelRatio, size >= 140 ? 3 : 2.5)
            : (size > 90 ? 1.75 : 1.25);
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({
        antialias: isLabFarmThumb
          ? false
          : (planetShowcase || showcase || (!performanceMode && size > 90)),
        alpha: !opaqueBackground,
        premultipliedAlpha: false,
        powerPreference: "high-performance",
        stencil: false,
        depth: true,
      });
    } catch {
      onGlFailedRef.current?.();
      return;
    }
    setupRenderer(renderer, showcase && !planetShowcase && !labCollectibleShowcase);
    renderer.setPixelRatio(maxDpr);
    const planetThumbScale = premiumPlanetShowcase
      ? (thumbHiFi ? 2.5 : 2)
      : PLANET_THUMB_RENDER_SCALE;
    const renderPx = isLabFarmThumb
      ? size
      : planetShowcase
        ? Math.round(size * planetThumbScale)
        : size;
    renderer.setSize(renderPx, renderPx);
    if (planetShowcase || isLabFarmThumb) {
      renderer.domElement.style.width = `${size}px`;
      renderer.domElement.style.height = `${size}px`;
      renderer.domElement.style.imageRendering = "auto";
    }
    if (opaqueBackground) {
      renderer.setClearColor(0x060810, 1);
      renderer.domElement.style.background = "#060810";
    } else {
      renderer.setClearColor(0x000000, 0);
      renderer.domElement.style.background = "transparent";
    }
    renderer.domElement.style.display = "block";
    renderer.domElement.style.pointerEvents = interactive ? "auto" : "none";
    if (pixelMode) {
      renderer.domElement.style.imageRendering = "pixelated";
    }
    mount.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    const pixelPass = pixelMode ? createPixelPass(renderer, size, !opaqueBackground) : null;
    const draw = (cam: THREE.Camera) => {
      if (pixelPass) pixelPass.renderScene(scene, cam);
      else renderer.render(scene, cam);
    };

    const onContextLost = (e: Event) => {
      e.preventDefault();
      disposed = true;
      cancelAnimationFrame(frameId);
      onGlContextLostRef.current?.();
    };
    const onContextRestored = () => {
      if (!disposed) return;
      onGlContextLostRef.current?.();
    };
    renderer.domElement.addEventListener("webglcontextlost", onContextLost);
    renderer.domElement.addEventListener("webglcontextrestored", onContextRestored);

    let envMap: THREE.Texture | null = null;
    let groundExtras: THREE.Object3D[] = [];
    let glbRoot: THREE.Object3D | null = null;
    let disposed = false;
    let frameId = 0;

    if (showcase) {
      loadStudioHDRI(renderer)
        .then((tex) => {
          if (disposed) return;
          envMap = tex;
          scene.environment = tex;
          group.children.forEach((c) => {
            const m = c as THREE.Mesh;
            const mat = m.material as PartMaterial;
            if (mat instanceof THREE.MeshPhysicalMaterial) {
              mat.envMap = tex;
              mat.needsUpdate = true;
            }
          });
        })
        .catch(() => {
          if (disposed) return;
          envMap = createStudioEnvironment(renderer);
          scene.environment = envMap;
        });
    }

    const isStaticThumb = revealed && !interactive && !performanceMode;
    if (!planetShowcase && !labCollectibleShowcase) {
    scene.add(new THREE.AmbientLight(0xffffff, forgeSpaceMode ? 1.05 : showcase ? 0.5 : opaqueBackground ? 0.55 : isStaticThumb ? 0.68 : 0.5));
    if (!performanceMode) {
      scene.add(new THREE.HemisphereLight(
        0xffffff,
        forgeSpaceMode ? 0x909098 : 0x141820,
        showcase ? 0.55 : opaqueBackground ? 0.45 : isStaticThumb ? 0.38 : forgeSpaceMode ? 0.72 : 0.25,
      ));
    }
    const key = new THREE.DirectionalLight(
      0xffffff,
      showcase ? 1.75 : opaqueBackground ? 1.35 : isStaticThumb ? 1.25 : useForgeVoxels ? 1.65 : (performanceMode ? 0.95 : 1.05),
    );
    key.position.set(4, 8, 5);
    if (showcase) {
      key.castShadow = true;
      key.shadow.mapSize.set(1024, 1024);
      key.shadow.bias = -0.0002;
      key.shadow.camera.near = 0.5;
      key.shadow.camera.far = 20;
      key.shadow.camera.left = -3;
      key.shadow.camera.right = 3;
      key.shadow.camera.top = 3;
      key.shadow.camera.bottom = -3;
    }
    scene.add(key);
    if (!performanceMode) {
      const fill = new THREE.DirectionalLight(0x8899cc, showcase ? 0.62 : opaqueBackground ? 0.5 : 0.35);
      fill.position.set(-5, 0, -3);
      scene.add(fill);
      const rim = new THREE.DirectionalLight(0xe8f0ff, showcase ? 0.85 : opaqueBackground ? 0.45 : 0.2);
      rim.position.set(0, 3, -6);
      scene.add(rim);
      const accentLight = new THREE.PointLight(new THREE.Color(accentColor), showcase ? 1.15 : opaqueBackground ? 0.85 : 0.35, showcase ? 16 : 12);
      accentLight.position.set(-2.5, 3.5, 4.5);
      scene.add(accentLight);
      if (showcase) {
        const bounce = new THREE.PointLight(0x9ec5e8, 0.35, 10);
        bounce.position.set(2, -1, 3);
        scene.add(bounce);
      }
    }
    } else if (labCollectibleShowcase) {
      scene.add(new THREE.AmbientLight(0xffffff, 0.58));
      const key = new THREE.DirectionalLight(0xffffff, 1.08);
      key.position.set(2.8, 5.5, 3.8);
      scene.add(key);
      const fill = new THREE.DirectionalLight(0x667799, 0.38);
      fill.position.set(-3.5, 0.5, -2.2);
      scene.add(fill);
      const rim = new THREE.DirectionalLight(0xddeeff, 0.26);
      rim.position.set(0, 2.2, -4.5);
      scene.add(rim);
    }

    const group = new THREE.Group();
    scene.add(group);
    groupRef.current = group;
    partsRef.current = meshParts;

    let forgeVoxels: VoxelCell[] = [];
    let voxelStep = FORGE_VOXEL_SIZE;
    let forgeSphereRadius = 4;
    if (useForgeVoxels) {
      try {
        if (shapeId === FORGE_SPHERE_SHAPE_ID) {
          const bp = getForgeSphereBlueprint(primaryColor, accentColor, {
            display: planetShowcase && !labCollectibleShowcase,
            premiumDisplay: premiumPlanetShowcase,
            labMorph: (useForgeVoxels && !planetShowcase) || labCollectibleShowcase,
          });
          forgeVoxels = bp.voxels;
          voxelStep = bp.step;
          forgeSphereRadius = bp.radius;
        } else {
          const voxelized = meshPartsToVoxels(meshParts);
          forgeVoxels = voxelized.voxels;
          voxelStep = voxelized.step;
        }
      } catch (err) {
        console.warn("[ObjectMesh3D] voxelize failed, falling back to part assembly", err);
      }
    }
    voxelsRef.current = forgeVoxels;
    voxelStepRef.current = voxelStep;
    forgeSphereRadiusRef.current = forgeSphereRadius;
    placedMaskRef.current = new Array(forgeVoxels.length).fill(false);
    lastPlacedIdxRef.current = -1;
    dropAnimStartRef.current = performance.now();
    const voxelDummy = new THREE.Object3D();
    const edgeScratch = new THREE.Vector3();
    let voxelInst: THREE.InstancedMesh | null = null;
    forgeEdgeLinesRef.current = null;
    forgeEdgePositionsRef.current = null;
    const voxelColorScratch = new THREE.Color();
    let forgeBoxGeo: THREE.BoxGeometry | null = null;
    let labThumbCubeFill = LAB_THUMB_CUBE_FILL;
    if (forgeVoxels.length > 0) {
      const n = forgeVoxels.length;
      const cube = voxelStep * FORGE_VOXEL_CUBE_FILL;
      const boxGeo = new THREE.BoxGeometry(cube, cube, cube);
      forgeBoxGeo = boxGeo;

      if (planetShowcase && premiumPlanetShowcase) {
        const posScratch = new THREE.Vector3();
        const premiumCubeFill = 0.94;
        const premiumBoxGeo = new THREE.BoxGeometry(
          voxelStep * premiumCubeFill,
          voxelStep * premiumCubeFill,
          voxelStep * premiumCubeFill,
        );
        const style = getShowcaseRarityStyle(showcaseRarity);
        const { hotSpots, glowSurface } = addPremiumBandVoxelMeshes(
          group,
          forgeVoxels,
          premiumBoxGeo,
          voxelDummy,
          voxelStep,
          forgeSphereRadius,
          primaryColor,
          accentColor,
          showcaseRarity,
          effectiveFloat,
          planetId,
          premiumCubeFill,
        );

        const addPlanetGlowLayer = (
          cells: VoxelCell[],
          color: string,
          opacity: number,
          hot = false,
          useGreeblePos = false,
        ) => {
          if (cells.length === 0) return;
          const glowMat = new THREE.MeshBasicMaterial({
            color,
            transparent: true,
            opacity,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
            toneMapped: false,
          });
          const glowInst = new THREE.InstancedMesh(premiumBoxGeo, glowMat, cells.length);
          glowInst.frustumCulled = false;
          glowInst.renderOrder = 1;
          for (let gi = 0; gi < cells.length; gi++) {
            const v = cells[gi]!;
            if (useGreeblePos) {
              basicVoxelWorldPos(v, voxelStep, forgeSphereRadius, premiumCubeFill, posScratch);
            } else {
              rareVoxelWorldPos(v, voxelStep, forgeSphereRadius, premiumCubeFill, posScratch);
            }
            voxelDummy.position.copy(posScratch);
            voxelDummy.scale.setScalar(1);
            voxelDummy.updateMatrix();
            glowInst.setMatrixAt(gi, voxelDummy.matrix);
          }
          glowInst.count = cells.length;
          glowInst.instanceMatrix.needsUpdate = true;
          glowInst.userData["planetGlow"] = true;
          if (hot) glowInst.userData["hotGlow"] = true;
          group.add(glowInst);
        };

        const glowOpacity = 0.06 + 0.18 * effectiveFloat;
        if (style === "RARE" && hotSpots.length > 0) {
          addPlanetGlowLayer(hotSpots, "#70d0ff", glowOpacity, true);
        } else if (style === "SUN" && hotSpots.length > 0) {
          addPlanetGlowLayer(hotSpots, "#ffee58", 0.24, true);
        } else if (glowSurface.length > 0) {
          addPlanetGlowLayer(glowSurface, primaryColor, glowOpacity * 0.85);
        }
        if (effectiveFloat >= 1 && hotSpots.length > 0 && style !== "RARE" && style !== "SUN") {
          addPlanetGlowLayer(hotSpots, "#ffd700", 0.16, true);
        }
      } else if (labCollectibleShowcase) {
        labThumbCubeFill = LAB_THUMB_CUBE_FILL;
        const labBoxGeo = new THREE.BoxGeometry(
          voxelStep * labThumbCubeFill,
          voxelStep * labThumbCubeFill,
          voxelStep * labThumbCubeFill,
        );
        forgeBoxGeo = labBoxGeo;
        forgeEdgeLinesRef.current = addLabCollectibleBucketMeshes(
          group,
          forgeVoxels,
          labBoxGeo,
          voxelDummy,
          voxelStep,
          forgeSphereRadius,
          primaryColor,
          accentColor,
          showcaseRarity,
          effectiveFloat,
          labThumbCubeFill,
          edgeScratch,
        );
      } else {
      const vMat = planetShowcase
        ? new THREE.MeshBasicMaterial({
            color: 0xffffff,
            vertexColors: true,
            toneMapped: false,
          })
        : new THREE.MeshBasicMaterial({
            color: FORGE_CLAY,
            toneMapped: false,
          });
      voxelInst = new THREE.InstancedMesh(boxGeo, vMat, n);
      voxelInst.frustumCulled = false;
      voxelInst.castShadow = false;

      const tpl = getUnitBoxEdgeTemplate();
      const edgeBuf = new Float32Array(n * tpl.vertCount * 3);
      const edgeBufferGeo = new THREE.BufferGeometry();
      edgeBufferGeo.setAttribute("position", new THREE.BufferAttribute(edgeBuf, 3));
      const edgeMat = planetShowcase
        ? new THREE.LineBasicMaterial({
            color: new THREE.Color(accentColor).lerp(new THREE.Color("#ffffff"), 0.35),
            transparent: true,
            opacity: 0.28,
            toneMapped: false,
            depthWrite: false,
          })
        : new THREE.LineBasicMaterial({ color: FORGE_VOXEL_EDGE, toneMapped: false });
      const edgeLines = new THREE.LineSegments(edgeBufferGeo, edgeMat);
      edgeLines.frustumCulled = false;
      edgeLines.renderOrder = 2;
      forgeEdgeLinesRef.current = edgeLines;
      forgeEdgePositionsRef.current = edgeBuf;

      if (planetShowcase) {
        const surfaceIndices: number[] = [];
        for (let vi = 0; vi < n; vi++) {
          const v = forgeVoxels[vi]!;
          const ix = Math.round(v.x / voxelStep);
          const iy = Math.round(v.y / voxelStep);
          const iz = Math.round(v.z / voxelStep);
          const dist = Math.sqrt(ix * ix + iy * iy + iz * iz) / Math.max(forgeSphereRadius, 1);
          if (dist > 0.82) surfaceIndices.push(vi);

          voxelDummy.position.set(v.x, v.y, v.z);
          voxelDummy.scale.setScalar(1);
          voxelDummy.updateMatrix();
          voxelInst.setMatrixAt(vi, voxelDummy.matrix);
          showcaseVoxelColor(v, voxelStep, forgeSphereRadius, primaryColor, accentColor, voxelColorScratch, showcaseRarity, effectiveFloat);
          voxelInst.setColorAt(vi, voxelColorScratch);

          const base = vi * tpl.vertCount * 3;
          const cubeSize = voxelStep * FORGE_VOXEL_CUBE_FILL;
          for (let j = 0; j < tpl.vertCount; j++) {
            const t = j * 3;
            edgeScratch.set(
              tpl.positions[t]! * cubeSize,
              tpl.positions[t + 1]! * cubeSize,
              tpl.positions[t + 2]! * cubeSize,
            );
            edgeScratch.applyMatrix4(voxelDummy.matrix);
            edgeBuf[base + t] = edgeScratch.x;
            edgeBuf[base + t + 1] = edgeScratch.y;
            edgeBuf[base + t + 2] = edgeScratch.z;
          }
        }
        voxelInst.count = n;
        voxelInst.instanceMatrix.needsUpdate = true;
        if (voxelInst.instanceColor) voxelInst.instanceColor.needsUpdate = true;
        edgeLines.geometry.setDrawRange(0, n * tpl.vertCount);

        const gN = surfaceIndices.length;
        if (gN > 0) {
          const glowMat = new THREE.MeshBasicMaterial({
            color: new THREE.Color(accentColor),
            transparent: true,
            opacity: 0.14,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
            toneMapped: false,
          });
          const glowInst = new THREE.InstancedMesh(boxGeo, glowMat, gN);
          glowInst.frustumCulled = false;
          glowInst.renderOrder = 1;
          for (let gi = 0; gi < gN; gi++) {
            const v = forgeVoxels[surfaceIndices[gi]!]!;
            voxelDummy.position.set(v.x, v.y, v.z);
            voxelDummy.scale.setScalar(1.12);
            voxelDummy.updateMatrix();
            glowInst.setMatrixAt(gi, voxelDummy.matrix);
          }
          glowInst.count = gN;
          glowInst.instanceMatrix.needsUpdate = true;
          glowInst.userData["planetGlow"] = true;
          group.add(glowInst);
        }
      } else {
      for (let vi = 0; vi < n; vi++) {
        voxelDummy.position.set(0, -999, 0);
        voxelDummy.scale.set(0, 0, 0);
        voxelDummy.updateMatrix();
        voxelInst.setMatrixAt(vi, voxelDummy.matrix);
      }
      voxelInst.count = 0;
      voxelInst.instanceMatrix.needsUpdate = true;
      }

      group.add(voxelInst);
      group.add(edgeLines);
      }
    }

    const geos: THREE.BufferGeometry[] = [];
    for (const part of meshParts) {
      const geo = makeGeometry(part, geoDetail);
      geos.push(geo);
      const mat = createPartMaterial(part, showcase, envMap, usePhysicalMats, pixelMode);
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(part.x, part.y, part.z);
      mesh.rotation.set(part.rx ?? 0, part.ry ?? 0, part.rz ?? 0);
      if (showcase) mesh.castShadow = true;
      mesh.userData["part"] = part;
      mesh.userData["dir"] = scatterDir(part.id);
      mesh.userData["lastLock"] = -1;
      mesh.userData["assembled"] = false;
      mesh.userData["lockedIn"] = false;
      mesh.visible = forgeVoxels.length === 0;
      group.add(mesh);
    }

    const box = computeForgeBounds(meshParts, forgeVoxels, voxelStep);
    const center = box.getCenter(new THREE.Vector3());
    const dim = box.getSize(new THREE.Vector3());
    const maxDim = Math.max(dim.x, dim.y, dim.z, 0.8);
    forgeWorldRadiusRef.current = maxDim * 0.5;
    group.position.sub(center);
    if (labCollectibleShowcase && forgeBoxGeo) {
      addLabPlanetDecorations(
        group,
        maxDim * 0.5,
        primaryColor,
        accentColor,
        showcaseRarity,
        effectiveFloat,
        forgeVoxels,
        voxelStep,
        forgeSphereRadius,
        labThumbCubeFill,
        forgeBoxGeo,
        voxelDummy,
      );
    }
    if (showcase && !planetShowcase) {
      groundExtras = addShowcaseGround(scene, maxDim, accentColor);
    } else if (forgeSpaceMode) {
      groundExtras = addForgeSpaceGrid(scene, maxDim);
    }
    camera.position.set(
      maxDim * (planetShowcase ? 1.28 : labCollectibleShowcase ? 1.35 : showcase ? 1.22 : 1.35),
      maxDim * (planetShowcase ? 0.75 : labCollectibleShowcase ? 0.95 : showcase ? 0.82 : 0.95),
      maxDim * (planetShowcase ? 1.55 : labCollectibleShowcase ? 1.7 : showcase ? 1.48 : 1.7),
    );
    camera.lookAt(0, 0, 0);

    const glbUrl = shapeId && isStaticShowcase && !pixelMode ? getShapeGlbUrl(shapeId) : null;
    if (glbUrl) {
      const loader = new GLTFLoader();
      loader.load(
        glbUrl,
        (gltf) => {
          if (disposed) return;
          glbRoot = gltf.scene;
          glbRoot.visible = false;
          const gBox = new THREE.Box3().setFromObject(glbRoot);
          const gCenter = gBox.getCenter(new THREE.Vector3());
          const gSize = gBox.getSize(new THREE.Vector3());
          const gMax = Math.max(gSize.x, gSize.y, gSize.z, 0.01);
          const scale = (maxDim * 1.05) / gMax;
          glbRoot.scale.setScalar(scale);
          glbRoot.position.set(-gCenter.x * scale, -gCenter.y * scale, -gCenter.z * scale);
          glbRoot.traverse((node) => {
            if ((node as THREE.Mesh).isMesh) {
              const m = node as THREE.Mesh;
              m.castShadow = true;
              m.receiveShadow = true;
              const mats = Array.isArray(m.material) ? m.material : [m.material];
              mats.forEach((raw) => {
                if (raw instanceof THREE.MeshStandardMaterial || raw instanceof THREE.MeshPhysicalMaterial) {
                  raw.envMapIntensity = 1.35;
                  raw.needsUpdate = true;
                }
              });
            }
          });
          group.add(glbRoot);
          group.children.forEach((c) => {
            if (c !== glbRoot) c.visible = false;
          });
          glbRoot.visible = true;
          draw(camera);
        },
        undefined,
        () => { /* keep procedural fallback */ },
      );
    }

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enablePan = false;
    controls.enableZoom = interactive;
    controls.enableRotate = interactive;
    controls.minDistance = maxDim * 1.1;
    controls.maxDistance = maxDim * 4;
    controls.enableDamping = !performanceMode;
    controls.dampingFactor = performanceMode ? 0 : 0.08;
    controls.target.set(0, 0, 0);
    if (!interactive) {
      renderer.domElement.style.pointerEvents = "none";
    }

    let dragging = false;
    let downX = 0;
    let downY = 0;
    const onPointerDown = (e: PointerEvent) => {
      dragging = false;
      downX = e.clientX;
      downY = e.clientY;
    };
    const onPointerUp = (e: PointerEvent) => {
      if (Math.hypot(e.clientX - downX, e.clientY - downY) < 8 && onTapRef.current) {
        e.stopPropagation();
        const rect = renderer.domElement.getBoundingClientRect();
        const cx = rect.left + rect.width / 2;
        const cy = rect.top + rect.height / 2;
        onTapRef.current({ x: e.clientX - cx, y: e.clientY - cy });
      }
    };
    const onPointerMove = (e: PointerEvent) => {
      if (Math.hypot(e.clientX - downX, e.clientY - downY) > 8) dragging = true;
    };
    renderer.domElement.addEventListener("pointerdown", onPointerDown);
    renderer.domElement.addEventListener("pointerup", onPointerUp);
    renderer.domElement.addEventListener("pointermove", onPointerMove);

    let paintT = revealed && !interactive ? 1 : 0;
    let lastFrame = performance.now();
    let lastPlacedVoxels = Math.min(
      forgeVoxels.length,
      Math.round(Math.min(1, Math.max(0, progress)) * forgeVoxels.length),
    );
    let dropAnimStart = performance.now() - 300;
    let sealT = 0;
    let revealPaintT = 0;
    let lastRevealPhase: typeof forgeRevealPhase = "idle";
    let revealVisualBaked = false;
    const VOXEL_PARTICLE_MS = 520;
    const particleLandMs = () => (forgeTapRelaxed ? 900 : VOXEL_PARTICLE_MS) * 0.68;
    const forgePopMs = () => (forgeTapRelaxed ? 150 : 85);
    const useLabTapPlacement = labForgeBackdrop && interactive && !planetShowcase;
    const smoothProgressRef = { current: progress };
    const clayDark = new THREE.Color(FORGE_CLAY);
    const clayLight = new THREE.Color(0xffffff);
    const painted = new THREE.Color();
    const mixed = new THREE.Color();
    const forgePosScratch = new THREE.Vector3();

    const animate = (now: number) => {
      frameId = requestAnimationFrame(animate);
      if (document.hidden) return;

      const dt = Math.min(32, now - lastFrame);
      lastFrame = now;
      const st = stateRef.current;
      const revealPhase = forgeRevealPhaseRef.current;
      if (revealPhase === "idle" && lastRevealPhase !== "idle") {
        revealVisualBaked = false;
        revealPaintT = 0;
      }
      if (revealPhase !== "idle" && lastRevealPhase === "idle") {
        revealVisualBaked = false;
        revealPaintT = 1;
      }
      lastRevealPhase = revealPhase;
      const inForgeReveal = revealPhase !== "idle";
      if (inForgeReveal) {
        revealPaintT = 1;
      }
      const isLiveForge = interactive && !st.revealed && !inForgeReveal;
      const list = partsRef.current;
      const n = Math.max(isLiveForge && voxelsRef.current.length > 0
        ? voxelsRef.current.length
        : list.length, 1);

      const targetP = st.revealed ? 1 : Math.min(1, Math.max(0, st.progress));
      const lerpK = 1 - Math.pow(0.001, dt / 16.67);
      const snap = performanceMode ? 0.95 : 0.55;
      const sealing = forgeSealRef.current && !st.revealed && !inForgeReveal;
      const isForgeSphere = shapeId === FORGE_SPHERE_SHAPE_ID;
      const useVoxelForge = useForgeVoxels && !!voxelInst && forgeVoxels.length > 0
        && (isForgeSphere || !st.revealed || sealing || inForgeReveal);
      if (useVoxelForge && !sealing && !inForgeReveal) {
        const placed = useLabTapPlacement
          ? placedMaskRef.current.filter(Boolean).length
          : Math.min(forgeVoxels.length, Math.round(targetP * forgeVoxels.length));
        if (useLabTapPlacement) {
          const targetPlaced = Math.min(forgeVoxels.length, Math.round(targetP * forgeVoxels.length));
          let count = placedMaskRef.current.filter(Boolean).length;
          while (count < targetPlaced) {
            const idx = placedMaskRef.current.findIndex((p) => !p);
            if (idx < 0) break;
            placedMaskRef.current[idx] = true;
            lastPlacedIdxRef.current = idx;
            dropAnimStartRef.current = now;
            count++;
          }
          if (targetPlaced === 0 && count > 0) {
            placedMaskRef.current.fill(false);
            lastPlacedIdxRef.current = -1;
          }
        }
        smoothProgressRef.current = placed / forgeVoxels.length;
        if (placed > lastPlacedVoxels) {
          lastPlacedVoxels = placed;
          dropAnimStart = now;
          dropAnimStartRef.current = now;
        }
      } else if (sealing || inForgeReveal) {
        smoothProgressRef.current = 1;
        if (sealing) sealT = Math.min(1, sealT + dt / 720);
        lastPlacedVoxels = forgeVoxels.length;
      } else {
        smoothProgressRef.current += (targetP - smoothProgressRef.current) * lerpK * snap;
      }
      assemblyRef.current = smoothProgressRef.current;
      const assembly = smoothProgressRef.current;

      if (st.revealed && !interactive) {
        paintT = 1;
      } else if (inForgeReveal) {
        paintT = revealPaintT;
      } else if (st.revealed) {
        paintT = Math.min(1, paintT + (dt / 16.67) * 0.042);
      } else {
        paintT = 0;
      }

      const scaledParts = assembly * n;
      const partsDone = Math.floor(scaledParts + 0.0001);
      const activePartFrac = scaledParts - partsDone;
      let touchedMesh = false;

      if (premiumPlanetShowcase) {
        group.children.forEach((child) => {
          if (!(child as THREE.Object3D).userData?.["planetGlow"]) return;
          const glow = child as THREE.InstancedMesh;
          const mat = glow.material as THREE.MeshBasicMaterial;
          const isRare = !!(child as THREE.Object3D).userData?.["rareGlow"];
          const isHot = !!(child as THREE.Object3D).userData?.["hotGlow"];
          if (isRare) {
            mat.opacity = isHot
              ? 0.28 + Math.sin(now * 0.0022) * 0.1
              : 0.12 + Math.sin(now * 0.0016) * 0.05;
          } else {
            mat.opacity = 0.11 + Math.sin(now * 0.0018) * 0.055;
          }
        });
        touchedMesh = true;
      } else if (labCollectibleShowcase) {
        const edgeLines = forgeEdgeLinesRef.current;
        if (edgeLines) edgeLines.visible = true;
        group.children.forEach((child) => {
          const ud = (child as THREE.Object3D).userData;
          const mat = (child as THREE.Mesh).material as THREE.MeshBasicMaterial | undefined;
          if (!mat || !("opacity" in mat)) return;
          const base = typeof ud["baseOpacity"] === "number" ? ud["baseOpacity"] as number : null;
          if (ud["planetAtmosphere"] && base !== null) {
            mat.opacity = base + Math.sin(now * 0.0014) * 0.025;
          } else if (ud["planetCorona"] && base !== null) {
            mat.opacity = base + Math.sin(now * 0.002) * 0.06;
          } else if (ud["planetRing"] && base !== null) {
            mat.opacity = base + Math.sin(now * 0.0018) * 0.04;
          } else if (ud["perfectFloatSparkle"]) {
            mat.opacity = 0.45 + Math.sin(now * 0.0032) * 0.28;
          }
        });
        group.scale.setScalar(1);
        touchedMesh = true;
      } else if (useVoxelForge && voxelInst) {
        const voxMesh = voxelInst;
        const edgeLines = forgeEdgeLinesRef.current;
        const edgePosBuf = forgeEdgePositionsRef.current;
        const edgeTpl = getUnitBoxEdgeTemplate();
        const edgeVertCount = edgeTpl.vertCount;
        const cubeSize = voxelStepRef.current * FORGE_VOXEL_CUBE_FILL;
        voxMesh.visible = true;
        if (edgeLines) edgeLines.visible = true;
        group.scale.setScalar(1);

        if (inForgeReveal) {
          if (edgeLines) edgeLines.visible = false;
          if (!revealVisualBaked) {
            voxMesh.visible = false;
            const rarity = st.planetRarity ?? "BASIC";
            const isFloatGraded = FLOAT_PLANET_TYPES.has(rarity.toUpperCase());
            const effectiveFloat = isFloatGraded ? st.displayFloat : 1;
            addForgeLabCollectibleRevealVisual(
              group,
              forgeVoxels,
              voxelStepRef.current,
              forgeSphereRadiusRef.current,
              st.primaryColor,
              st.accentColor,
              rarity,
              effectiveFloat,
              forgeWorldRadiusRef.current,
              voxelDummy,
              edgeScratch,
              forgeEdgeLinesRef,
            );
            revealVisualBaked = true;
          }
          const revealEdgeLines = forgeEdgeLinesRef.current;
          if (revealEdgeLines) revealEdgeLines.visible = true;
          group.children.forEach((child) => {
            const ud = (child as THREE.Object3D).userData;
            const mat = (child as THREE.Mesh).material as THREE.MeshBasicMaterial | undefined;
            if (!mat || !("opacity" in mat)) return;
            const base = typeof ud["baseOpacity"] === "number" ? ud["baseOpacity"] as number : null;
            if (ud["planetAtmosphere"] && base !== null) {
              mat.opacity = base + Math.sin(now * 0.0014) * 0.025;
            } else if (ud["planetCorona"] && base !== null) {
              mat.opacity = base + Math.sin(now * 0.002) * 0.06;
            } else if (ud["planetRing"] && base !== null) {
              mat.opacity = base + Math.sin(now * 0.0018) * 0.04;
            } else if (ud["perfectFloatSparkle"]) {
              mat.opacity = 0.45 + Math.sin(now * 0.0032) * 0.28;
            }
          });
          touchedMesh = true;
        } else {
          voxMesh.visible = true;
          removeForgeLabRevealVisuals(group, forgeEdgeLinesRef);
          if (edgeLines) edgeLines.visible = true;
          revealVisualBaked = false;
          const sealEase = sealT * sealT * (3 - 2 * sealT);
          const sinceDrop = now - (useLabTapPlacement ? dropAnimStartRef.current : dropAnimStart);
          const placedCount = useLabTapPlacement
            ? placedMaskRef.current.filter(Boolean).length
            : sealing || st.revealed
              ? forgeVoxels.length
              : Math.min(forgeVoxels.length, Math.round(targetP * forgeVoxels.length));
          const dropT = !useLabTapPlacement && !sealing && !st.revealed && placedCount > 0
            ? Math.min(1, Math.max(0, (sinceDrop - particleLandMs()) / 200))
            : 1;
          const dropEase = dropT * dropT * (3 - 2 * dropT);
          const useClayGrey = paintT <= 0.001 && !sealing;
          const shapeMorphT = isForgeSphere && !premiumPlanetShowcase
            ? (labCollectibleShowcase || st.revealed || sealing ? 1 : labForgeMorphT(assembly))
            : 0;
          const voxMat = voxMesh.material as THREE.MeshBasicMaterial;
          voxMat.toneMapped = false;
          if (useClayGrey) {
            voxMat.vertexColors = false;
            voxMat.color.set(FORGE_CLAY);
          } else {
            voxMat.vertexColors = true;
            voxMat.color.set(0xffffff);
          }
          voxMat.needsUpdate = true;

          if (sealing) {
            group.scale.setScalar(1 + sealEase * 0.04);
          } else if (shapeMorphT > 0) {
            group.scale.setScalar(0.94 + shapeMorphT * 0.06);
          } else {
            group.scale.setScalar(1);
          }
          const cubeSeal = 1 + sealEase * 0.012;

          let visibleCount = 0;
          let colorsDirty = false;
          for (let i = 0; i < forgeVoxels.length; i++) {
            const v = forgeVoxels[i]!;
            if (useLabTapPlacement) {
              if (!placedMaskRef.current[i]) continue;
            } else {
              const settled = sealing || i < placedCount - 1;
              const landing = !sealing && i === placedCount - 1 && placedCount > 0 && sinceDrop >= particleLandMs();
              if (!settled && !landing) continue;
            }

            const isNewest = useLabTapPlacement
              ? i === lastPlacedIdxRef.current
              : i === placedCount - 1;
            const popT = useLabTapPlacement && isNewest && !sealing
              ? Math.min(1, sinceDrop / forgePopMs())
              : 1;
            const popEase = popT * popT * (3 - 2 * popT);
            const lock = useLabTapPlacement
              ? popEase
              : (sealing || i < placedCount - 1)
                ? 1
                : dropEase;
            const drop = useLabTapPlacement ? 0 : ((sealing || i < placedCount - 1) ? 0 : (1 - lock) * 0.35);
            resolveForgeVoxelPosition(v, shapeMorphT, forgePosScratch);
            voxelDummy.position.set(forgePosScratch.x, forgePosScratch.y + drop, forgePosScratch.z);
            voxelDummy.scale.setScalar(Math.max(0.04, lock * cubeSeal));
            voxelDummy.rotation.set(0, 0, 0);
            voxelDummy.updateMatrix();
            voxMesh.setMatrixAt(visibleCount, voxelDummy.matrix);

            if (!useClayGrey && paintT > 0) {
              showcaseVoxelColor(
                v,
                voxelStepRef.current,
                forgeSphereRadius,
                st.primaryColor,
                st.accentColor,
                painted,
                st.planetRarity,
                st.displayFloat,
              );
              if (paintT < 1) {
                mixed.copy(forgeClayTone(i)).lerp(painted, paintT);
              } else {
                mixed.copy(painted);
              }
              voxMesh.setColorAt(visibleCount, mixed);
              colorsDirty = true;
            }

            if (edgeLines && edgePosBuf) {
              const base = visibleCount * edgeVertCount * 3;
              for (let j = 0; j < edgeVertCount; j++) {
                const t = j * 3;
                edgeScratch.set(
                  edgeTpl.positions[t]! * cubeSize,
                  edgeTpl.positions[t + 1]! * cubeSize,
                  edgeTpl.positions[t + 2]! * cubeSize,
                );
                edgeScratch.applyMatrix4(voxelDummy.matrix);
                edgePosBuf[base + t] = edgeScratch.x;
                edgePosBuf[base + t + 1] = edgeScratch.y;
                edgePosBuf[base + t + 2] = edgeScratch.z;
              }
            }

            visibleCount++;
          }
          voxMesh.count = visibleCount;
          voxMesh.instanceMatrix.needsUpdate = true;
          if (colorsDirty && voxMesh.instanceColor) voxMesh.instanceColor.needsUpdate = true;

          if (edgeLines && edgePosBuf) {
            const edgePosAttr = edgeLines.geometry.attributes.position as THREE.BufferAttribute;
            edgePosAttr.needsUpdate = true;
            edgeLines.geometry.setDrawRange(0, visibleCount * edgeVertCount);
            edgeLines.geometry.computeBoundingSphere();
          }

          touchedMesh = true;
        }

        group.children.forEach((child) => {
          if (child === voxMesh || child === edgeLines) return;
          const mesh = child as THREE.Mesh;
          if (mesh.isMesh && mesh.userData["part"]) mesh.visible = false;
        });
      } else {
        if (voxelInst) voxelInst.visible = false;
        if (forgeEdgeLinesRef.current) forgeEdgeLinesRef.current.visible = false;

      let partIndex = 0;
      group.children.forEach((child) => {
        if (child === voxelInst || child === forgeEdgeLinesRef.current) return;
        const mesh = child as THREE.Mesh;
        const part = mesh.userData["part"] as MeshPart | undefined;
        if (!part) return;
        const i = partIndex++;
        const dir = mesh.userData["dir"] as THREE.Vector3;
        const mat = mesh.material as PartMaterial;

        let lock = 0;
        if (st.revealed) {
          lock = 1;
        } else if (mesh.userData["lockedIn"]) {
          lock = 1;
        } else if (i < partsDone) {
          lock = 1;
        } else if (i === partsDone) {
          lock = activePartFrac;
        }

        if (lock <= 0) {
          if (mesh.visible) mesh.visible = false;
          mesh.userData["assembled"] = false;
          mesh.userData["lastLock"] = -1;
          return;
        }

        mesh.visible = true;
        if (lock >= 0.999 && !st.revealed) {
          mesh.userData["lockedIn"] = true;
          mesh.userData["assembled"] = true;
          lock = 1;
        }

        const lastLock = mesh.userData["lastLock"] as number;
        const isLockedIn = mesh.userData["lockedIn"] as boolean;
        if (isLockedIn && !st.revealed && paintT === 0) {
          mesh.position.set(part.x, part.y, part.z);
          mesh.rotation.set(part.rx ?? 0, part.ry ?? 0, part.rz ?? 0);
          mesh.scale.setScalar(1);
          if (Math.abs(lock - lastLock) < 0.0004) return;
        }

        mesh.userData["lastLock"] = lock;
        touchedMesh = true;

        const eased = lock * lock * (3 - 2 * lock);
        const scatter = (1 - eased) * 1.65;
        mesh.position.set(
          part.x + dir.x * scatter,
          part.y + dir.y * scatter * 0.55,
          part.z + dir.z * scatter,
        );

        mesh.rotation.set(part.rx ?? 0, part.ry ?? 0, part.rz ?? 0);
        const clayBlend = Math.min(1, eased * 1.08);
        mesh.scale.setScalar(0.72 + clayBlend * 0.28);

        painted.set(resolveColor(part.color, st.primaryColor, st.accentColor));
        mixed.copy(clayDark).lerp(clayLight, clayBlend);
        if (paintT > 0) mixed.lerp(painted, paintT);
        mat.color.copy(mixed);
        mat.emissive.copy(painted);
        mat.emissiveIntensity = pixelMode
          ? Math.sin(paintT * Math.PI) * 0.08
          : Math.sin(paintT * Math.PI) * (showcase ? 0.38 : opaqueBackground ? 0.72 : 0.55);
        const fadeIn = Math.min(1, lock / MIN_PART_LOCK);
        const needsFade = (clayBlend < 0.98 && !st.revealed) || fadeIn < 1;
        if (mat.transparent !== needsFade) mat.transparent = needsFade;
        mat.opacity = st.revealed ? 1 : (0.55 + clayBlend * 0.45) * fadeIn;
        if (paintT > 0.5) {
          if (mat instanceof THREE.MeshPhysicalMaterial && showcase) {
            applyProfileToMaterial(mat, part, mixed, showcase, envMap);
            mat.emissive.copy(painted);
            mat.emissiveIntensity = Math.sin(paintT * Math.PI) * 0.1;
          } else {
            const baseMetal = part.metal ?? (showcase ? 0.35 : opaqueBackground ? 0.42 : 0.35);
            const baseRough = part.rough ?? (showcase ? 0.38 : opaqueBackground ? 0.38 : 0.45);
            mat.metalness = baseMetal;
            mat.roughness = baseRough;
            if ("clearcoat" in mat && showcase) {
              mat.clearcoat = isGlassPart(part) ? 0.55 : 0.28;
              mat.clearcoatRoughness = 0.16;
            }
            if (mat.envMap) mat.envMapIntensity = showcase ? 1.12 : 1;
          }
        } else {
          mat.metalness = 0.06 + clayBlend * 0.12;
          mat.roughness = 0.88 - clayBlend * 0.2;
        }
      });

      } // end voxel vs part forge branch

      if (autoSpin && !dragging) {
        group.rotation.y += (dt / 16.67) * (planetShowcase ? 0.0024 : showcase ? 0.0028 : 0.0035);
      }
      if (dragging) controls.update();
      const stillMoving = Math.abs(targetP - assembly) > 0.0008
        || (paintT > 0 && paintT < 1 && !inForgeReveal);
      if (isLiveForge || autoSpin || stillMoving || touchedMesh || dragging || st.revealed || inForgeReveal) {
        draw(camera);
      }
    };
    animate(performance.now());
    draw(camera);

    return () => {
      disposed = true;
      pixelPass?.dispose();
      groundExtras.forEach((obj) => {
        scene.remove(obj);
        const m = obj as THREE.Mesh;
        m.geometry?.dispose();
        (m.material as THREE.Material)?.dispose();
      });
      envMap?.dispose();
      renderer.domElement.removeEventListener("webglcontextlost", onContextLost);
      renderer.domElement.removeEventListener("webglcontextrestored", onContextRestored);
      cancelAnimationFrame(frameId);
      renderer.domElement.removeEventListener("pointerdown", onPointerDown);
      renderer.domElement.removeEventListener("pointerup", onPointerUp);
      renderer.domElement.removeEventListener("pointermove", onPointerMove);
      controls.dispose();
      geos.forEach((g) => g.dispose());
      if (voxelInst) {
        voxelInst.geometry.dispose();
        (voxelInst.material as THREE.Material).dispose();
      } else if (forgeBoxGeo) {
        forgeBoxGeo.dispose();
      }
      const edgeLinesCleanup = forgeEdgeLinesRef.current;
      if (edgeLinesCleanup) {
        edgeLinesCleanup.geometry.dispose();
        (edgeLinesCleanup.material as THREE.Material).dispose();
      }
      forgeEdgeLinesRef.current = null;
      forgeEdgePositionsRef.current = null;
      group.children.forEach((c) => {
        const m = c as THREE.Mesh;
        (m.material as THREE.Material).dispose();
      });
      renderer.dispose();
      if (renderer.domElement.parentNode === mount) mount.removeChild(renderer.domElement);
      groupRef.current = null;
      cameraRef.current = null;
      rendererRef.current = null;
    };
  }, labForgeBackdrop
    ? [size, meshParts, shapeId, autoSpin, interactive, forgeVoxelBuild, forgeTapRelaxed, opaqueBackground, performanceMode, labForgeBackdrop]
    : [size, meshParts, shapeId, autoSpin, interactive, forgeVoxelBuild, forgeTapRelaxed, opaqueBackground, performanceMode, planetRarity, displayFloat, planetId, primaryColor, accentColor]);

  return (
    <div
      ref={mountRef}
      style={{ width: size, height: size, touchAction: "manipulation", background: "transparent", overflow: "visible" }}
      data-testid="object-mesh-3d"
    />
  );
});

export function ObjectThumb({
  shapeId,
  primaryColor,
  accentColor,
  size,
  autoSpin = true,
  performanceMode = false,
  hiQuality,
  onGlFailed,
  onGlContextLost,
  planetRarity,
  displayFloat,
  planetId,
}: {
  shapeId: string;
  primaryColor: string;
  accentColor: string;
  size: number;
  autoSpin?: boolean;
  performanceMode?: boolean;
  hiQuality?: boolean;
  onGlFailed?: () => void;
  onGlContextLost?: () => void;
  planetRarity?: string;
  displayFloat?: number;
  planetId?: string;
}) {
  const parts = useMemo(
    () => getMeshParts(shapeId, primaryColor, accentColor),
    [shapeId, primaryColor, accentColor],
  );
  const isPlanetThumb = shapeId === FORGE_SPHERE_SHAPE_ID;
  const isFloatGraded = isPlanetThumb && !!planetRarity && FLOAT_PLANET_TYPES.has(planetRarity.toUpperCase());
  const f = isFloatGraded && typeof displayFloat === "number" && Number.isFinite(displayFloat)
    ? Math.max(0, Math.min(1, displayFloat))
    : null;
  const haloMult = f !== null ? 0.35 + 1.05 * f : 1;
  const haloScale = isPlanetThumb ? 1.15 + (f !== null ? 0.07 * f : 0) : (f !== null ? 1.05 + 0.05 * f : 1);
  const isSunThumb = isPlanetThumb && planetRarity === "SUN";
  const showThumbGlow = !isSunThumb && (!isPlanetThumb || size >= 140);
  const hiFi = isPlanetThumb || (!performanceMode && size >= 96);
  const innerAlpha = Math.round(Math.min(255, 0x44 * haloMult)).toString(16).padStart(2, "0");
  const midAlpha = Math.round(Math.min(255, 0x28 * haloMult)).toString(16).padStart(2, "0");
  return (
    <div
      className="object-thumb"
      style={{ position: "relative", width: size, height: size, flexShrink: 0 }}
    >
      {showThumbGlow && (
      <div
        aria-hidden
        className="object-thumb-glow"
        style={{
          position: "absolute",
          left: "50%",
          top: "50%",
          width: size * (isPlanetThumb ? haloScale : hiFi ? 1.05 : 0.95),
          height: size * (isPlanetThumb ? haloScale : hiFi ? 1.05 : 0.95),
          transform: "translate(-50%, -50%)",
          borderRadius: "50%",
          background: isPlanetThumb
            ? planetRarity === "RARE"
              ? `radial-gradient(circle at 50% 44%, ${primaryColor}${innerAlpha} 0%, ${primaryColor}${midAlpha} 38%, transparent 72%)`
              : planetRarity === "BASIC"
              ? `radial-gradient(circle at 50% 42%, ${primaryColor}${innerAlpha} 0%, ${accentColor}${midAlpha} 40%, transparent 72%)`
              : f !== null && f >= 1
              ? `radial-gradient(circle at 50% 42%, #ffd70055 0%, ${primaryColor}${midAlpha} 38%, transparent 72%)`
              : `radial-gradient(circle at 50% 40%, ${accentColor}${innerAlpha} 0%, ${primaryColor}${midAlpha} 32%, transparent 70%)`
            : hiFi
            ? `radial-gradient(circle at 50% 40%, ${accentColor}66 0%, ${primaryColor}33 38%, transparent 70%)`
            : `radial-gradient(circle at 50% 42%, ${accentColor}50 0%, ${primaryColor}28 40%, transparent 72%)`,
          filter: isPlanetThumb ? "blur(1.5px)" : hiFi ? "blur(0.5px)" : undefined,
          pointerEvents: "none",
        }}
      />
      )}
      <div style={{ position: "relative", zIndex: 1, width: size, height: size }}>
        <ObjectMesh3D
          parts={parts}
          shapeId={shapeId}
          primaryColor={primaryColor}
          accentColor={accentColor}
          progress={1}
          revealed
          size={size}
          autoSpin={autoSpin}
          interactive={false}
          forgeVoxelBuild={shapeId === FORGE_SPHERE_SHAPE_ID}
          performanceMode={performanceMode}
          thumbHiQuality={hiQuality}
          onGlFailed={onGlFailed}
          onGlContextLost={onGlContextLost}
          planetRarity={planetRarity}
          displayFloat={displayFloat}
          planetId={planetId}
        />
      </div>
    </div>
  );
}

export const MysteryModel3D = ObjectMesh3D;
