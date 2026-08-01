/**
 * Scan a friend's pay-face Kindling matrix with the phone camera.
 * Finds the bright square on black, samples 16×16 from that crop (codec-true).
 */

import { OPTICAL_GRID } from "./optical";
import {
  sampleGridFromRaster,
  type OpticalCaptureResult,
  type PixelRaster,
} from "./optical-capture";
import { decodePayFaceCapture } from "./pay-face-optical";

export type PayMatrixScanSession = {
  video: HTMLVideoElement;
  stop: () => void;
};

export type MatrixPollResult =
  | { locked: true; address: string; physical: boolean; score: number }
  | { locked: false; score: number };

export type BrightRect = { x: number; y: number; w: number; h: number };

export function canScanPayMatrix(): boolean {
  return (
    typeof navigator !== "undefined" &&
    !!navigator.mediaDevices?.getUserMedia &&
    typeof navigator.mediaDevices.getUserMedia === "function"
  );
}

export async function startPayMatrixScan(video: HTMLVideoElement): Promise<PayMatrixScanSession> {
  if (!canScanPayMatrix()) {
    throw new Error("Camera not available — use QR or Paste");
  }
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: false,
    video: {
      facingMode: { ideal: "environment" },
      width: { ideal: 1280 },
      height: { ideal: 720 },
    },
  });
  video.playsInline = true;
  video.muted = true;
  video.srcObject = stream;
  await video.play();
  return {
    video,
    stop: () => {
      stream.getTracks().forEach((t) => t.stop());
      video.srcObject = null;
    },
  };
}

/**
 * Bounding box of non-black projector pixels.
 * Uses a low threshold so dark payload cells stay inside the square.
 */
