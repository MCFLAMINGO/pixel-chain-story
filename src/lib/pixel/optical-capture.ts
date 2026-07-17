/**
 * Real optical capture — getUserMedia + canvas grid sample.
 *
 * This is the anti-theater path: luminance is read from a camera frame
 * (or from raster ImageData in tests), not copied from the in-memory pattern.
 */

import { OPTICAL_GRID, type OpticalPattern, verifyCapturedPattern } from "./optical";
import type { Hex } from "./crypto";

export type CaptureSource = "getUserMedia" | "imageData" | "simulated";

/** Minimal ImageData-compatible buffer (works in Bun + browsers). */
export interface PixelRaster {
  data: Uint8ClampedArray;
  width: number;
  height: number;
}

export interface OpticalCaptureResult {
  cells: number[];
  source: CaptureSource;
  /** Wall time of the sample */
  capturedAt: number;
  width: number;
  height: number;
}

export interface CameraSession {
  video: HTMLVideoElement;
  stream: MediaStream;
  stop: () => void;
}

function cellByte(r: number, g: number, b: number): number {
  // Encoder stores the byte in the red channel (CSS: rgb(v, 0.97v, 0.88v)).
  // Prefer R so warm phosphor tint does not shift recovered keys.
  return Math.max(0, Math.min(255, Math.round(r)));
}

/**
 * Sample a raster into OPTICAL_GRID×OPTICAL_GRID cell luminances.
 * Divides the frame into a grid and averages each cell (camera-tolerant).
 */
export function sampleGridFromRaster(
  raster: PixelRaster,
  opts?: { grid?: number; inset?: number },
): number[] {
  const grid = opts?.grid ?? OPTICAL_GRID;
  // Default 0 for exact projector round-trips; camera UI may pass ~0.05–0.1 for bezel.
  const inset = opts?.inset ?? 0;
  const { data, width, height } = raster;
  const x0 = Math.floor(width * inset);
  const y0 = Math.floor(height * inset);
  const usableW = Math.max(grid, Math.floor(width * (1 - 2 * inset)));
  const usableH = Math.max(grid, Math.floor(height * (1 - 2 * inset)));
  const cellW = usableW / grid;
  const cellH = usableH / grid;
  const cells: number[] = [];

  for (let row = 0; row < grid; row++) {
    for (let col = 0; col < grid; col++) {
      const xStart = x0 + Math.floor(col * cellW);
      const yStart = y0 + Math.floor(row * cellH);
      const xEnd = x0 + Math.floor((col + 1) * cellW);
      const yEnd = y0 + Math.floor((row + 1) * cellH);
      let sum = 0;
      let n = 0;
      for (let y = yStart; y < yEnd; y++) {
        for (let x = xStart; x < xEnd; x++) {
          const i = (y * width + x) * 4;
          sum += cellByte(data[i], data[i + 1], data[i + 2]);
          n++;
        }
      }
      cells.push(n ? Math.round(sum / n) : 0);
    }
  }
  return cells;
}

/** Render a pattern to a raster (projector snapshot for round-trip tests). */
export function patternToRaster(pattern: OpticalPattern, scale = 12): PixelRaster {
  const width = pattern.width * scale;
  const height = pattern.height * scale;
  const data = new Uint8ClampedArray(width * height * 4);
  for (let row = 0; row < pattern.height; row++) {
    for (let col = 0; col < pattern.width; col++) {
      const v = pattern.cells[row * pattern.width + col];
      // Grayscale raster for exact codec round-trips; UI may still show warm tint.
      const r = v;
      const g = v;
      const b = v;
      for (let dy = 0; dy < scale; dy++) {
        for (let dx = 0; dx < scale; dx++) {
          const x = col * scale + dx;
          const y = row * scale + dy;
          const i = (y * width + x) * 4;
          data[i] = r;
          data[i + 1] = g;
          data[i + 2] = b;
          data[i + 3] = 255;
        }
      }
    }
  }
  return { data, width, height };
}

/** Capture cells from a raster — decode path used by camera + tests. */
export function captureFromRaster(
  raster: PixelRaster,
  source: CaptureSource = "imageData",
): OpticalCaptureResult {
  const cells = sampleGridFromRaster(raster);
  return {
    cells,
    source,
    capturedAt: Date.now(),
    width: raster.width,
    height: raster.height,
  };
}

/** True when running in a browser with mediaDevices. */
export function cameraCaptureAvailable(): boolean {
  return (
    typeof navigator !== "undefined" &&
    !!navigator.mediaDevices &&
    typeof navigator.mediaDevices.getUserMedia === "function"
  );
}

/**
 * Open rear-preferring camera for optical read.
 * Caller must call `session.stop()` when done.
 */
export async function openOpticalCamera(
  constraints?: MediaStreamConstraints,
): Promise<CameraSession> {
  if (!cameraCaptureAvailable()) {
    throw new Error("getUserMedia unavailable — use captureFromRaster in tests");
  }
  const stream = await navigator.mediaDevices.getUserMedia(
    constraints ?? {
      audio: false,
      video: {
        facingMode: { ideal: "environment" },
        width: { ideal: 1280 },
        height: { ideal: 720 },
      },
    },
  );
  const video = document.createElement("video");
  video.playsInline = true;
  video.muted = true;
  video.srcObject = stream;
  await video.play();
  if (video.videoWidth === 0) {
    await new Promise<void>((resolve) => {
      video.onloadedmetadata = () => resolve();
    });
  }
  return {
    video,
    stream,
    stop: () => {
      stream.getTracks().forEach((t) => t.stop());
      video.srcObject = null;
    },
  };
}

/** Grab one video frame → grid cells via canvas. */
export function captureFromVideo(video: HTMLVideoElement): OpticalCaptureResult {
  const w = video.videoWidth || 640;
  const h = video.videoHeight || 480;
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("canvas 2d unavailable");
  ctx.drawImage(video, 0, 0, w, h);
  const imageData = ctx.getImageData(0, 0, w, h);
  return captureFromRaster(
    { data: imageData.data, width: imageData.width, height: imageData.height },
    "getUserMedia",
  );
}

/** One-shot: open camera, wait settle, sample, stop. */
export async function captureOpticalOnce(settleMs = 350): Promise<OpticalCaptureResult> {
  const session = await openOpticalCamera();
  try {
    await new Promise((r) => setTimeout(r, settleMs));
    return captureFromVideo(session.video);
  } finally {
    session.stop();
  }
}

/** Verify a live/test capture against an expected projected pattern. */
export async function verifyOpticalCapture(
  capture: OpticalCaptureResult,
  expectedChecksum: Hex,
): Promise<{ ok: boolean; payload: Uint8Array | null; source: CaptureSource }> {
  const result = await verifyCapturedPattern(capture.cells, expectedChecksum);
  return { ...result, source: capture.source };
}

/**
 * Evidence that this capture went through a raster/camera path.
 * In-memory `simulateCameraCapture` copies do not qualify.
 */
export function isPhysicalOpticalCapture(capture: OpticalCaptureResult): boolean {
  return capture.source === "getUserMedia" || capture.source === "imageData";
}
