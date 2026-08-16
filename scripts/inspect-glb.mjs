import fs from "fs";

const glbPath = process.argv[2];
if (!glbPath) {
  console.error("usage: node inspect-glb.mjs <path>");
  process.exit(1);
}

const buf = fs.readFileSync(glbPath);
let offset = 12;
const jsonLen = buf.readUInt32LE(offset);
offset += 8;
const json = JSON.parse(buf.slice(offset, offset + jsonLen).toString("utf8"));

console.log("nodes", json.nodes?.length);
console.log("meshes", json.meshes?.length);
for (let i = 0; i < (json.meshes?.length ?? 0); i++) {
  const m = json.meshes[i];
  const prim = m.primitives[0];
  const pos = json.accessors[prim.attributes.POSITION];
  console.log(`mesh ${i}: verts=${pos.count} mat=${prim.material}`);
}
console.log("materials", json.materials?.length);
for (let i = 0; i < Math.min(5, json.materials?.length ?? 0); i++) {
  const c = json.materials[i]?.pbrMetallicRoughness?.baseColorFactor;
  console.log(` mat ${i}:`, c);
}
