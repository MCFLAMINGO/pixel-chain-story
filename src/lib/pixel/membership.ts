/**
 * Who may produce a pixel — as a function of history, not of gossip.
 *
 * ## The bug this replaces
 *
 * `registerSequencer` mutated a local set from gossip hellos. It was not a
 * transaction, was not carried in a block, and was not signed into consensus. Then
 * `acceptBlock` required a block's bound electable set to equal that local set
 * exactly. Two consequences, and the second is much worse than the first.
 *
 * The known one: two honest operators drift. A node that has not yet heard a peer's
 * hello rejects that peer's blocks, and the same block is valid as history while
 * invalid live. `scripts/electable-drift-selftest.ts` demonstrated it, and its own
 * closing line named the fix: *sequencer membership must be carried by the chain,
 * not by gossip.*
 *
 * The one nobody had noticed: **a stranger could produce blocks.** `acceptPixels` in
 * node.ts registered a block's *claimed* producer into the local registry **before**
 * validating the block — "learn producer before accept" — so the electable set was
 * whatever the block being validated said it should be. An attacker generated
 * keypairs until one won the lottery, and honest nodes accepted the block, minted it
 * the light reward, and added it to the electable set permanently. `verifyChain`
 * returned true afterwards. A proof of concept did it in half a second with one
 * ground keypair.
 *
 * Both are the same defect: membership was an input to validation instead of an
 * output of history.
 *
 * ## What replaces it
 *
 * The electable set at height H is a fold over the membership records committed in
 * pixels before H, seeded with the founding producer from genesis. Pure function,
 * no clock, no gossip, no local state. Two nodes with the same history compute the
 * same set, so drift is not merely fixed — it is unrepresentable. And a stranger
 * cannot enter, because entering requires a record in a block, and a record requires
 * an authorization from someone already inside.
 *
 * ## Three properties worth stating plainly
 *
 * **Possession.** A join carries a signature by the joining key, so nobody can
 * enrol an address they do not hold — including as a way to blame someone else for a
 * block.
 *
 * **Authorization.** A join also carries a signature by a member already active at
 * the height where the record is included. Entry is by invitation. In the
 * single-operator era that is the incumbent; when there are several it is any active
 * member, and tightening that to a quorum is a later, separate decision (T3.3).
 *
 * **Delay.** A record included at height H takes effect at H + `ACTIVATION_DELAY`.
 * Without it a producer could include a record and immediately be elected by the set
 * it had just changed, which hands the lottery to whoever writes the block. The delay
 * makes the set that elects a producer strictly older than the block it produces.
 *
 * ## Compatibility with the crowned chain
 *
 * Every one of the 47 pixels binds an electable set of exactly one address — the
 * founding producer — and no membership records exist. A fold seeded at genesis
 * therefore reproduces all 47 bound sets byte for byte, which is why this is a
 * tightening rather than a fork. `scripts/crowned-replay-selftest.ts` asserts it
 * against real history on every commit.
 */

import { sha512Hex, type Hex } from "./crypto";
import { MAX_BLOCK_MEMBERSHIP_RECORDS } from "./limits";
import { addressForScheme, schemeFromSignature, verifyPixel, type SchemeId } from "./scheme";

/**
 * Pixels between a membership record being included and taking effect.
 *
 * Small enough that adding an operator is not a ceremony measured in days, large
 * enough that a producer cannot be elected by a set it wrote itself.
 */
export const MEMBERSHIP_ACTIVATION_DELAY = 8;

export type SequencerRecordKind = "sequencer-join" | "sequencer-leave";

export interface SequencerRecord {
  kind: SequencerRecordKind;
  /** Address joining or leaving. */
  address: string;
  /** Master public key of `address`. Bound so the address cannot be a stranger's. */
  publicKey: Hex;
  scheme: SchemeId;
  /**
   * Height at which this record is *included*. Activation is this plus the delay.
   *
   * Bound into both signatures, so a record cannot be lifted out of one block and
   * replayed into another at a more convenient height.
   */
  includedAt: number;
  /** Signature by `publicKey` — proves the subject consented. */
  possession: string;
  /** Address of the active member that authorised this. */
  authorizedBy: string;
  /** Signature by `authorizedBy`'s key over the same claim. */
  authorization: string;
}

