/**
 * Pay-face share links — so people never type pix1… by hand.
 * QR / clipboard / ?to= all resolve through extractPayAddress.
 */

import { isPixelAddress } from "./crypto";

/** Deep link that opens /wallet Send with recipient filled. */
export function payFaceShareUrl(address: string, origin?: string): string {
  const base =
    origin?.replace(/\/$/, "") ||
    (typeof window !== "undefined" ? window.location.origin : "") ||
    "https://pixelledger.org";
  const u = new URL(`${base}/wallet`);
  u.searchParams.set("tab", "send");
  u.searchParams.set("to", address);
  return u.toString();
}

/** Pull a pix1… out of raw QR / paste / shared URL text. */
export function extractPayAddress(raw: string): string | null {
  const text = raw.trim();
  if (!text) return null;
  if (isPixelAddress(text)) return text;

  const bare = text.match(/pix1[a-f0-9]{38}/i);
  if (bare && isPixelAddress(bare[0].toLowerCase())) return bare[0].toLowerCase();

  try {
    const u = new URL(text);
    const to = u.searchParams.get("to") ?? u.searchParams.get("pay");
    if (to && isPixelAddress(to.trim().toLowerCase())) return to.trim().toLowerCase();
    const pathPix = u.pathname.match(/pix1[a-f0-9]{38}/i);
    if (pathPix && isPixelAddress(pathPix[0].toLowerCase())) return pathPix[0].toLowerCase();
  } catch {
    /* not a URL */
  }
  return null;
}

export function payLinkThesis(): string {
  return (
    "Share your pay face as a QR or link — the other phone scans or opens it. " +
    "No typing pix1…. Optical matrix / Kindling is the presence layer; QR is the address rail."
  );
}
