# Alignment brief — Pixel optical pay-face (for McFlamingo / external renderers)

Self-contained. You do not need the Pixel repo open to implement a compatible painter/decoder.

## Thesis

Light is the API. Tip RPC is **not** required to paint or scan a pay face. Vault never projected.

## Constants (from Pixel — do not invent)

| Name      | Value                                                                                |
| --------- | ------------------------------------------------------------------------------------ |
| Magic     | `PXP1` = `[0x50, 0x58, 0x50, 0x31]`                                                  |
| Grid      | 16×16 = **256 cells**                                                                |
| Payload   | **32 bytes** (256 bits)                                                              |
| Address   | `pix1` + 19-byte body at payload bytes `[4..22]`                                     |
| Reserved  | bytes `[23..31]`                                                                     |
| Discovery | `https://pixelledger.org/optical-profile.json` · `/.well-known/optical-profile.json` |
| Doc       | Pixel `docs/optical-profile.md`                                                      |

**PXP2** is reserved for real layout changes. Do **not** put `PXP1-P` in the magic.

## Why not amplitude (PXP1-A)

“Red channel ≈ payload byte” needs 256 distinguishable red levels. RGB565 projector links carry **5-bit red** (~22 levels). Measured through projection: amplitude recovers **~0–3%** of payload bytes; a no-channel control recovers exactly. The channel fails — not the decoder.

## Physical transport — PXP1-P (default)

Same magic, same 32 bytes, same grid, same cell order. **Only the paint rule changes.**

|                       | PXP1-A (lab / do not project) | PXP1-P (default physical)                     |
| --------------------- | ----------------------------- | --------------------------------------------- |
| Paint                 | cell luminance ≈ byte         | cell **ON=255** / **OFF=0** (1 bit)           |
| Decode                | absolute level                | threshold vs **midpoint of captured min/max** |
| Projectable on RGB565 | no                            | yes                                           |

### Bit order (interop-critical)

- Cells are **row-major**: cell `i` is row `⌊i/16⌋`, col `i%16`
- Cell `i` carries **bit `i` of the payload bitstream**, **MSB-first within each byte**
- So **cell 0 = bit 7 of byte 0**

```ts
// Reference — must match Pixel + lipstick Python
export function encodePayFaceBinary(payload: Uint8Array): number[] {
  if (payload.length !== 32) throw new Error("32 bytes");
  const cells = new Array<number>(256);
  for (let i = 0; i < 256; i++) {
    const byte = payload[i >> 3]!;
    const bit = 7 - (i & 7);
    cells[i] = (byte >> bit) & 1 ? 255 : 0;
  }
  return cells;
}

export function decodePayFaceBinary(cells: number[]): Uint8Array | null {
  if (cells.length !== 256) return null;
  let min = 255,
    max = 0;
  for (const c of cells) {
    const v = Math.max(0, Math.min(255, c));
    if (v < min) min = v;
    if (v > max) max = v;
  }
  if (max - min < 24) return null;
  const mid = (min + max) / 2;
  const out = new Uint8Array(32);
  for (let i = 0; i < 256; i++) {
    const bit = (cells[i] ?? 0) > mid ? 1 : 0;
    out[i >> 3]! |= bit << (7 - (i & 7));
  }
  return out;
}
```

### Known-good prefix (self-check — one line)

For payload bytes starting `50 58 50 31 3f …` (magic `PXP1` + `0x3f`), the first **40 cells** hex must be:

```
00ff00ff0000000000ff00ffff00000000ff00ff000000000000ffff000000ff0000ffffffffffff
```

If those 40 cells match, bit order is right. If not, check **MSB-first** and **row-major** first.

```ts
const p = new Uint8Array(32);
p.set([0x50, 0x58, 0x50, 0x31, 0x3f]);
const hex = encodePayFaceBinary(p)
  .slice(0, 40)
  .map((c) => c.toString(16).padStart(2, "0"))
  .join("");
// hex === "00ff00ff0000000000ff00ffff00000000ff00ff000000000000ffff000000ff0000ffffffffffff"
```

## Quiet zone / finders

**Do not borrow a data cell for a finder.** All 256 cells carry payload bits under PXP1-P.

Registration / finders live in the **quiet zone outside the grid**. Pixel’s default paint uses a **white quiet ring** (~1 cell, peel inset `1/18`) so pure-black OFF cells do not collapse into a dark letterbox when cropping.

## Honest envelope

At nHD (~18px cells): binary stays exact to ~**5px** blur; bits lose past ~**7px** (~0.4 cell). The image looks soft to a human **before** decode fails. Not a blanket robustness claim.

## Transport selection (design call — locked)

| Role                     | Rule                                                                                                                                               |
| ------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Renderer / projector** | Implicit: if the medium is physical projection (or phone Show face), paint **PXP1-P**. Do not change the payload or magic.                         |
| **Decoder**              | Prefer **PXP1-P** (midpoint threshold → unpack magic). Amplitude (PXP1-A) is lab-only; do not require it for interop.                              |
| **Unknown source**       | Try PXP1-P first. If magic fails and you must support historical amplitude rasters, optional fallback — never the other way around for projectors. |

Signalling transport inside the payload is **out of scope** for PXP1; that would be a layout change → **PXP2**.

## What Pixel already ships

- Wallet Show face / Scan matrix on `PXP1-P` + quiet ring
- `/optical-profile.json` and `/.well-known/optical-profile.json`
- Typed helpers: `encodePayFaceMatrix` / `decodePayFaceMatrix` / `payloadToBinaryCells` in `src/lib/pixel/pay-face-optical.ts`

## Coordination

Paste this brief into the McFlamingo (or other) agent. Align on the known-good prefix before trading screenshots.