export class MembershipError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MembershipError";
  }
}

/** Canonical, order-stable electable set. The lottery must not depend on insertion order. */
export function canonicalMembers(addresses: readonly string[]): string[] {
  return [...new Set(addresses)].sort();
}

/** What both signatures cover. Every field that decides meaning is in here. */
export function membershipClaim(
  record: Pick<
    SequencerRecord,
    "kind" | "address" | "publicKey" | "scheme" | "includedAt" | "authorizedBy"
  >,
): string {
  return [
    "pix-membership",
    record.kind,
    record.address,
    record.publicKey,
    record.scheme,
    String(record.includedAt),
    record.authorizedBy,
  ].join("|");
}

/** Domain-separated possession message — distinct preimage from the authorization. */
export function possessionMessage(record: Parameters<typeof membershipClaim>[0]): string {
  return `pix-membership-possession|${membershipClaim(record)}`;
}

/** Domain-separated authorization message. */
export function authorizationMessage(record: Parameters<typeof membershipClaim>[0]): string {
  return `pix-membership-authorize|${membershipClaim(record)}`;
}

/**
 * Digest over a block's membership records, bound into the PoLS message.
 *
 * Returns null for an empty list so the signed message is byte-identical to what it
 * was before membership records existed. That is what lets all 47 existing light
 * proofs keep verifying — the same trick `electable` already uses with its `el=`
 * segment.
 */
export function membershipDigest(
  records: readonly SequencerRecord[] | undefined,
): Promise<string> | null {
  if (!records || records.length === 0) return null;
  const canonical = records
    .map((r) => [membershipClaim(r), r.possession, r.authorization].join("~"))
    .join("\n");
  return sha512Hex(`pix-membership-set|${canonical}`);
}

/** An active member and the key it speaks with. */
export interface MemberKey {
  publicKey: Hex;
  scheme: SchemeId;
}

/**
 * Is this record well formed and genuinely authorised?
 *
 * `activeAtInclusion` maps each address active at `record.includedAt` to the key it
 * signs with, derived from history by the caller — so this function cannot be tricked
 * by a set, or a key, that the record chose for itself.
 *
 * It has to be keys and not just addresses. The first version of this took a list of
 * addresses, checked that `authorizedBy` appeared in it, and never verified the
 * authorization signature at all — so copying the possession signature into the
 * authorization field produced a record that passed. A membership selftest caught it
 * immediately, which is the argument for writing the adversarial case before
 * believing the happy path.
 *
 * Returns a reason rather than throwing, so validation and mempool paths can each
 * present it their own way.
 */
