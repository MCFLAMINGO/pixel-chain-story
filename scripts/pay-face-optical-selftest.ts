#!/usr/bin/env bun
import {
  encodePayFaceMatrix,
  decodePayFaceMatrix,
  packPayFacePayload,
} from "../src/lib/pixel/pay-face-optical";
import { simulateCameraCapture } from "../src/lib/pixel/optical";
import { captureFromRaster, patternToRaster } from "../src/lib/pixel/optical-capture";
import { decodePayFaceCapture } from "../src/lib/pixel/pay-face-optical";

const addr = "pix1ff98c57ba1fe081154a1697ad15e6bddc4d3de";

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}

const packed = packPayFacePayload(addr);
assert(packed.length === 32, "payload 32");
assert(packed[0] === 0x50 && packed[1] === 0x58, "magic");

const pattern = await encodePayFaceMatrix(addr);
const round = await decodePayFaceMatrix(pattern.cells);
assert(round === addr, `round-trip got ${round}`);

const cleanSim = simulateCameraCapture(pattern, 0);
assert((await decodePayFaceMatrix(cleanSim)) === addr, "sim capture");

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
