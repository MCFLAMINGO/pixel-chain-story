# Optical pay-face profile (PXP1 / PXP1-P)

**Discovery (no tip API):** [`/optical-profile.json`](../public/optical-profile.json) · [`/.well-known/optical-profile.json`](../public/.well-known/optical-profile.json)

Light is the API. Tip RPC is only for Send PIX / balance — not for painting or reading a face.

## Logical layer — PXP1

| Field    | Value                                       |
| -------- | ------------------------------------------- |
| Magic    | `PXP1` (`50 58 50 31`)                      |
| Grid     | 16×16 = 256 cells                           |
| Payload  | 32 bytes                                    |
| Kind     | pay face (`pix1…`) — **not** vault          |
| Address  | bytes `[4..22]` = 19-byte body after `pix1` |
| Reserved | bytes `[23..31]`                            |

Unknown magic → ignore or ask the user to upgrade. **PXP2** is reserved for real layout changes.

## Physical transport — PXP1-P (default)

Same magic, same 32 bytes, same grid, same cell order. **Only the paint rule changes.**

|                  | Amplitude (PXP1-A)                                                    | Binary (PXP1-P)                           |
| ---------------- | --------------------------------------------------------------------- | ----------------------------------------- |
| Paint            | cell ≈ payload byte (8-bit red)                                       | cell ON `255` / OFF `0` (1 bit)           |
| RGB565 projector | **Fails** — red is 5-bit; ~22 levels survive; measured recovery ~0–3% | **Works** — levels collapse to two        |
| Decode           | absolute amplitude                                                    | threshold vs midpoint of captured min/max |

**Why binary:** exposure, white balance, wall colour, and lens falloff all shift absolute levels. Midpoint threshold cancels common-mode. Capacity matches exactly: 256 cells ↔ 256 bits ↔ 32 bytes.

Bit order: **MSB-first** within each payload byte, cells **row-major**.

```
cell[i] = bit (7 - (i % 8)) of payload[i >> 3]
ON = 255, OFF = 0
```

PXP1-A (amplitude) remains documented as lab/historical only — do not project it on RGB565 links.

### Transport selection

- **Renderer:** implicit — physical Show face / projector always paints **PXP1-P** (payload and magic unchanged).
- **Decoder:** try PXP1-P first. Optional amplitude fallback only for historical lab rasters.
- Do not signal transport in-band under PXP1; that would be **PXP2**.

Paste-ready external brief: [`alignment-brief-pixel-optical.md`](./alignment-brief-pixel-optical.md).

## Quiet zone / registration

**Finder and registration marks must live in the quiet zone outside the grid.**  
Under PXP1-P every cell carries a payload bit — there are no spare cells to borrow for finders.

Default paint: a **white quiet ring** (~1 cell) around the binary square so the camera can find the outer bounds when OFF cells are pure black (same as a dark room / letterbox). Decode peels that ring (`inset ≈ 1/18`) before sampling the 16×16.

## Honest envelope (not a blanket claim)

At nHD, cells are ~18px. Binary stays exact to ~**5px** of blur; bits lose past ~**7px** (~0.4 cell). The image looks visibly out of focus to a human **before** decode fails.

External projector measurement (lipstick): `python -m lipstick.tools.optical_report` — rerun rather than take a single lab claim on faith.

## Renderer checklist

1. Fetch or hardcode this profile; paint **PXP1-P** for any physical medium.
2. Never remap ON/OFF for style inside the grid (glow/bloom only outside / behind).
3. Keep a black quiet zone around the square for alignment.
4. Decode with range midpoint — not a fixed 128.
5. Tip RPC optional until Send.
