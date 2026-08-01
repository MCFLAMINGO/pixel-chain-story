#!/usr/bin/env bun
/**
 * Letterboxed / padded projector rasters must decode to the exact pay face.
 * PXP1-P uses a white quiet zone so black OFF cells don't collapse the crop.
 */
import { encodePayFaceMatrix, payFaceRasterWithQuietZone } from "../src/lib/pixel/pay-face-optical";
import { type PixelRaster } from "../src/lib/pixel/optical-capture";
import {
  findBrightRect,
  pollPayMatrixRaster,
  squareifyRect,
} from "../src/lib/pixel/pay-matrix-scan";

const addr = "pix1ff98c57ba1fe081154a1697ad15e6bddc4d3de";

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}

function letterbox(square: PixelRaster, padTop: number, padBottom: number, padX = 0): PixelRaster {
  const width = square.width + padX * 2;
  const height = square.height + padTop + padBottom;
  const data = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < data.length; i += 4) {
    data[i] = 0;
    data[i + 1] = 0;
    data[i + 2] = 0;
    data[i + 3] = 255;
  }
  for (let y = 0; y < square.height; y++) {
    for (let x = 0; x < square.width; x++) {
      const si = (y * square.width + x) * 4;
      const di = ((y + padTop) * width + (x + padX)) * 4;
      data[di] = square.data[si]!;
      data[di + 1] = square.data[si + 1]!;
      data[di + 2] = square.data[si + 2]!;
      data[di + 3] = 255;
    }
  }
  return { data, width, height };
}

function warmTint(raster: PixelRaster): PixelRaster {
  const data = new Uint8ClampedArray(raster.data);
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i]!;
    data[i + 1] = Math.min(255, Math.floor(r * 0.98));
    data[i + 2] = Math.min(255, Math.floor(r * 0.9));
  }
  return { data, width: raster.width, height: raster.height };
}

const pattern = await encodePayFaceMatrix(addr);
const square = payFaceRasterWithQuietZone(pattern, 16, 1);

// Exact square (+ quiet zone)
{
  const hit = await pollPayMatrixRaster(square);
  assert(hit.locked && hit.address === addr, `square decode: ${JSON.stringify(hit)}`);
}

// Letterboxed like a tall phone camera frame
{
  const framed = letterbox(square, 40, 80, 24);
  const bright = findBrightRect(framed.data, framed.width, framed.height);
  assert(bright, "letterbox finds bright");
  const sq = squareifyRect(bright!, framed.width, framed.height);
  assert(sq.w > 48, `squareify got ${sq.w}`);
  const hit = await pollPayMatrixRaster(framed);
  assert(hit.locked && hit.address === addr, `letterbox decode: ${JSON.stringify(hit)}`);
}

// Warm tint + letterbox
{
  const tinted = warmTint(letterbox(square, 32, 32, 16));
  const hit = await pollPayMatrixRaster(tinted);
  assert(hit.locked && hit.address === addr, `warm letterbox: ${JSON.stringify(hit)}`);
}

// Exposure stand-in: dim + lifted blacks (midpoint must still lock)
{
  const data = new Uint8ClampedArray(square.data);
  for (let i = 0; i < data.length; i += 4) {
    const v = data[i]!;
    const g = Math.min(255, Math.round(v * 0.5 + 35));
    data[i] = g;
    data[i + 1] = g;
    data[i + 2] = g;
  }
  const hit = await pollPayMatrixRaster({ data, width: square.width, height: square.height });
  assert(hit.locked && hit.address === addr, `exposure cancel: ${JSON.stringify(hit)}`);
}

// Small face in a large black frame
{
  const small = payFaceRasterWithQuietZone(pattern, 8, 1);
  const framed = letterbox(small, 120, 160, 100);
  const hit = await pollPayMatrixRaster(framed);
  assert(hit.locked && hit.address === addr, `distant face: ${JSON.stringify(hit)}`);
}

console.log("OK pay-matrix-scan");
