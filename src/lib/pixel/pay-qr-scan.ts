/**
 * Scan a pay-face QR with the phone camera (BarcodeDetector when available).
 */

import { extractPayAddress } from "./pay-link";

export type PayQrScanSession = {
  video: HTMLVideoElement;
  stop: () => void;
};

function barcodeDetectorAvailable(): boolean {
  return typeof window !== "undefined" && "BarcodeDetector" in window;
}

/** Attach rear camera to an existing `<video>`; call `pollPayQrFrame` until address. */
export async function startPayQrScan(video: HTMLVideoElement): Promise<PayQrScanSession> {
  if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
    throw new Error("Camera not available in this browser");
  }
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: false,
    video: { facingMode: { ideal: "environment" } },
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

export async function pollPayQrFrame(video: HTMLVideoElement): Promise<string | null> {
  if (!barcodeDetectorAvailable()) {
    throw new Error(
      "QR scan needs Chrome / Edge (BarcodeDetector). Paste or open a pay link instead.",
    );
  }
  // @ts-expect-error BarcodeDetector is not in all TS libs
  const detector = new BarcodeDetector({ formats: ["qr_code"] });
  const codes = await detector.detect(video);
  for (const c of codes) {
    const addr = extractPayAddress(String(c.rawValue ?? ""));
    if (addr) return addr;
  }
  return null;
}

export function canScanPayQr(): boolean {
  return (
    typeof navigator !== "undefined" &&
    !!navigator.mediaDevices?.getUserMedia &&
    barcodeDetectorAvailable()
  );
}