export async function sequencerRecordProblem(
  record: SequencerRecord,
  activeAtInclusion: ReadonlyMap<string, MemberKey>,
): Promise<string | null> {
  if (record.kind !== "sequencer-join" && record.kind !== "sequencer-leave") {
    return `unknown membership record kind ${String(record.kind)}`;
  }
  if (!/^pix1[a-f0-9]{38}$/.test(record.address)) {
    return `membership record carries a malformed address ${record.address}`;
  }
  if (!Number.isInteger(record.includedAt) || record.includedAt < 0) {
    return `membership record has a non-integer includedAt ${record.includedAt}`;
  }

  // The declared scheme must match what the signature actually is. A record that
  // says one scheme and signs in another would let address derivation and signature
  // verification disagree about which key is speaking.
  const possessionScheme = schemeFromSignature(record.possession);
  if (!possessionScheme) return "membership possession signature is unreadable";
  if (possessionScheme !== record.scheme) {
    return `membership record declares ${record.scheme} but its possession signature is ${possessionScheme}`;
  }

  // Possession: the address must be the commitment to the public key that signed.
  const derived = await addressForScheme(record.publicKey, record.scheme);
  if (derived !== record.address) {
    return `membership record public key commits to ${derived}, not ${record.address}`;
  }
  if (!(await verifyPixel(possessionMessage(record), record.possession, record.publicKey))) {
    return `membership record for ${record.address} has an invalid possession signature`;
  }

  // Authorization: signed by an address already active at the height of inclusion,
  // with the key history says that address speaks with.
  const authorizer = activeAtInclusion.get(record.authorizedBy);
  if (!authorizer) {
    return (
      `membership record authorised by ${record.authorizedBy}, which is not an active ` +
      `sequencer at #${record.includedAt}`
    );
  }
  const authorizationScheme = schemeFromSignature(record.authorization);
  if (!authorizationScheme) return "membership authorization signature is unreadable";
  if (authorizationScheme !== authorizer.scheme) {
    return (
      `membership authorization is ${authorizationScheme} but ${record.authorizedBy} ` +
      `signs with ${authorizer.scheme}`
    );
  }
  if (
    !(await verifyPixel(authorizationMessage(record), record.authorization, authorizer.publicKey))
  ) {
    return `membership record for ${record.address} has an invalid authorization signature`;
  }
  // Distinct preimages mean the two signatures cannot be the same bytes, but say so
  // explicitly: substituting one for the other was the exact bug here.
  if (record.authorization === record.possession) {
    return "membership authorization must not be a copy of the possession signature";
  }
  return null;
}

/**
 * Members active at `height`, folded from history.
 *
 * `recordsAt(i)` yields the membership records committed in the pixel at index `i`,
 * and `founder` is genesis' producer. Only records whose activation height has
 * arrived are applied, so the set that elects a producer is always strictly older
 * than the block being produced.
 *
 * Deliberately takes plain functions rather than chain state: this must stay a pure
 * fold, so that `acceptBlock` and `verifyChain` cannot possibly compute it
 * differently. That asymmetry is the whole class of bug being removed.
 */
export function membersAt(params: {
  founder: string;
  height: number;
  recordsAt: (index: number) => readonly SequencerRecord[] | undefined;
}): string[] {
  const active = new Set<string>([params.founder]);
  const cutoff = params.height - MEMBERSHIP_ACTIVATION_DELAY;
  for (let i = 0; i <= cutoff; i++) {
    for (const record of params.recordsAt(i) ?? []) {
      if (record.kind === "sequencer-join") active.add(record.address);
      // The founder cannot be removed. A chain that can evict its own genesis
      // producer can be emptied, and an empty electable set is a dead chain with no
      // way back — there would be nobody left who could authorise a join.
      else if (record.address !== params.founder) active.delete(record.address);
    }
  }
  return canonicalMembers([...active]);
}

/**
 * Active members at `height`, with the key each one signs with.
 *
 * The same fold as `membersAt`, carrying keys — needed because authorizing a join
 * means *verifying a signature*, and a signature needs the authorizer's public key
 * to come from history rather than from the record asking to be let in.
 *
 * A member's key is the one in the record that admitted it; the founder's is the one
 * in genesis' light proof. Included at the same activation delay as membership itself,
 * so key and eligibility never disagree.
 */
export function memberKeysAt(params: {
  founder: string;
  founderKey: MemberKey;
  height: number;
  recordsAt: (index: number) => readonly SequencerRecord[] | undefined;
}): Map<string, MemberKey> {
  const active = new Map<string, MemberKey>([[params.founder, params.founderKey]]);
  const cutoff = params.height - MEMBERSHIP_ACTIVATION_DELAY;
  for (let i = 0; i <= cutoff; i++) {
    for (const record of params.recordsAt(i) ?? []) {
      if (record.kind === "sequencer-join") {
        active.set(record.address, { publicKey: record.publicKey, scheme: record.scheme });
      } else if (record.address !== params.founder) {
        active.delete(record.address);
      }
    }
  }
  return active;
}

