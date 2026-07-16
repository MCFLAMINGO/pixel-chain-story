/**
 * Kindling — the people path that is not a wallet and not mobile money.
 *
 * Problem we refuse:
 *   - Seed-phrase theater (theft + phishing)
 *   - SMS "send" as spend authority (scam heaven, renamed M-Pesa)
 *   - Invisible approvals / gas / hex
 *
 * Invention:
 *   Two living parties (or person + village Light Pillar) kindle halves of a
 *   Presence Seal by exchanging optical light in physical proximity.
 *   Only the confluence of both lights can authorize a human-scale spend.
 *   Remote scammers cannot complete what they cannot stand in the light for.
 *   Stolen half-patterns expire.
 *
 * This is new protocol surface — not multisig renamed, not custodial SMS.
 */

import {
  encodeOpticalPattern,
  simulateCameraCapture,
  verifyCapturedPattern,
  type OpticalPattern,
} from "./optical";
import { bytesToHex, hexToBytes, randomBytes, sha512Hex, type Hex } from "./crypto";
import { proposeTransfer, sequenceBlock, type LightKeypair, type PixelChainState } from "./chain";
import { energyTruthForIlluminate, formatEnergyTruth, type EnergyTruth } from "./energy-truth";
import { assertSelfCustody } from "./custody";

const KINDLE_TTL_MS = 5 * 60 * 1000; // five minutes — presence, not a standing order

export interface KindleIntent {
  fromLocal: string;
  toLocal: string;
  amount: number;
  /** Human note — signed into the light, not a scam URL */
  note?: string;
}

export interface KindleHalf {
  role: "offer" | "accept";
  intent: KindleIntent;
  nonce: Hex;
  /** H(role|from|to|amount|note|nonce) — what the light carries */
  commitment: Hex;
  pattern: OpticalPattern;
  createdAt: number;
  expiresAt: number;
  /**
   * Party / device id for this half. Confluence rejects identical partyIds so
   * one process cannot trivially play both sides without spoofing ids.
   * Real anti-phishing still needs two physical optical captures (not shipped).
   */
  partyId: string;
}

export interface PresenceSeal {
  /** Confluence of offer + accept commitments */
  seal: Hex;
  offerCommitment: Hex;
  acceptCommitment: Hex;
  intent: KindleIntent;
  createdAt: number;
  expiresAt: number;
  /** Anti-scam: both parties bound the same human labels + amount */
  boundLabel: string;
  /**
   * `simulated` = in-process luminance copy (lab / selftest).
   * `optical-capture` reserved for real camera path (not shipped).
   */
  channel: "simulated" | "optical-capture";
}

export type KindlingFail =
  | "expired"
  | "role_mismatch"
  | "intent_mismatch"
  | "optical_corrupt"
  | "seal_invalid"
  | "same_party";

async function intentCommitment(
  role: "offer" | "accept",
  intent: KindleIntent,
  nonce: Hex,
): Promise<Hex> {
  const note = intent.note ?? "";
  return sha512Hex(
    `kindle|${role}|${intent.fromLocal}|${intent.toLocal}|${intent.amount}|${note}|${nonce}`,
  );
}

/** Pack commitment bytes into optical payload (32 bytes). */
async function commitmentToPayload(commitment: Hex): Promise<Uint8Array> {
  const raw = hexToBytes(commitment);
  const out = new Uint8Array(32);
  out.set(raw.slice(0, 32));
  return out;
}

/** Offer half — sender kindles intent into light. */
export async function kindleOffer(
  intent: KindleIntent,
  opts?: { partyId?: string },
): Promise<KindleHalf> {
  if (intent.amount <= 0) throw new Error("Kindling amount must be positive");
  if (!intent.fromLocal.trim() || !intent.toLocal.trim()) {
    throw new Error("Kindling needs human names, not hex");
  }
  const nonce = bytesToHex(randomBytes(16));
  const commitment = await intentCommitment("offer", intent, nonce);
  const pattern = await encodeOpticalPattern(await commitmentToPayload(commitment));
  const createdAt = Date.now();
  return {
    role: "offer",
    intent: { ...intent },
    nonce,
    commitment,
    pattern,
    createdAt,
    expiresAt: createdAt + KINDLE_TTL_MS,
    partyId: opts?.partyId ?? `offer-${bytesToHex(randomBytes(8))}`,
  };
}

/**
 * Accept half — receiver stands in the light and answers the same intent.
 * The accept pattern is independent light that must match intent fields.
 */
export async function kindleAccept(
  intent: KindleIntent,
  opts?: { partyId?: string },
): Promise<KindleHalf> {
  if (intent.amount <= 0) throw new Error("Kindling amount must be positive");
  const nonce = bytesToHex(randomBytes(16));
  const commitment = await intentCommitment("accept", intent, nonce);
  const pattern = await encodeOpticalPattern(await commitmentToPayload(commitment));
  const createdAt = Date.now();
  return {
    role: "accept",
    intent: { ...intent },
    nonce,
    commitment,
    pattern,
    createdAt,
    expiresAt: createdAt + KINDLE_TTL_MS,
    partyId: opts?.partyId ?? `accept-${bytesToHex(randomBytes(8))}`,
  };
}

function intentsEqual(a: KindleIntent, b: KindleIntent): boolean {
  return (
    a.fromLocal === b.fromLocal &&
    a.toLocal === b.toLocal &&
    a.amount === b.amount &&
    (a.note ?? "") === (b.note ?? "")
  );
}