export function findBrightRect(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  threshold = 14,
): BrightRect | null {
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;
  const step = Math.max(1, Math.floor(Math.min(width, height) / 200));
  for (let y = 0; y < height; y += step) {
    for (let x = 0; x < width; x += step) {
      const i = (y * width + x) * 4;
      const lum = Math.max(data[i]!, data[i + 1]!, data[i + 2]!);
      if (lum >= threshold) {
        if (x < minX) minX = x;
        if (y < minY) minY = y;
        if (x > maxX) maxX = x;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX < 0) return null;
  // Nudge by one subsample step only — do not swallow black letterbox.
  minX = Math.max(0, minX - step);
  minY = Math.max(0, minY - step);
  maxX = Math.min(width - 1, maxX + step);
  maxY = Math.min(height - 1, maxY + step);
  const w = maxX - minX + 1;
  const h = maxY - minY + 1;
  if (w < 48 || h < 48) return null;
  return { x: minX, y: minY, w, h };
}

/** Force a square crop centered on the bright rect (matrix is square). */
export function squareifyRect(rect: BrightRect, frameW: number, frameH: number): BrightRect {
  const side = Math.max(rect.w, rect.h);
  let x = Math.floor(rect.x - (side - rect.w) / 2);
  let y = Math.floor(rect.y - (side - rect.h) / 2);
  let s = side;
  if (x < 0) {
    s += x;
    x = 0;
  }
  if (y < 0) {
    s += y;
    y = 0;
  }
  if (x + s > frameW) s = frameW - x;
  if (y + s > frameH) s = frameH - y;
  s = Math.max(48, s);
  return { x, y, w: s, h: s };
}

/** @deprecated alias — prefer findBrightRect + squareifyRect */
export function findBrightSquare(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  threshold = 14,
): { sx: number; sy: number; side: number } | null {
  const r = findBrightRect(data, width, height, threshold);
  if (!r) return null;
  const sq = squareifyRect(r, width, height);
  return { sx: sq.x, sy: sq.y, side: sq.w };
}

/** Sample 16×16 cells from a rectangle in the raster (no canvas / DOM). */
export function sampleGridFromRect(raster: PixelRaster, rect: BrightRect, inset = 0): number[] {
  const grid = OPTICAL_GRID;
  const x0 = rect.x + rect.w * inset;
  const y0 = rect.y + rect.h * inset;
  const usableW = Math.max(grid, rect.w * (1 - 2 * inset));
  const usableH = Math.max(grid, rect.h * (1 - 2 * inset));
  const cellW = usableW / grid;
  const cellH = usableH / grid;
  const { data, width, height } = raster;
  const cells: number[] = [];

  for (let row = 0; row < grid; row++) {
    for (let col = 0; col < grid; col++) {
      const xStart = Math.max(0, Math.floor(x0 + col * cellW));
      const yStart = Math.max(0, Math.floor(y0 + row * cellH));
      const xEnd = Math.min(width, Math.floor(x0 + (col + 1) * cellW));
      const yEnd = Math.min(height, Math.floor(y0 + (row + 1) * cellH));
      let sum = 0;
      let n = 0;
      // Prefer center of cell — less bleed from neighbors / AA edges.
      const cx0 = Math.floor(xStart + (xEnd - xStart) * 0.25);
      const cx1 = Math.ceil(xStart + (xEnd - xStart) * 0.75);
      const cy0 = Math.floor(yStart + (yEnd - yStart) * 0.25);
      const cy1 = Math.ceil(yStart + (yEnd - yStart) * 0.75);
      for (let y = cy0; y < cy1; y++) {
        for (let x = cx0; x < cx1; x++) {
          const i = (y * width + x) * 4;
          sum += data[i]!; // red channel = payload byte
          n++;
        }
      }
      if (n === 0) {
        for (let y = yStart; y < yEnd; y++) {
          for (let x = xStart; x < xEnd; x++) {
            sum += data[(y * width + x) * 4]!;
            n++;
          }
        }
      }
      cells.push(n ? Math.round(sum / n) : 0);
    }
  }
  return cells;
}

function captureFromRect(
  raster: PixelRaster,
  rect: BrightRect,
  inset: number,
  source: OpticalCaptureResult["source"] = "imageData",
): OpticalCaptureResult {
  const cells = sampleGridFromRect(raster, rect, inset);
  return {
    cells,
    source,
    capturedAt: Date.now(),
    width: Math.round(rect.w),
    height: Math.round(rect.h),
  };
}

function magicScore(cells: number[]): number {
  const d0 = Math.abs((cells[0] ?? 0) - 0x50);
  const d1 = Math.abs((cells[1] ?? 0) - 0x58);
  const d2 = Math.abs((cells[2] ?? 0) - 0x50);
  const d3 = Math.abs((cells[3] ?? 0) - 0x31);
  if (d0 > 48 || d1 > 48 || d2 > 48) return 0;
  const tightness = 1 - (d0 + d1 + d2 + d3) / (48 * 4);
  return 0.45 + 0.4 * Math.max(0, tightness);
}

const INSETS = [0.02, 0.04, 0.06, 0.08, 0, 0.1];

/**
 * Decode pay face from a full camera/projector raster.
 * Headless-safe (Bun tests) — no document/canvas required.
 */
export async function pollPayMatrixRaster(raster: PixelRaster): Promise<MatrixPollResult> {
  const { data, width: vw, height: vh } = raster;
  if (vw < 32 || vh < 32) return { locked: false, score: 0 };

  const bright = findBrightRect(data, vw, vh);
  const rects: BrightRect[] = [];
  if (bright) {
    const sq = squareifyRect(bright, vw, vh);
    rects.push(sq);
    const m = Math.floor(sq.w * 0.03);
    if (sq.w - 2 * m > 48) {
      rects.push({ x: sq.x + m, y: sq.y + m, w: sq.w - 2 * m, h: sq.h - 2 * m });
    }
    const m2 = Math.floor(sq.w * 0.06);
    if (sq.w - 2 * m2 > 48) {
      rects.push({ x: sq.x + m2, y: sq.y + m2, w: sq.w - 2 * m2, h: sq.h - 2 * m2 });
    }
  }
  // Centered square fallback (matrix fills the viewfinder).
  const side = Math.min(vw, vh);
  rects.push({
    x: Math.floor((vw - side) / 2),
    y: Math.floor((vh - side) / 2),
    w: side,
    h: side,
  });

  let bestScore = 0;
  if (bright) {
    const fill = (bright.w * bright.h) / (vw * vh);
    const aspect = Math.min(bright.w, bright.h) / Math.max(bright.w, bright.h);
    bestScore = Math.min(0.42, 0.15 + fill * 0.5 + aspect * 0.2);
  }

  for (const rect of rects) {
    for (const inset of INSETS) {
      const capture = captureFromRect(raster, rect, inset, "imageData");
      const hit = await decodePayFaceCapture(capture);
      if (hit) {
        return { locked: true, address: hit.address, physical: hit.physical, score: 1 };
      }
      bestScore = Math.max(bestScore, magicScore(capture.cells));
    }
  }

  // Full-frame sample as last resort (legacy path).
  const fullCells = sampleGridFromRaster(raster, { grid: OPTICAL_GRID, inset: 0 });
  const fullHit = await decodePayFaceCapture({
    cells: fullCells,
    source: "imageData",
    capturedAt: Date.now(),
    width: vw,
    height: vh,
  });
  if (fullHit) {
    return { locked: true, address: fullHit.address, physical: fullHit.physical, score: 1 };
  }
  bestScore = Math.max(bestScore, magicScore(fullCells));

  return { locked: false, score: bestScore };
}

export async function pollPayMatrixFrame(video: HTMLVideoElement): Promise<MatrixPollResult> {
  if (video.readyState < 2 || video.videoWidth < 32) return { locked: false, score: 0 };
  const vw = video.videoWidth;
  const vh = video.videoHeight;
  const source = document.createElement("canvas");
  source.width = vw;
  source.height = vh;
  const sctx = source.getContext("2d", { willReadFrequently: true });
  if (!sctx) return { locked: false, score: 0 };
  sctx.drawImage(video, 0, 0, vw, vh);
  const { data } = sctx.getImageData(0, 0, vw, vh);
  const result = await pollPayMatrixRaster({ data, width: vw, height: vh });
  if (result.locked) {
    return { ...result, physical: true };
  }
  return result;
}
