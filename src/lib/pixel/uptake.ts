/**
 * Uptake ladder — invention at the core, old doors only as on-ramps.
 *
 * Primitive channels (SMS, USSD, voice) exist so a peasant with a feature phone
 * can *enter*. They never become the settlement engine.
 *
 * Advanced core (Kindling → PoLS → Energy Truth) is the intergalactic stack:
 * light, not warehouses of GPUs drinking rivers.
 *
 *   Feature phone ──invite──► Kindling pillar ──seal──► Pixel illuminate
 *   Co-op helper  ──aim───► same Kindling
 *   Deep-space node ────────► same PoLS verify (same math, no datacenter tax)
 */

import type { AccessResult } from "./access";
import type { KindleIntent } from "./kindling";

export type UptakeTier =
  | "signal" // SMS/USSD/voice — read + invite only
  | "presence" // Kindling / Light Pillar — spend authority
  | "sovereign"; // own keys + optical + node — full Source

export interface UptakeStep {
  tier: UptakeTier;
  name: string;
  canSpend: boolean;
  role: string;
}

/** Ordered ladder — climb toward presence; do not settle on the bottom rung. */
export const UPTAKE_LADDER: readonly UptakeStep[] = [
  {
    tier: "signal",
    name: "Signal bridge",
    canSpend: false,
    role: "Balance, status, Kindling invite — uptake only; never holds Source",
  },
  {
    tier: "presence",
    name: "Kindling presence",
    canSpend: true,
    role: "Two lights meet — your Personal Source signs; pillar only aims cameras",
  },
  {
    tier: "sovereign",
    name: "Sovereign light",
    canSpend: true,
    role: "Optical vault + own node anywhere — including off-world; still self-custody",
  },
] as const;

/** Turn an access kindlingInvite into a Kindling intent (bridge → invention). */
export function inviteToKindleIntent(result: AccessResult): KindleIntent | null {
  const inv = result.kindlingInvite;
  if (!inv) return null;
  return {
    fromLocal: inv.fromLocalId,
    toLocal: inv.toLocalId,
    amount: inv.amount,
    note: inv.note,
  };
}

export function tierForChannel(channel: string): UptakeTier {
  if (channel === "kindling" || channel === "paper_optical" || channel === "light_pillar") {
    return "presence";
  }
  if (channel === "smartphone" || channel === "shared_phone") return "presence";
  return "signal";
}

export const Uptake = {
  ladder: UPTAKE_LADDER,
  inviteToKindle: inviteToKindleIntent,
  tierForChannel,
} as const;