/** Structural checks on a block's record list, before any signature work. */
export function membershipListProblem(
  records: readonly SequencerRecord[] | undefined,
): string | null {
  if (!records || records.length === 0) return null;
  if (records.length > MAX_BLOCK_MEMBERSHIP_RECORDS) {
    return `block carries ${records.length} membership records, over the ${MAX_BLOCK_MEMBERSHIP_RECORDS} limit`;
  }
  const seen = new Set<string>();
  for (const record of records) {
    const key = `${record.kind}|${record.address}`;
    if (seen.has(key)) {
      return `block carries the same membership record twice (${key})`;
    }
    seen.add(key);
  }
  return null;
}

/**
 * Build a signed join record.
 *
 * Both signatures are produced here, which means both keys have to be present — the
 * joiner's and an active member's. That is the ceremony, not an inconvenience: adding
 * an operator is two people agreeing, and the record is the artifact of that
 * agreement. In practice the two halves are signed on two machines and the record is
 * assembled from the parts; this helper is the single-process form used by tests and
 * by an operator who holds both keys during bootstrap.
 *
 * `includedAt` must be the height of the pixel that will carry it — it is signed, so a
 * record cannot be lifted into a more convenient block later.
 */
export async function createSequencerJoin(params: {
  joiner: { address: string; publicKey: Hex; scheme?: SchemeId };
  authorizer: { address: string };
  includedAt: number;
  sign: (message: string, who: "joiner" | "authorizer") => Promise<string>;
}): Promise<SequencerRecord> {
  const claim = {
    kind: "sequencer-join" as const,
    address: params.joiner.address,
    publicKey: params.joiner.publicKey,
    scheme: (params.joiner.scheme ?? "PIX-ML-DSA-65") as SchemeId,
    includedAt: params.includedAt,
    authorizedBy: params.authorizer.address,
  };
  return {
    ...claim,
    possession: await params.sign(possessionMessage(claim), "joiner"),
    authorization: await params.sign(authorizationMessage(claim), "authorizer"),
  };
}

/**
 * Build a signed leave record.
 *
 * Still needs possession *and* authorization. Possession so nobody can evict an
 * operator by asserting it left, authorization so a departure is recorded by the set
 * rather than announced at it. The founder cannot be removed at all — see `membersAt`.
 */
export async function createSequencerLeave(params: {
  leaver: { address: string; publicKey: Hex; scheme?: SchemeId };
  authorizer: { address: string };
  includedAt: number;
  sign: (message: string, who: "joiner" | "authorizer") => Promise<string>;
}): Promise<SequencerRecord> {
  const claim = {
    kind: "sequencer-leave" as const,
    address: params.leaver.address,
    publicKey: params.leaver.publicKey,
    scheme: (params.leaver.scheme ?? "PIX-ML-DSA-65") as SchemeId,
    includedAt: params.includedAt,
    authorizedBy: params.authorizer.address,
  };
  return {
    ...claim,
    possession: await params.sign(possessionMessage(claim), "joiner"),
    authorization: await params.sign(authorizationMessage(claim), "authorizer"),
  };
}

export function membershipThesis(): {
  rule: string;
  activationDelay: number;
  refusals: string[];
} {
  return {
    rule:
      "The electable set at a height is a fold over membership records committed before it, " +
      "seeded with genesis' producer. Membership is an output of history, never an input to " +
      "validation.",
    activationDelay: MEMBERSHIP_ACTIVATION_DELAY,
    refusals: [
      "A block cannot bring its own producer into the electable set",
      "A join needs possession by the subject AND authorization by an active member",
      "A record takes effect only after the activation delay, so no producer is elected by a set it just wrote",
      "Gossip cannot change who may produce — a hello is display metadata",
      "The founding producer cannot be evicted, so the set can never be emptied",
    ],
  };
}
