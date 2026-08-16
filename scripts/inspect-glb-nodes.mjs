import fs from "fs";

const buf = fs.readFileSync(process.argv[2]);
let offset = 12;
const jsonLen = buf.readUInt32LE(offset);
offset += 8;
const json = JSON.parse(buf.slice(offset, offset + jsonLen).toString("utf8"));

let withMesh = 0;
for (let i = 0; i < json.nodes.length; i++) {
  const n = json.nodes[i];
  if (n.mesh !== undefined) {
    withMesh++;
    console.log("node", i, "mesh", n.mesh, "children", n.children?.length ?? 0);
  }
}
