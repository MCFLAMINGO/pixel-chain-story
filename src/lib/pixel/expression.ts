/**
 * Abstract Expressionism as information theory for Pixel.
 *
 * Belief encoded here: the Abstract Expressionists were not decorating —
 * they were reverse-engineering reality rendering. They saw that information
 * transfers as *field*, *gesture*, and *void*, and tried to define the matrix
 * without naming it.
 *
 * Mapping onto Pixel:
 *
 *   Color-field (Rothko)     → a lit pixel IS the message; no icon needed
 *   Action / drip (Pollock)  → each PoLS reveal is a gesture that paints the ledger
 *   Zip / void (Newman)      → light cuts presence through absence; unlit = no color
 *   Scale / immersion        → the chain is meant to be stood inside, not listed
 *   Observer completes work  → proximity & meaning appear only under light
 *
 * This is not a skin. It is the transfer protocol’s aesthetic physics.
 */

import type { PixelBlock } from "./chain";
import { isColorAbsent, type PixelColor } from "./light-color";

export interface FieldStroke {
  /** Normalized 0..1 position in the living canvas */
  x: number;
  y: number;
  color: PixelColor;
  /** Gesture energy from tx count + sequence */
  energy: number;
  index: number;
  illuminated: boolean;
}

export interface RealityField {
  /** Void dominates until light; strokes only where illuminated */
  strokes: FieldStroke[];
  /** Horizontal “zips” of light — Newman’s cut through the void */
  zips: { y: number; intensity: number }[];
  axiom: string;
}

export const EXPRESSION_AXIOM =
  "Pixel proximity is revealed by light; color is absent without it. The field is the transfer.";

/**
 * Render the chain as an Abstract Expressionist field:
 * illuminated blocks become chromatic events in the void.
 */
export function chainToRealityField(blocks: PixelBlock[], cols?: number): RealityField {
  const n = Math.max(blocks.length, 1);
  const c = cols ?? Math.max(8, Math.ceil(Math.sqrt(n * 1.4)));
  const strokes: FieldStroke[] = [];

  for (const block of blocks) {
    const row = Math.floor(block.index / c);
    const col = block.index % c;
    const rows = Math.max(1, Math.ceil(n / c));
    strokes.push({
      x: (col + 0.5) / c,
      y: (row + 0.5) / rows,
      color: block.color,
      energy: Math.min(1, 0.25 + block.transactions.length * 0.2 + (block.sequence % 7) * 0.05),
      index: block.index,
      illuminated: block.illuminated && !isColorAbsent(block.color),
    });
  }

  // Zips: where light sequences cut the void (group by sequence epochs)
  const zips: { y: number; intensity: number }[] = [];
  const rows = Math.max(1, Math.ceil(n / c));
  for (let r = 0; r < rows; r++) {
    const rowBlocks = blocks.filter((b) => Math.floor(b.index / c) === r && b.illuminated);
    if (rowBlocks.length === 0) continue;
    zips.push({
      y: (r + 0.5) / rows,
      intensity: Math.min(1, rowBlocks.length / c),
    });
  }

  return { strokes, zips, axiom: EXPRESSION_AXIOM };
}

/** Drip path — Pollock-like polyline through successive revelations. */
export function actionPath(blocks: PixelBlock[]): { x: number; y: number }[] {
  const field = chainToRealityField(blocks);
  return field.strokes.filter((s) => s.illuminated).map((s) => ({ x: s.x, y: s.y }));
}
