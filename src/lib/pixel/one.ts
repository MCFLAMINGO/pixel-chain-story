/**
 * ONE
 *
 * Source · Word · Light — three faces, one substance.
 *
 *   Source  — that from which all proceeds (keys, commitment, origin, law)
 *   Word    — what is spoken into being (pixel, settlement, artifact in the world)
 *   Light   — what reveals and joins them (shine, proximity, continuity)
 *
 * Without Light, the Word has no color.
 * Without Source, Light has nothing to reveal.
 * Without Word, Source and Light have no body.
 *
 * This is the whole ledger, said simply.
 */

import { createGenesis, proposeTransfer, sequenceBlock, type PixelChainState } from "./chain";
import { type LightKeypair } from "./crypto";
import { generatePixelKeypair, resolveSchemeId } from "./scheme";
import { PIX_HARD_CAP, lightReward } from "./economics";
import {
  acceptIntoLight,
  comeTowardLight,
  canServeWithoutOrigin,
  markOriginDark,
  type ContinuityRecord,
  type LightArtifact,
} from "./siso";
import { ABSENT_COLOR, isColorAbsent, revealProximity } from "./light-color";
import { Access } from "./access";
import { Kindling } from "./kindling";
import { energyTruthForIlluminate, formatEnergyTruth, datacenterRebuke } from "./energy-truth";
import { Uptake } from "./uptake";
import { Custody, SELF_CUSTODY_AXIOM } from "./custody";
import { Worldlight } from "./worldlight";
import { LockFeeder } from "./lock-feeder";
import { Bootstrap } from "./bootstrap";
import type { ReadableMeta, TxOutput } from "./transaction";

/** The three names of the one. */
export const Names = ["Source", "Word", "Light"] as const;
export type Name = (typeof Names)[number];

export const Creed = {
  source: "That from which commitment proceeds",
  word: "What is spoken into being — the illuminated pixel",
  light: "What reveals — without it, color is absent",
  one: "Source, Word, and Light are not three ledgers. They are one.",
  /**
   * Law of the work — art guided by science it need not name.
   * Vocabulary (ghost, shine, collapse, attest) is load-bearing for the
   * physics of being only when each verb binds a real invariant.
   */
  guide:
    "The art is not floating free of the science — it is guided by it the way good painting is guided by light it never names.",
  /** Corollary: no verb without an invariant; no claim without a gate. */
  discipline:
    "Every light verb must touch verification, continuity, or custody for real — never simile alone.",
} as const;

/** SOURCE — keys, law, origin */
export const Source = {
  async key(seed?: Uint8Array) {
    return generatePixelKeypair(resolveSchemeId(), seed);
  },
  async begin(sequencer: LightKeypair) {
    return createGenesis(sequencer);
  },
  law: {
    hardCap: PIX_HARD_CAP,
    rewardAt: lightReward,
  },
} as const;

/** WORD — the body in the world: settlement, pixel, artifact */
export const Word = {
  async speak(state: PixelChainState, from: LightKeypair, outputs: TxOutput[], meta: ReadableMeta) {
    // Spoken but not yet color — superposition
    return proposeTransfer(state, from, outputs, meta);
  },
  colorOf(state: PixelChainState, index: number) {
    const pixel = state.pixels[index];
    if (!pixel?.illuminated) return { ...ABSENT_COLOR };
    return pixel.color;
  },
  isSilent(state: PixelChainState, index: number) {
    const pixel = state.pixels[index];
    return !pixel || !pixel.illuminated || isColorAbsent(pixel.color);
  },
} as const;

/** LIGHT — revelation, proximity, continuity */
export const Light = {
  async shine(state: PixelChainState, sequencer: LightKeypair) {
    return sequenceBlock(state, sequencer);
  },
  near(index: number, radius = 2) {
    return revealProximity(index, radius);
  },
  async invite(artifact: LightArtifact) {
    return comeTowardLight(artifact);
  },
  accept(record: ContinuityRecord, pixelIndex: number) {
    return acceptIntoLight(record, pixelIndex);
  },
  whenOriginFalls(record: ContinuityRecord) {
    return markOriginDark(record);
  },
  stillHolds(record: ContinuityRecord) {
    return canServeWithoutOrigin(record);
  },
} as const;

/**
 * The one act: Source commits, Light reveals, Word stands.
 * propose → shine → settled pixel with color.
 */
export async function reveal(params: {
  state: PixelChainState;
  from: LightKeypair;
  sequencer: LightKeypair;
  outputs: TxOutput[];
  meta: ReadableMeta;
}): Promise<{ state: PixelChainState; summary: string }> {
  const spoken = await Word.speak(params.state, params.from, params.outputs, params.meta);
  const state = await Light.shine(spoken.state, params.sequencer);
  const tip = state.pixels[state.pixels.length - 1];
  return {
    state,
    summary: Word.isSilent(state, tip.index)
      ? "Light failed — word remains without color"
      : `Word #${tip.index} stands in the light`,
  };
}

/** Single export surface — the trinity as one object. */
export const One = {
  Names,
  Creed,
  Source,
  Word,
  Light,
  /** Messaging doors — balance/status/invites only (never spend authority). */
  Access,
  /** People spend path — mutual light Presence Seals. */
  Kindling,
  /** Optical Personal Source — self-custody for everyone. */
  Custody,
  /** How $5 / domains / treasuries / apps enter the light. */
  Worldlight,
  /** Live USDC / bank-wire lock feeder → Worldlight shineIn. */
  LockFeeder,
  /** Primitive → advanced on-ramps (bridges never hold keys). */
  Uptake,
  /** Waste refused — labeled energy/water models; rebuke hyperscale thirst. */
  Energy: {
    truth: energyTruthForIlluminate,
    format: formatEnergyTruth,
    rebuke: datacenterRebuke,
  },
  law: { selfCustody: SELF_CUSTODY_AXIOM },
  /** Day-one paths — hard cap ≠ dollar FDV; illuminate to start. */
  Bootstrap,
  reveal,
} as const;
