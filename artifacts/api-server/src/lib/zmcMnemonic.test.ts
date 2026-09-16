import assert from "node:assert/strict";
import { parseTreasuryMnemonic } from "./zmc";

const w12 = Array.from({ length: 12 }, (_, i) => `word${i + 1}`).join(" ");
const w24 = Array.from({ length: 24 }, (_, i) => `word${i + 1}`).join(" ");

assert.equal(parseTreasuryMnemonic(""), null);
assert.equal(parseTreasuryMnemonic("only five words here now"), null);
assert.deepEqual(parseTreasuryMnemonic(w12), w12.split(" "));
assert.deepEqual(parseTreasuryMnemonic(w24), w24.split(" "));
assert.deepEqual(parseTreasuryMnemonic(`"${w24}"`), w24.split(" "));
assert.deepEqual(parseTreasuryMnemonic(w24.replace(/ /g, ", ")), w24.split(" "));
assert.deepEqual(parseTreasuryMnemonic(`  ${w12.replace(/ /g, "\n")}  `), w12.split(" "));

console.log("zmc mnemonic parse tests ok");
