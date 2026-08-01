#!/usr/bin/env bun
import {
  encodePayFaceMatrix,
  decodePayFaceMatrix,
  packPayFacePayload,
  payloadToBinaryCells,
  binaryCellsToPayload,
  PAY_FACE_ON,
  PAY_FACE_OFF,
} from "../src/lib/pixel/pay-face-optical";
import { captureFromRaster, patternToRaster } from "../src/lib/pixel/optical-capture";
import { decodePayFaceCapture } from "../src/lib/pixel/pay-face-optical";

const addr = "pix1ff98c57ba1fe081154a1697ad15e6bddc4d3de";

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}

const packed = packPayFacePayload(addr);
assert(packed.length === 32, "payload 32");
assert(packed[0] === 0x50 && packed[1] === 0x58, "magic");

const bits = payloadToBinaryCells(packed);
assert(bits.length === 256, "256 cells");
assert(
  bits.every((c) => c === PAY_FACE_ON || c === PAY_FACE_OFF),
  "binary only",
);
assert(JSON.stringify(binaryCellsToPayload(bits)) === JSON.stringify(packed), "bit round-trip");

const pattern = await encodePayFaceMatrix(addr);
assert(
  pattern.cells.every((c) => c === 0 || c === 255),
  "encode binary",
);
const round = await decodePayFaceMatrix(pattern.cells);
assert(round === addr, `round-trip got ${round}`);

// Midpoint decode survives gain + bias (exposure / wall cast stand-in).
const gained = pattern.cells.map((c) => Math.min(255, Math.round(c * 0.55 + 40)));
assert((await decodePayFaceMatrix(gained)) === addr, "gain+bias");

const raster = patternToRaster(pattern, 14);
const cap = captureFromRaster(raster);
const decoded = await decodePayFaceCapture(cap);
assert(decoded?.address === addr, "raster capture");
assert(decoded?.physical === true, "imageData is physical");

let threw = false;
try {
  packPayFacePayload("not-a-pix");
} catch {
  threw = true;
}
assert(threw, "reject junk");

console.log("OK pay-face-optical");
