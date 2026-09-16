import assert from "node:assert/strict";
import {
  applyLabFuseToPlanets,
  keepUnburnedPlanets,
  pinLabFuseOnSave,
} from "./labEvoFuse";
import {
  mergeLabFuseIntoPlanets,
  pinClientLabEvo,
} from "../../../zoom-master/src/utils/labEvoFuse";

function pou(id: string, extra: Record<string, unknown> = {}) {
  return {
    id,
    name: "BASIC",
    shapeId: "pou",
    displayName: "Pou",
    rate: 1,
    float: 0.5,
    ...extra,
  };
}

const original = [
  pou("a", { float: 0.9 }),
  pou("b", { float: 0.4 }),
  pou("c", { float: 0.2 }),
  pou("keep-me", { shapeId: "pizza", displayName: "Pizza" }),
];

const fused = applyLabFuseToPlanets(original, ["a", "b", "c"]);
assert.equal(fused.ok, true);
if (!fused.ok) throw new Error("fuse failed");
assert.equal(fused.keeperId, "a");
assert.deepEqual(fused.burnedIds.sort(), ["b", "c"]);
assert.equal(fused.planets.find((p) => p.id === "a")?.evoTier, 1);
assert.equal(fused.planets.some((p) => p.id === "b"), false);
assert.equal(fused.planets.some((p) => p.id === "keep-me"), true);

const kept = keepUnburnedPlanets(original, fused);
assert.equal(kept.planets.some((p) => p.id === "keep-me"), true);
assert.equal(kept.planets.find((p) => p.id === "a")?.evoTier, 1);

// Stale phone snapshot after FUSE: pre-fuse rows + newer save clock.
const staleSave = pinLabFuseOnSave(kept.planets, original);
assert.equal(staleSave.find((p) => p.id === "a")?.evoTier, 1);
assert.deepEqual((staleSave.find((p) => p.id === "a")?.evoFusedIds as string[]).sort(), ["b", "c"]);
assert.equal(staleSave.some((p) => p.id === "b"), false);
assert.equal(staleSave.some((p) => p.id === "c"), false);
assert.equal(staleSave.some((p) => p.id === "keep-me"), true);

// Incoming omits the Evo keeper entirely (other device inventory).
const pcOnly = [pou("pc-ghost-1"), pou("pc-ghost-2")];
const pinnedPc = pinLabFuseOnSave(kept.planets, pcOnly);
assert.equal(pinnedPc.find((p) => p.id === "a")?.evoTier, 1);
assert.equal(pinnedPc.some((p) => p.id === "pc-ghost-1"), true);
assert.equal(pinnedPc.some((p) => p.id === "b"), false);

// Incoming already has Evo II — never downgrade.
const evo2Incoming = [{ ...pou("a"), evoTier: 2, evoFusedIds: ["x"] }];
const storedEvo1 = [{ ...pou("a"), evoTier: 1, evoFusedIds: ["b", "c"] }];
const upgraded = pinLabFuseOnSave(storedEvo1, evo2Incoming);
assert.equal(upgraded.find((p) => p.id === "a")?.evoTier, 2);
assert.deepEqual(
  (upgraded.find((p) => p.id === "a")?.evoFusedIds as string[]).sort(),
  ["b", "c", "x"],
);

// Client merge must overlay Evo and drop burned, without flashing PC extras
// that only exist on the fused server snapshot.
const prevPhone = [
  pou("a", { float: 0.9 }),
  pou("b"),
  pou("c"),
  pou("keep-me", { shapeId: "pizza", displayName: "Pizza" }),
];
const serverWithGhosts = [
  { ...pou("a", { float: 0.9 }), evoTier: 1, evoFusedIds: ["b", "c"] },
  pou("keep-me", { shapeId: "pizza", displayName: "Pizza" }),
  pou("pc-ghost-1"),
  pou("pc-ghost-2"),
];
const merged = mergeLabFuseIntoPlanets(prevPhone, serverWithGhosts, ["b", "c"]);
assert.equal(merged.find((p) => p.id === "a")?.evoTier, 1);
assert.equal(merged.some((p) => p.id === "keep-me"), true);
assert.equal(merged.some((p) => p.id === "b"), false);
assert.equal(merged.some((p) => p.id === "pc-ghost-1"), false);
assert.equal(merged.some((p) => p.id === "pc-ghost-2"), false);

// Second FUSE in the same farm: overlay THIS trio's keeper, not the first Evo.
const prevAfterFirst = [
  { ...pou("a", { float: 0.9 }), evoTier: 1, evoFusedIds: ["b", "c"] },
  pou("d", { float: 0.8, shapeId: "pizza", displayName: "Pizza" }),
  pou("e", { shapeId: "pizza", displayName: "Pizza" }),
  pou("f", { shapeId: "pizza", displayName: "Pizza" }),
];
const staleSecondSnapshot = [
  { ...pou("a", { float: 0.9 }), evoTier: 1, evoFusedIds: ["b", "c"] },
  pou("d", { float: 0.8, shapeId: "pizza", displayName: "Pizza" }),
  pou("e", { shapeId: "pizza", displayName: "Pizza" }),
  pou("f", { shapeId: "pizza", displayName: "Pizza" }),
];
const secondMerged = mergeLabFuseIntoPlanets(
  prevAfterFirst,
  staleSecondSnapshot,
  ["e", "f"],
  { keeperId: "d", toTier: 1 },
);
assert.equal(secondMerged.find((p) => p.id === "a")?.evoTier, 1);
assert.equal(secondMerged.find((p) => p.id === "d")?.evoTier, 1);
assert.deepEqual((secondMerged.find((p) => p.id === "d")?.evoFusedIds as string[]).sort(), ["e", "f"]);
assert.equal(secondMerged.some((p) => p.id === "e"), false);
assert.equal(secondMerged.some((p) => p.id === "f"), false);

const wrongKeeperFallback = mergeLabFuseIntoPlanets(
  prevAfterFirst,
  staleSecondSnapshot,
  ["e", "f"],
);
assert.equal(wrongKeeperFallback.find((p) => p.id === "d")?.evoTier || 0, 0, "without keeperId must not steal first Evo");
assert.equal(wrongKeeperFallback.find((p) => p.id === "a")?.evoTier, 1);

const staleServer = pou("a", { float: 0.9 });
const localEvo = { ...pou("a", { float: 0.9 }), evoTier: 1 as const, evoFusedIds: ["b", "c"] };
const pinnedClient = pinClientLabEvo(staleServer, localEvo);
assert.equal(pinnedClient.evoTier, 1);
assert.deepEqual(pinnedClient.evoFusedIds, ["b", "c"]);

console.log("labEvoFuse persist tests ok");
