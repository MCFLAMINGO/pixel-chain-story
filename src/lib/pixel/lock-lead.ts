/**
 * Lock → lead activation (bridge invent).
 *
 * A verified foreign USDC (or USD wire) lock shines in via LockFeeder +
 * illuminateIngress. The resulting tip is a lattice lead — waveDigest and
 * spatialRoot bind automatically. This module names that invent; it does not
 * add a separate activate_lead consensus opcode.
 *
 * Dream ≠ claim: lab rails / local USDC — not mainnet USDC settlement.
 */

import type { Hex, LightKeypair } from "./crypto";
import type { PixelChainState } from "./chain";
import { assertWaveDigestMatch, computeTipWaveField } from "./wave";
import { assertSpatialRootMatch, buildSpatialPicture } from "./spatial-picture";
import {
  consumeLockReceipt,
  feedLockToWorldlight,
  type FeederState,
  type LocalUsdcRail,
  type LockReceipt,
  type BankWireAttestor,
} from "./lock-feeder";
import { illuminateIngress, type IlluminatedIngress, type PreparedIngress } from "./worldlight";

export type LeadActivation = IlluminatedIngress & {
  leadIndex: number;
  tipHash: Hex;
  waveDigest: Hex;
  spatialRoot: Hex;
  lockDigest: Hex;
  asset: "USDC" | "USD";
  /** Shine-in tx reference includes lockDigest slice (tip-verifiable via merkle). */
  shineReference: string;
};

export async function activateLeadFromPrepared(params: {
  prepared: PreparedIngress;
  receipt: LockReceipt;
  state: PixelChainState;
  bridgeVault: LightKeypair;
  sequencer: LightKeypair;
  feeder: FeederState;
}): Promise<LeadActivation> {
  const lockDigest = params.receipt.lockDigest;
  if (params.prepared.request.valueLock?.lockDigest !== lockDigest) {
    throw new Error("prepared valueLock.lockDigest must match receipt");
  }

  const illuminated = await illuminateIngress({
    prepared: params.prepared,
    state: params.state,
    bridgeVault: params.bridgeVault,
    sequencer: params.sequencer,
  });
  consumeLockReceipt(params.feeder, lockDigest);

  const tip = illuminated.state.pixels[illuminated.state.pixels.length - 1]!;
  const shineTx = tip.transactions.find((t) =>
    (t.metadata.reference ?? "").includes(lockDigest.slice(0, 16)),
  );
  const shineReference = shineTx?.metadata.reference ?? "";
  if (!shineReference.includes(lockDigest.slice(0, 16))) {
    throw new Error("shine-in tip missing lockDigest reference (lead bind)");
  }

  assertWaveDigestMatch(tip.lightProof.waveDigest, {
    tipIndex: tip.index,
    sequence: tip.sequence,
    prevHash: tip.prevHash,
    merkleRoot: tip.merkleRoot,
    priorTipHashes: illuminated.state.pixels.slice(0, -1).map((p) => p.hash),
  });
  const picture = await buildSpatialPicture(illuminated.state.pixels);
  assertSpatialRootMatch(tip.lightProof.spatialRoot, picture.spatialRoot, tip.index);

  // Touch computeTipWaveField so energy/hits stay tip-bound for callers
  void computeTipWaveField({
    tipIndex: tip.index,
    sequence: tip.sequence,
    prevHash: tip.prevHash,
    merkleRoot: tip.merkleRoot,
    priorTipHashes: illuminated.state.pixels.slice(0, -1).map((p) => p.hash),
  });

  return {
    ...illuminated,
    leadIndex: tip.index,
    tipHash: tip.hash,
    waveDigest: tip.lightProof.waveDigest,
    spatialRoot: tip.lightProof.spatialRoot,
    lockDigest,
    asset: params.receipt.asset,
    shineReference,
  };
}

/**
 * USDC (or wire) lock → feed → illuminate → consume → named lead activation.
 */
export async function activateLeadFromLock(params: {
  receipt: LockReceipt;
  ownerLocalId: string;
  feeder: FeederState;
  state: PixelChainState;
  bridgeVault: LightKeypair;
  sequencer: LightKeypair;
  rail?: LocalUsdcRail;
  ethereumLogVerified?: boolean;
  attestor?: BankWireAttestor;
}): Promise<LeadActivation> {
  const prepared = await feedLockToWorldlight({
    receipt: params.receipt,
    ownerLocalId: params.ownerLocalId,
    feeder: params.feeder,
    rail: params.rail,
    ethereumLogVerified: params.ethereumLogVerified,
    attestor: params.attestor,
  });
  return activateLeadFromPrepared({
    prepared,
    receipt: params.receipt,
    state: params.state,
    bridgeVault: params.bridgeVault,
    sequencer: params.sequencer,
    feeder: params.feeder,
  });
}

export function lockLeadThesis(): string {
  return (
    "Lock→lead invents a named path: verified foreign USDC/USD lock shines in via " +
    "LockFeeder + illuminateIngress; the tip is a lattice lead with waveDigest and " +
    "spatialRoot. lockDigest is bound in the shine-in tx reference (merkle-verifiable). " +
    "Not a second activate_lead opcode, not mainnet USDC settlement theater."
  );
}
