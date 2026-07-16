/**
 * Axiom:
 *   Pixel proximity is revealed by light.
 *   Color is absent without it.
 *
 * Without illumination a pixel has no color — not black-as-style, but absence.
 * When light arrives (PoLS revelation, screen shine, aperture), color comes into
 * being AND neighboring pixels in space/time/value become visible as proximity.
 *
 * Forms of light continuously compose an effectively infinite spectrum; observers
 * (screen, sun, flashlight, angle) re-project the same truth into endless appearances.
 */

import { sha512Hex, type Hex } from "./crypto";
import type { PrivacyLevel, Transaction } from "./transaction";

export interface PixelColor {
  r: number;
  g: number;
  b: number;
}

/** Sentinel: no light → no color. Not “black paint” — unrendered void. */
export const ABSENT_COLOR: PixelColor = { r: 0, g: 0, b: 0 };

export function isColorAbsent(color: PixelColor | null | undefined): boolean {
  if (!color) return true;
  return color.r === 0 && color.g === 0 && color.b === 0;
}

export interface Spectrum {
  bands: number[];
  contributions: LightContribution[];
  /** 0 = no light (color must be absent); 1 = fully illuminated */
  illumination: number;
}

export interface LightContribution {
  form:
    | "incident"
    | "reflected"
    | "transmitted"
    | "emitted"
    | "polarized"
    | "interfered"
    | "temporal"
    | "diffracted"
    | "ambient"
    | "observer"
    | "proximity";
  weight: number;
  note: string;
}

export type ObserverMode =
  | "canonical"
  | "screen"
  | "sunlight"
  | "flashlight"
  | "oblique"
  | "two_screens";

export interface LightScene {
  index: number;
  hash: Hex;
  prevHash: Hex;
  merkleRoot: Hex;
  beacon: Hex;
  sequence: number;
  timestamp: number;
  transactions: Transaction[];
  /** True only after light has revealed this block (PoLS). */
  illuminated: boolean;
  /** Neighbor indices already lit — proximity field strengthens color. */
  litNeighbors?: number[];
  interference?: number;
}

export interface ProximityLink {
  from: number;
  to: number;
  kind: "spatial" | "temporal" | "economic" | "spectral";
  strength: number;
}

const BANDS = 24;

function clamp01(n: number): number {
  return Math.min(1, Math.max(0, n));
}

function hexByte(hex: Hex, i: number): number {
  const clean = hex.replace(/^0x/, "");
  if (clean.length < 2) return 0;
  const idx = (i * 2) % (clean.length - (clean.length % 2 || 2));
  return parseInt(clean.slice(idx, idx + 2) || "00", 16) / 255;
}

function bandFromHex(hex: Hex, band: number, salt: number): number {
  const a = hexByte(hex, band);
  const b = hexByte(hex, band + 3 + salt);
  const c = hexByte(hex, band + 7 + salt * 2);
  return clamp01((a * 0.5 + b * 0.35 + c * 0.15) % 1);
}

function addBands(target: number[], source: number[], weight: number): void {
  for (let i = 0; i < target.length; i++) {
    target[i] = clamp01(target[i] + source[i] * weight);
  }
}

function makeBands(hex: Hex, salt: number, phase = 0): number[] {
  return Array.from({ length: BANDS }, (_, i) => {
    const base = bandFromHex(hex, i, salt);
    const wave = 0.5 + 0.5 * Math.sin(phase + i * 0.41 + salt);
    return clamp01(base * 0.85 + wave * 0.15);
  });
}

function privacyPolarization(level: PrivacyLevel): { r: number; g: number; b: number } {
  switch (level) {
    case "private":
      return { r: 0.75, g: 0.55, b: 1.15 };
    case "selective":
      return { r: 1.05, g: 0.9, b: 0.8 };
    default:
      return { r: 1, g: 1, b: 1 };
  }
}

/**
 * Without illumination, spectrum illumination = 0 and color must be absent.
 * With light, every form composes continuous (infinite) influence on the pixel.
 */
