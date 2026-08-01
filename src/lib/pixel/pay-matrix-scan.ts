/**
 * Scan a friend's pay-face Kindling matrix with the phone camera.
 */

import { cameraCaptureAvailable, captureFromVideo } from "./optical-capture";
import { decodePayFaceCapture } from "./pay-face-optical";

export type PayMatrixScanSession = {
  video: HTMLVideoElement;
  stop: () => void;
};

export function canScanPayMatrix(): boolean {
  return cameraCaptureAvailable();
}

/** Attach rear camera to an existing `<video>` for matrix decode. */
export async function startPayMatrixScan(video: HTMLVideoElement): Promise<PayMatrixScanSession> {
  if (!cameraCaptureAvailable()) {
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

export async function pollPayMatrixFrame(
  video: HTMLVideoElement,
): Promise<{ address: string; physical: boolean } | null> {
  if (video.readyState < 2 || video.videoWidth < 16) return null;
  const capture = captureFromVideo(video);
  return decodePayFaceCapture(capture);
}