/**
 * Confluence — two lights meet.
 *
 * Honesty: default path uses `simulateCameraCapture` (in-process luminance
 * copy). That proves commitment integrity, not physical proximity. A remote
 * attacker who can run both halves still can — unless partyIds differ and a
 * future real camera capture path binds device evidence. Do not market this
 * as shipped anti-phishing until `channel === "optical-capture"`.
 */
export async function confluentSeal(
  offer: KindleHalf,
  accept: KindleHalf,
  opts?: { now?: number; captureNoise?: number; allowSameParty?: boolean },
): Promise<{ ok: true; seal: PresenceSeal } | { ok: false; reason: KindlingFail }> {
  const now = opts?.now ?? Date.now();
  if (offer.role !== "offer" || accept.role !== "accept") {
    return { ok: false, reason: "role_mismatch" };
  }
  if (!opts?.allowSameParty && offer.partyId === accept.partyId) {
    return { ok: false, reason: "same_party" };
  }
  if (now > offer.expiresAt || now > accept.expiresAt) {
    return { ok: false, reason: "expired" };
  }
  if (!intentsEqual(offer.intent, accept.intent)) {
    return { ok: false, reason: "intent_mismatch" };
  }

  // Prototype optical integrity — simulated capture, not getUserMedia.
  const capturedOffer = simulateCameraCapture(offer.pattern, opts?.captureNoise ?? 0);
  const capturedAccept = simulateCameraCapture(accept.pattern, opts?.captureNoise ?? 0);
  const vo = await verifyCapturedPattern(capturedOffer, offer.pattern.checksum);
  const va = await verifyCapturedPattern(capturedAccept, accept.pattern.checksum);
  if (!vo.ok || !va.ok) {
    return { ok: false, reason: "optical_corrupt" };
  }

  const expectOffer = await intentCommitment("offer", offer.intent, offer.nonce);
  const expectAccept = await intentCommitment("accept", accept.intent, accept.nonce);
  if (expectOffer !== offer.commitment || expectAccept !== accept.commitment) {
    return { ok: false, reason: "seal_invalid" };
  }

  const seal = await sha512Hex(
    `presence|${offer.commitment}|${accept.commitment}|${offer.intent.amount}|${offer.intent.fromLocal}|${offer.intent.toLocal}`,
  );

  return {
    ok: true,
    seal: {
      seal,
      offerCommitment: offer.commitment,
      acceptCommitment: accept.commitment,
      intent: { ...offer.intent },
      createdAt: now,
      expiresAt: Math.min(offer.expiresAt, accept.expiresAt),
      boundLabel: `${offer.intent.fromLocal} → ${offer.intent.toLocal} · ${offer.intent.amount} PIX`,
      channel: "simulated",
    },
  };
}

export function sealAlive(seal: PresenceSeal, now = Date.now()): boolean {
  return now <= seal.expiresAt;
}

/** Verify a seal string matches intent + half commitments (for chain admission). */
export async function verifyPresenceSeal(seal: PresenceSeal): Promise<boolean> {
  if (!sealAlive(seal)) return false;
  const expect = await sha512Hex(
    `presence|${seal.offerCommitment}|${seal.acceptCommitment}|${seal.intent.amount}|${seal.intent.fromLocal}|${seal.intent.toLocal}`,
  );
  return expect === seal.seal;
}

/**
 * Settle a kindled spend: Presence Seal → self-custody sign → PoLS illuminate.
 *
 * `from` MUST be the person's own unlocked Personal Source.
 * Helpers/pillars may help aim cameras; they must not pass gateway-held keys.
 * Directory maps human names → addresses for the *recipient*; sender signs themselves.
 */
export async function settleKindling(params: {
  state: PixelChainState;
  /** Unlocked Personal Source of the sender — never a custodian hot wallet */
  from: LightKeypair;
  /** Expected owner address (from PersonalSource registry / directory of self) */
  ownerAddress: string;
  sequencer: LightKeypair;
  toAddress: string;
  seal: PresenceSeal;
  /** Must stay false — self-custody law */
  gatewayHeldSeed?: boolean;
}): Promise<{
  state: PixelChainState;
  energy: EnergyTruth;
  summary: string;
}> {
  if (!(await verifyPresenceSeal(params.seal))) {
    throw new Error("Presence seal invalid or expired — no remote cheat");
  }
  assertSelfCustody({
    signerAddress: params.from.address,
    ownerAddress: params.ownerAddress,
    gatewayHeldSeed: params.gatewayHeldSeed,
  });
  const spoken = await proposeTransfer(
    params.state,
    params.from,
    [{ address: params.toAddress, amount: params.seal.intent.amount }],
    {
      description: params.seal.intent.note || `Kindling: ${params.seal.boundLabel}`,
      recipientLabel: params.seal.intent.toLocal,
      reference: `KINDLING-${params.seal.seal.slice(0, 24)}`,
    },
  );
  const state = await sequenceBlock(spoken.state, params.sequencer);
  const energy = energyTruthForIlluminate(1);
  return {
    state,
    energy,
    summary: `Kindled ${params.seal.boundLabel} (self-custody). ${formatEnergyTruth(energy)}`,
  };
}

/** Public surface — invent, don't rename. */
export const Kindling = {
  offer: kindleOffer,
  accept: kindleAccept,
  confluent: confluentSeal,
  settle: settleKindling,
  verify: verifyPresenceSeal,
  alive: sealAlive,
  ttlMs: KINDLE_TTL_MS,
} as const;