export async function composeSpectrum(scene: LightScene): Promise<Spectrum> {
  if (!scene.illuminated) {
    return {
      bands: new Array(BANDS).fill(0),
      contributions: [
        {
          form: "incident",
          weight: 0,
          note: "No light — color absent; proximity hidden",
        },
      ],
      illumination: 0,
    };
  }

  const bands = new Array(BANDS).fill(0);
  const contributions: LightContribution[] = [];
  const phase = ((scene.timestamp % 1_000_000) / 1_000_000) * Math.PI * 2 + scene.sequence * 0.17;

  const incident = makeBands(scene.beacon, 1, phase);
  addBands(bands, incident, 0.34);
  contributions.push({
    form: "incident",
    weight: 0.34,
    note: "Sequencer beacon — light arrives; color may exist",
  });

  const reflected = makeBands(scene.prevHash || scene.hash, 2, phase * 0.7);
  addBands(bands, reflected, 0.18);
  contributions.push({
    form: "reflected",
    weight: 0.18,
    note: "Prior pixel reflects into this one (proximity in time)",
  });

  const transmitted = makeBands(scene.merkleRoot, 3, phase * 1.3);
  addBands(bands, transmitted, 0.2);
  contributions.push({
    form: "transmitted",
    weight: 0.2,
    note: "Light through the transaction body",
  });

  let emitWeight = 0;
  for (const tx of scene.transactions) {
    const energy = Math.log10(1 + tx.outputs.reduce((s, o) => s + o.amount, 0)) / 8;
    const memoHash = await sha512Hex(tx.metadata.description + "|" + (tx.metadata.reference ?? ""));
    const emitted = makeBands(memoHash, 4, phase + energy * 4);
    const w = 0.08 + energy * 0.12;
    addBands(bands, emitted, w);
    emitWeight += w;
  }
  if (scene.transactions.length) {
    contributions.push({
      form: "emitted",
      weight: emitWeight,
      note: `${scene.transactions.length} tx radiate value/memo light`,
    });
  }

  const polar = scene.transactions.reduce(
    (acc, tx) => {
      const p = privacyPolarization(tx.privacy ?? "public");
      return { r: acc.r * p.r, g: acc.g * p.g, b: acc.b * p.b };
    },
    { r: 1, g: 1, b: 1 },
  );
  for (let i = 0; i < BANDS; i++) {
    const t = i / (BANDS - 1);
    const skew = polar.r * (1 - t) + polar.b * t + polar.g * Math.sin(t * Math.PI) * 0.3;
    bands[i] = clamp01(bands[i] * (0.85 + 0.15 * skew));
  }
  contributions.push({
    form: "polarized",
    weight: 0.1,
    note: "Privacy veil rotates channels",
  });

  const interference = scene.interference ?? 0;
  if (interference > 0) {
    addBands(bands, makeBands(scene.hash, 5, phase * 2.2), 0.15 * interference);
    contributions.push({
      form: "interfered",
      weight: 0.15 * interference,
      note: "Nearby ghosts shimmer until their own light comes",
    });
  }

  addBands(bands, makeBands(scene.hash, 6, phase), 0.07);
  contributions.push({ form: "temporal", weight: 0.07, note: "Time phases the waveform" });

  for (let i = 0; i < BANDS; i++) {
    const ripple = 0.5 + 0.5 * Math.sin(i * i * 0.13 + scene.index * 0.9 + phase);
    bands[i] = clamp01(bands[i] * (0.92 + 0.08 * ripple));
  }
  contributions.push({
    form: "diffracted",
    weight: 0.05,
    note: "Maze diffraction — fine structure",
  });

  addBands(bands, makeBands(await sha512Hex(`ambient|${scene.sequence}`), 7, 0), 0.06);
  contributions.push({ form: "ambient", weight: 0.06, note: "Epoch ambient" });

  // Proximity: lit neighbors bleed continuous influence (infinite as graph grows)
  const neighbors = scene.litNeighbors ?? [];
  if (neighbors.length > 0) {
    const proxW = clamp01(0.04 * neighbors.length);
    const prox = makeBands(
      await sha512Hex(`proximity|${scene.index}|${neighbors.join(",")}`),
      8,
      phase,
    );
    addBands(bands, prox, proxW);
    contributions.push({
      form: "proximity",
      weight: proxW,
      note: `Light reveals ${neighbors.length} nearby pixel(s)`,
    });
  }

  return { bands, contributions, illumination: 1 };
}

