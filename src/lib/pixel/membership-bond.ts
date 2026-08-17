/**
 * Hybrid bond door — invite when the set is healthy; bond when it would go extinct.
 *
 * Gated by network id: **never** on the crowned Earth (20553). Lab / hybrid-bond
 * networks only. See docs/DURABILITY.md and SPEC §4.2.1 (draft → vectors → here).
 *
 * Security model (plain):
 * - Bond floor makes grind-keypair entry expensive (PIX, not energy).
 * - Vacancy timer T stops the door from opening while operators are merely slow.
 * - K keeps invitation as the normal path when ≥K members exist.
 * - No PoW, no Light Credits. Slash is not in this module (honesty: later).
 */

import {
  CROWNED_NETWORK_ID,
} from "./crowned-genesis";
import type { SequencerRecord } from "./membership";
import { MEMBERSHIP_ACTIVATION_DELAY, membersAt } from "./membership";

/** Dedicated network for hybrid-bond experiments — not the crowned tip. */
export const HYBRID_BOND_NETWORK_ID = 0x5042; // "PB"

/** Minimum electable size before invitation is the preferred door. */
export const BOND_DOOR_K = 2;

/** Vacancy must last this long (chain time, ms) before a bond seat opens. */
export const BOND_DOOR_T_MS = 10080 * 60 * 1000; // 7 days

/** PIX required to claim a bond seat (one light reward). Same unit as TxOutput.amount. */
export const BOND_FLOOR_PIX = 50;
/** @deprecated alias — records and locks use whole PIX, matching the UTXO ledger. */
export const BOND_FLOOR_UNITS = BOND_FLOOR_PIX;

/**
 * Unspendable lock address — coins sent here are the Sybil cost.
 * Nobody holds this key; leave/unbond recovery is a later rule.
 */
export const BOND_LOCK_ADDRESS = "pix1b01d0000000000000000000000000000000000";

export function hybridBondDoorEnabled(networkId: number): boolean {
  // Crowned Earth stays invitation-only forever under this module.
  if (networkId === CROWNED_NETWORK_ID) return false;
  return networkId === HYBRID_BOND_NETWORK_ID;
}

export interface BondDoorView {
  open: boolean;
  reason: string;
  electableCount: number;
  vacancyMs: number;
}

/**
 * Is the bond door open at `height` given history below that height?
 *
 * Uses pixel timestamps (consensus) not wall clock. Vacancy starts at the earliest
 * height where the electable set stayed below K continuously through `height`.
 */
export function bondDoorAt(params: {
  networkId: number;
  founder: string;
  height: number;
  recordsAt: (index: number) => readonly SequencerRecord[] | undefined;
  timestampAt: (index: number) => number;
  /** Timestamp of the pixel that would include a bond claim (defaults to tip). */
  atTimestamp?: number;
}): BondDoorView {
  if (!hybridBondDoorEnabled(params.networkId)) {
    return {
      open: false,
      reason: "hybrid bond door disabled on this network",
      electableCount: membersAt({
        founder: params.founder,
        height: params.height,
        recordsAt: params.recordsAt,
      }).length,
      vacancyMs: 0,
    };
  }

  const electable = membersAt({
    founder: params.founder,
    height: params.height,
    recordsAt: params.recordsAt,
  });
  if (electable.length >= BOND_DOOR_K) {
    return {
      open: false,
      reason: `electable count ${electable.length} ≥ K=${BOND_DOOR_K} — invitation path only`,
      electableCount: electable.length,
      vacancyMs: 0,
    };
  }

  // Rate limit: at most one bond-join already included in this vacancy window.
  for (let i = 0; i < params.height; i++) {
    for (const r of params.recordsAt(i) ?? []) {
      if (r.kind === "sequencer-bond-join") {
        return {
          open: false,
          reason: `a bond seat was already claimed at pixel #${i} this vacancy`,
          electableCount: electable.length,
          vacancyMs: 0,
        };
      }
    }
  }

  // Continuous vacancy: walk back while count < K.
  let start = 0;
  for (let h = params.height; h >= 0; h--) {
    const n = membersAt({
      founder: params.founder,
      height: h,
      recordsAt: params.recordsAt,
    }).length;
    if (n >= BOND_DOOR_K) {
      start = h + 1;
      break;
    }
    start = h;
  }

  const tStart = params.timestampAt(Math.max(0, start));
  const tipTs =
    params.atTimestamp ??
    (params.height <= 0 ? tStart : params.timestampAt(params.height - 1));
  const vacancyMs = Math.max(0, tipTs - tStart);

  if (vacancyMs < BOND_DOOR_T_MS) {
    return {
      open: false,
      reason: `vacancy ${vacancyMs}ms < T=${BOND_DOOR_T_MS}ms`,
      electableCount: electable.length,
      vacancyMs,
    };
  }

  return {
    open: true,
    reason: `vacancy ${vacancyMs}ms ≥ T and electable ${electable.length} < K`,
    electableCount: electable.length,
    vacancyMs,
  };
}

export function bondDoorThesis(): {
  claim: string;
  network: number;
  k: number;
  tMs: number;
  floorPix: number;
  refusals: string[];
} {
  return {
    claim:
      "Invitation while ≥K operators; one PIX-bond seat when the set stays below K for T. " +
      "Never on crowned network 20553. No PoW. No Credits.",
    network: HYBRID_BOND_NETWORK_ID,
    k: BOND_DOOR_K,
    tMs: BOND_DOOR_T_MS,
    floorPix: BOND_FLOOR_PIX,
    refusals: [
      "Crowned Earth cannot open the bond door",
      "Bond floor below 50 PIX is refused",
      "PoW and Light-Credits seats do not exist",
      "A second bond claim in the same vacancy is refused",
    ],
  };
}

/** Domain tag for the joiner's second signature on a bond claim (not an invite auth). */
export function bondAuthorizationMessage(
  record: Pick<
    SequencerRecord,
    "kind" | "address" | "publicKey" | "scheme" | "includedAt" | "bondUnits"
  >,
): string {
  return [
    "pix-membership-bond",
    record.kind,
    record.address,
    record.publicKey,
    record.scheme,
    String(record.includedAt),
    String(record.bondUnits ?? 0),
    BOND_LOCK_ADDRESS,
  ].join("|");
}

/**
 * True when this pixel's transactions lock ≥ bondUnits from `joiner` into the
 * unspendable bond lock address.
 */
export function bondLockPaidInTxs(params: {
  txs: readonly Array<{
    inputs: readonly Array<{ txid: string; vout: number }>;
    outputs: readonly Array<{ address: string; amount: number }>;
  }>;
  utxoOwner: (txid: string, vout: number) => string | undefined;
  joiner: string;
  bondUnits: number;
}): boolean {
  let paid = 0;
  for (const tx of params.txs) {
    const fromJoiner = tx.inputs.some((inp) => params.utxoOwner(inp.txid, inp.vout) === params.joiner);
    if (!fromJoiner) continue;
    for (const out of tx.outputs) {
      if (out.address === BOND_LOCK_ADDRESS) paid += out.amount;
    }
  }
  return paid >= params.bondUnits;
}

export { MEMBERSHIP_ACTIVATION_DELAY };