export function spectrumToRgb(
  spectrum: Spectrum,
  observer: ObserverMode = "canonical",
): PixelColor {
  // Axiom enforcement: absent without light
  if (spectrum.illumination <= 0) return { ...ABSENT_COLOR };

  let r = 0;
  let g = 0;
  let b = 0;
  for (let i = 0; i < spectrum.bands.length; i++) {
    const t = i / (spectrum.bands.length - 1);
    const a = spectrum.bands[i];
    r += a * Math.pow(t, 1.2);
    g += a * Math.sin(Math.PI * t);
    b += a * Math.pow(1 - t, 1.2);
  }
  const norm = spectrum.bands.length / 2.2;
  r /= norm;
  g /= norm;
  b /= norm;

  switch (observer) {
    case "screen":
      r *= 1.05;
      g *= 1.02;
      b *= 0.92;
      break;
    case "sunlight":
      r *= 1.12;
      g *= 1.08;
      b *= 0.85;
      break;
    case "flashlight":
      r *= 1.2;
      g *= 1.15;
      b *= 0.7;
      break;
    case "oblique":
      r *= 0.75;
      g *= 0.9;
      b *= 1.25;
      break;
    case "two_screens":
      r = clamp01(r * 0.9 + 0.08);
      g = clamp01(g * 1.05);
      b = clamp01(b * 1.1 + 0.05);
      break;
    default:
      break;
  }

  const to8 = (n: number) => Math.max(1, Math.round(clamp01(n) * 255)); // lit ⇒ non-absent
  return { r: to8(r), g: to8(g), b: to8(b) };
}

export async function composePixelColor(
  scene: LightScene,
  observer: ObserverMode = "canonical",
): Promise<{ color: PixelColor; spectrum: Spectrum }> {
  const spectrum = await composeSpectrum(scene);
  return { color: spectrumToRgb(spectrum, observer), spectrum };
}

/**
 * Causal light cone at mint time — only prior pixels (stable for consensus).
 * Proximity does not exist in the dark; future pixels are not yet lit.
 */
export function revealProximity(focusIndex: number, radius = 2): number[] {
  if (focusIndex <= 0) return [];
  const near: number[] = [];
  for (let i = Math.max(0, focusIndex - radius); i < focusIndex; i++) {
    near.push(i);
  }
  // Grid adjacency among already-lit prior pixels
  const cols = Math.max(1, Math.ceil(Math.sqrt(focusIndex + 1)));
  const fr = Math.floor(focusIndex / cols);
  const fc = focusIndex % cols;
  for (let i = 0; i < focusIndex; i++) {
    const ir = Math.floor(i / cols);
    const ic = i % cols;
    const gridDist = Math.abs(fr - ir) + Math.abs(fc - ic);
    if (gridDist <= radius && !near.includes(i)) near.push(i);
  }
  return near;
}

/** Economic + temporal proximity links — only among illuminated pixels. */
export function proximityLinks(
  pixels: {
    index: number;
    illuminated: boolean;
    transactions: Transaction[];
    color: PixelColor;
  }[],
  focusIndex: number,
): ProximityLink[] {
  const focus = pixels[focusIndex];
  if (!focus?.illuminated) return []; // no light → proximity hidden

  const links: ProximityLink[] = [];
  // Explorer may show bidirectional proximity among currently lit pixels
  const near = [
    ...revealProximity(focusIndex, 2),
    ...pixels
      .filter((b) => b.illuminated && b.index > focusIndex && b.index <= focusIndex + 2)
      .map((b) => b.index),
  ];
  for (const j of near) {
    const other = pixels[j];
    if (!other.illuminated) continue; // dark neighbor stays undisclosed
    links.push({
      from: focusIndex,
      to: j,
      kind: Math.abs(focusIndex - j) === 1 ? "temporal" : "spatial",
      strength: 1 / (1 + Math.abs(focusIndex - j)),
    });

    // Economic: shared addresses
    const focusAddrs = new Set(focus.transactions.flatMap((t) => t.outputs.map((o) => o.address)));
    const shared = other.transactions.some((t) => t.outputs.some((o) => focusAddrs.has(o.address)));
    if (shared) {
      links.push({
        from: focusIndex,
        to: j,
        kind: "economic",
        strength: 0.8,
      });
    }

    // Spectral: colors near each other in RGB space
    if (!isColorAbsent(focus.color) && !isColorAbsent(other.color)) {
      const dr = focus.color.r - other.color.r;
      const dg = focus.color.g - other.color.g;
      const db = focus.color.b - other.color.b;
      const dist = Math.sqrt(dr * dr + dg * dg + db * db);
      if (dist < 90) {
        links.push({
          from: focusIndex,
          to: j,
          kind: "spectral",
          strength: clamp01(1 - dist / 90),
        });
      }
    }
  }
  return links;
}

export function cssRgb(color: PixelColor, alpha = 1): string {
  if (isColorAbsent(color)) return alpha < 1 ? `rgba(0,0,0,${alpha})` : "transparent";
  return alpha < 1
    ? `rgba(${color.r}, ${color.g}, ${color.b}, ${alpha})`
    : `rgb(${color.r}, ${color.g}, ${color.b})`;
}
