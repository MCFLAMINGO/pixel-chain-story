/**
 * Pixel Chain — Bitcoin-like UTXO ledger with Proof of Light Sequence.
 * Looking at all transactions paints a picture of pixels; each block is one pixel.
 */

import { otsUsageKey, parseOtsLeafIndex, sha512Hex, type Hex, type LightKeypair } from "./crypto";
import { ABSENT_COLOR, composePixelColor, revealProximity, type PixelColor } from "./light-color";
import {
  createLightProof,
  merkleRoot,
  POLS_MAX_FUTURE_DRIFT_MS,
  POLS_MAX_SKIP,
  POLS_STALL_MS,
  preferPixel,
  proofBindingProblem,
  selectSequencerWithSkip,
  verifyLightProof,
  type LightProof,
} from "./pol";
import {
  assertFieldWitnessesBodyMatch,
  assertFieldWitnessesMatch,
  buildFieldWitnesses,
  computeFieldDigest,
  priorFieldColors,
  type FieldWitness,
} from "./field-witness";
import {
  assertWaveDigestMatch,
  assertWaveHitsBodyMatch,
  computeTipWaveField,
  type WaveHit,
} from "./wave";
import { assertSpatialRootMatch, buildSpatialPicture } from "./spatial-picture";
import { opticalBeacon } from "./optical";
import { assertUnderCap, lightReward, mintedThrough } from "./economics";
import { MAX_BLOCK_TX_BYTES, MAX_BLOCK_TXS, MAX_METADATA_BYTES } from "./limits";
import {
  canonicalMembers,
  memberKeysAt,
  membersAt,
  membershipDigest,
  membershipListProblem,
  sequencerRecordProblem,
  type SequencerRecord,
} from "./membership";
import { assertMomentAllowed, giftAndRecordEnabled } from "./gift-and-record";
import {
  createTransaction,
  finalizeTransaction,
  revealTransaction,
  signTransaction,
  txIdentityProblem,
  verifyTransactionSignaturesForOwners,
  type ReadableMeta,
  type SignaturePolicy,
  type SignatureVerifier,
  type Transaction,
  type TxOutput,
  type Utxo,
} from "./transaction";
import { assertSovereignIfLive, type NodeProvider } from "./sovereignty";
import type { SchemeId } from "./scheme";
import { signaturePolicyAtHeight } from "./sig-era";

export interface LedgerPixel {
  index: number;
  prevHash: Hex;
  merkleRoot: Hex;
  sequence: number;
  lightProof: LightProof;
  transactions: Transaction[];
  timestamp: number;
  hash: Hex;
  /** Present only because light revealed this block. Absent ⇒ void. */
  color: PixelColor;
  illuminated: boolean;
  /** Neighbor indices disclosed by this block's light cone. */
  proximity: number[];
  /** Sphere combination lock witnesses (peer field); digest bound in lightProof. */
  field: FieldWitness[];
  /** Lead wave hits (lattice multi-hop); digest bound in lightProof.waveDigest. */
  wave?: WaveHit[];
  /**
   * Sequencer membership changes committed by this pixel (T1.1).
   *
   * Absent or empty on every pixel of the crowned chain, which is why introducing
   * the field forks nothing: `membershipDigest` returns null for an empty list, so
   * the PoLS preimage is byte-identical to what it was.
   */
  membership?: SequencerRecord[];
}

/** Public sequencer identity — safe to gossip / persist. */
export interface SequencerId {
  address: string;
  publicKey: Hex;
}

export interface PixelChainState {
  pixels: LedgerPixel[];
  utxos: Map<string, Utxo>;
  pending: Transaction[];
  sequencers: SequencerId[];
  networkId: number;
  /**
   * Optional provider registry for sovereignty checks.
   * When length ≥ SOVEREIGNTY_POLICY.minProviders, diversity is enforced
   * on registry updates. Absent in single-node prototypes.
   */
  providers?: NodeProvider[];
  /** Wall time when pending first became non-empty — Gate C stall anchor. */
  pendingSince?: number;
  /**
   * UTXO keys consumed by pending (unconfirmed) transactions.
   *
   * `utxos` stays the **confirmed** set so block validation can check input
   * existence; spendable views subtract these so a pending spend is not
   * selected twice.
   */
  reservedInputs?: Set<string>;
  /**
   * OTS one-time leaf usages: `${publicKey}:${leafIndex}`.
   * Consensus rejects reuse (Lamport forgery class). ML-DSA leaves no entry.
   */
  usedOtsLeaves: Set<string>;
}

export class OtsLeafReuseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OtsLeafReuseError";
  }
}

/** Collect OTS (publicKey, leafIndex) usages from txs + optional PoLS proof. */
export function collectOtsUsages(
  txs: Transaction[],
  lightProof?: LightProof,
): Array<{ publicKey: Hex; leafIndex: number; source: string }> {
  const out: Array<{ publicKey: Hex; leafIndex: number; source: string }> = [];
  for (const tx of txs) {
    // signTransaction attaches one OTS leaf to every input of a tx — count once per tx.
    const seenInTx = new Set<string>();
    for (const input of tx.inputs) {
      if (!input.signature || !input.publicKey) continue;
      const leaf = parseOtsLeafIndex(input.signature);
      if (leaf === null) continue;
      const key = otsUsageKey(input.publicKey, leaf);
      if (seenInTx.has(key)) continue;
      seenInTx.add(key);
      out.push({
        publicKey: input.publicKey,
        leafIndex: leaf,
        source: `tx:${tx.txid.slice(0, 12)}`,
      });
    }
  }
  if (lightProof?.signature) {
    const leaf = parseOtsLeafIndex(lightProof.signature);
    if (leaf !== null) {
      out.push({
        publicKey: lightProof.sequencerPublicKey,
        leafIndex: leaf,
        source: `pols:${lightProof.sequence}`,
      });
    }
  }
  return out;
}

/**
 * Reject if any usage collides with prior set or within the batch.
 * Returns the merged set (copy) — does not mutate `prior`.
 */
export function assertAndMergeOtsLeaves(
  prior: Set<string>,
  usages: Array<{ publicKey: Hex; leafIndex: number; source: string }>,
): Set<string> {
  const next = new Set(prior ?? []);
  const batch = new Set<string>();
  for (const u of usages) {
    const key = otsUsageKey(u.publicKey, u.leafIndex);
    if (next.has(key) || batch.has(key)) {
      throw new OtsLeafReuseError(
        `OTS_LEAF_REUSED: leaf ${u.leafIndex} for ${u.publicKey.slice(0, 16)}… (${u.source})`,
      );
    }
    batch.add(key);
  }
  for (const k of batch) next.add(k);
  return next;
}

/** Rebuild used-leaf set by replaying pixels in order (join / deserialize). */
export function rebuildUsedOtsLeaves(pixels: LedgerPixel[]): Set<string> {
  let used = new Set<string>();
  for (const pixel of pixels) {
    const usages = collectOtsUsages(pixel.transactions, pixel.lightProof);
    used = assertAndMergeOtsLeaves(used, usages);
  }
  return used;
}

/**
 * Advance a local OTS cursor past leaves already spent on-chain.
 * Stale wallets (copied before genesis / prior signs) self-heal against the ledger.
 */
export function advancePastUsedOtsLeaves(keypair: LightKeypair, used: Set<string>): void {
  if (keypair.scheme === "PIX-ML-DSA-65") return;
  while (
    keypair.nextLeaf < keypair.leafCount &&
    used.has(otsUsageKey(keypair.publicKey, keypair.nextLeaf))
  ) {
    keypair.nextLeaf += 1;
  }
}

/**
 * Canonical UTXO key. Exported because the mempool has to ask the same question
 * consensus asks — "does this input exist?" — and a second encoding of the same
 * answer is how the two paths drift apart.
 */
export function utxoKey(txid: string, vout: number): string {
  return `${txid}:${vout}`;
}

async function colorFromLight(scene: {
  index: number;
  hash: Hex;
  prevHash: Hex;
  merkleRoot: Hex;
  beacon: Hex;
  sequence: number;
  timestamp: number;
  transactions: Transaction[];
  /** If provided (verify path), reuse stored cone for consensus stability. */
  proximity?: number[];
}): Promise<{ color: PixelColor; proximity: number[] }> {
  // Color exists only under light. On-chain blocks are illuminated by PoLS.
  const proximity = scene.proximity ?? revealProximity(scene.index, 2);
  const { color } = await composePixelColor({
    index: scene.index,
    hash: scene.hash,
    prevHash: scene.prevHash,
    merkleRoot: scene.merkleRoot,
    beacon: scene.beacon,
    sequence: scene.sequence,
    timestamp: scene.timestamp,
    transactions: scene.transactions,
    illuminated: true,
    litNeighbors: proximity,
  });
  return { color, proximity };
}

/** Superposition / unlit placeholder — proximity hidden, color absent. */
export function unlitPixel(): { color: PixelColor; illuminated: false; proximity: [] } {
  return { color: { ...ABSENT_COLOR }, illuminated: false, proximity: [] };
}

async function hashBlock(header: {
  index: number;
  prevHash: Hex;
  merkleRoot: Hex;
  sequence: number;
  timestamp: number;
  beacon: Hex;
}): Promise<Hex> {
  return sha512Hex(
    `block|${header.index}|${header.prevHash}|${header.merkleRoot}|${header.sequence}|${header.timestamp}|${header.beacon}`,
  );
}

/**
 * The crowned network. One Earth lives here: genesis f1d193f62d54e982.
 *
 * Bitcoin's genesis is a constant in the client and nothing else may run on
 * mainnet. This is the first half of that: a lab, selftest or demo chain gets a
 * different id, so it cannot claim to be the public picture even by accident.
 * `canvas-id.ts` had to warn that a matching family id is not the same chain
 * precisely because everything used to share this one.
 */
export const PIXEL_NETWORK_ID = 0x5049; // "PI"

/**
 * Everything that is not the crowned Earth — tests, demos, a laptop exploring.
 *
 * Default for `createGenesis`, so forging without saying which network you mean
 * produces a lab chain rather than a rival to the public one. Claiming the
 * crowned id has to be deliberate.
 */
export const PIXEL_LAB_NETWORK_ID = 0x504c; // "PL"

export async function createGenesis(
  sequencer: LightKeypair,
  networkId = PIXEL_LAB_NETWORK_ID,
): Promise<PixelChainState> {
  const genesisReward = lightReward(0);
  assertUnderCap(0, genesisReward);
  const mint = await createTransaction({
    inputs: [],
    outputs: [{ amount: genesisReward, address: sequencer.address }],
    metadata: {
      description: "Genesis light — first illumination (21M PIX hard cap)",
      reference: "GENESIS",
    },
  });
  const revealed = finalizeTransaction(revealTransaction(mint, 0));
  const prevHash = "0".repeat(128);
  const root = await merkleRoot([revealed.txid]);
  const field = buildFieldWitnesses(0, []);
  const fieldDigest = computeFieldDigest(field);
  const waveField = computeTipWaveField({
    tipIndex: 0,
    sequence: 0,
    prevHash,
    merkleRoot: root,
    priorTipHashes: [],
  });
  const timestamp = Date.now();
  const beacon = await opticalBeacon(0, prevHash);
  const hash = await hashBlock({
    index: 0,
    prevHash,
    merkleRoot: root,
    sequence: 0,
    timestamp,
    beacon,
  });
  const { color, proximity } = await colorFromLight({
    index: 0,
    hash,
    prevHash,
    merkleRoot: root,
    beacon,
    sequence: 0,
    timestamp,
    transactions: [revealed],
  });
  const picture = await buildSpatialPicture([{ index: 0, illuminated: true, color }]);
  const proof = await createLightProof({
    sequence: 0,
    prevHash,
    sequencer,
    electable: [sequencer.address],
    fieldDigest,
    waveDigest: waveField.waveDigest as Hex,
    spatialRoot: picture.spatialRoot,
  });
  if (proof.beacon !== beacon) throw new Error("genesis beacon drift");
  const genesis: LedgerPixel = {
    index: 0,
    prevHash,
    merkleRoot: root,
    sequence: 0,
    lightProof: proof,
    transactions: [revealed],
    timestamp,
    hash,
    color,
    illuminated: true,
    proximity,
    field,
    wave: waveField.hits,
  };

  const { utxos } = await validateAndApplyBlockTxs({
    utxos: new Map<string, Utxo>(),
    txs: [revealed],
    index: 0,
    sequence: 0,
  });

  const usedOtsLeaves = assertAndMergeOtsLeaves(new Set(), collectOtsUsages([revealed], proof));

  return {
    pixels: [genesis],
    utxos,
    pending: [],
    sequencers: [{ address: sequencer.address, publicKey: sequencer.publicKey }],
    networkId,
    usedOtsLeaves,
  };
}

/**
 * Note a sequencer's public key for display and hello bookkeeping.
 *
 * **This confers no authority.** It used to: `state.sequencers` was the electable
 * set, gossip could add to it, and `acceptPixels` added a block's claimed producer
 * to it before validating that block. Membership is now folded from chain history
 * (`electableAt`), and validation never reads this map, so a hello — or a hostile
 * block — cannot change who may produce a pixel.
 *
 * Kept under the old name as an alias below, because a great deal of test and demo
 * code calls it to mean "this node wants turns", which on a lab chain it forges
 * itself still works: a lab genesis makes its own producer the founder.
 */
export function noteSequencerKey(
  state: PixelChainState,
  sequencer: Pick<LightKeypair, "address" | "publicKey">,
): PixelChainState {
  if (state.sequencers.some((s) => s.address === sequencer.address)) return state;
  return {
    ...state,
    sequencers: [
      ...state.sequencers,
      { address: sequencer.address, publicKey: sequencer.publicKey },
    ],
  };
}

/**
 * Historical name for `noteSequencerKey`.
 *
 * Retained because the name appears throughout tests and demos, but it no longer
 * registers anything in the consensus sense — see the note above. Renaming every
 * caller would be a large diff that hides the one line that mattered.
 */
export const registerSequencer = noteSequencerKey;

/** Attach / replace provider registry; enforces diversity when set is live (≥7). */
export function setProviderRegistry(
  state: PixelChainState,
  providers: NodeProvider[],
): PixelChainState {
  assertSovereignIfLive(providers);
  return { ...state, providers: [...providers] };
}

/** Register sequencer and optional provider row together. */
export function registerSequencerWithProvider(
  state: PixelChainState,
  sequencer: Pick<LightKeypair, "address" | "publicKey">,
  provider: NodeProvider,
): PixelChainState {
  const withSeq = registerSequencer(state, sequencer);
  const providers = [
    ...(withSeq.providers ?? []).filter((p) => p.address !== provider.address),
    provider,
  ];
  return setProviderRegistry(withSeq, providers);
}

/** Reservation set implied by a pending list. */
function reservationsFor(pending: Transaction[]): Set<string> {
  const keys = new Set<string>();
  for (const tx of pending) {
    for (const input of tx.inputs) keys.add(utxoKey(input.txid, input.vout));
  }
  return keys;
}

/** Keys reserved by pending txs — not spendable, though still confirmed. */
function reservedKeys(state: PixelChainState): Set<string> {
  if (state.reservedInputs && state.reservedInputs.size > 0) return state.reservedInputs;
  const keys = new Set<string>();
  for (const tx of state.pending ?? []) {
    for (const input of tx.inputs) keys.add(utxoKey(input.txid, input.vout));
  }
  return keys;
}

export function balanceOf(state: PixelChainState, address: string): number {
  const reserved = reservedKeys(state);
  let sum = 0;
  for (const [key, utxo] of state.utxos) {
    if (utxo.address === address && !reserved.has(key)) sum += utxo.amount;
  }
  return sum;
}

export function utxosFor(state: PixelChainState, address: string): Utxo[] {
  const reserved = reservedKeys(state);
  return [...state.utxos.entries()]
    .filter(([key, u]) => u.address === address && !reserved.has(key))
    .map(([, u]) => u);
}

export async function proposeTransfer(
  state: PixelChainState,
  from: LightKeypair,
  outputs: TxOutput[],
  metadata: ReadableMeta,
): Promise<{ state: PixelChainState; tx: Transaction }> {
  const needed = outputs.reduce((s, o) => s + o.amount, 0);
  const available = utxosFor(state, from.address);
  const selected: Utxo[] = [];
  let total = 0;
  for (const u of available) {
    selected.push(u);
    total += u.amount;
    if (total >= needed) break;
  }
  if (total < needed) {
    throw new Error(`Insufficient balance: need ${needed}, have ${balanceOf(state, from.address)}`);
  }

  const change = total - needed;
  const allOutputs = [...outputs];
  if (change > 0) {
    allOutputs.push({ amount: change, address: from.address });
  }

  let tx = await createTransaction({
    inputs: selected.map((u) => ({ txid: u.txid, vout: u.vout })),
    outputs: allOutputs,
    metadata,
  });
  // Ledger is source of truth — skip leaves already on-chain or in mempool.
  const reserved = assertAndMergeOtsLeaves(state.usedOtsLeaves, collectOtsUsages(state.pending));
  advancePastUsedOtsLeaves(from, reserved);
  tx = await signTransaction(tx, from);

  // Reserve (do not delete) so the confirmed set still proves input existence.
  const reservedInputs = new Set(reservedKeys(state));
  for (const u of selected) {
    reservedInputs.add(utxoKey(u.txid, u.vout));
  }

  return {
    state: {
      ...state,
      reservedInputs,
      pending: [...state.pending, tx],
      pendingSince: state.pending.length === 0 ? Date.now() : (state.pendingSince ?? Date.now()),
    },
    tx,
  };
}

/**
 * Canonical electable set — sorted, de-duplicated.
 *
 * The lottery must not depend on ordering, and a producer must not be able to
 * choose the set it is elected from (PIX-04).
 */
export function canonicalElectable(addresses: string[]): string[] {
  return canonicalMembers(addresses);
}

/** Genesis' producer — the seed of every membership fold, and never evictable. */
export function founderOf(state: PixelChainState): string {
  const genesis = state.pixels[0];
  if (!genesis) throw new Error("Cannot derive membership without a genesis pixel");
  return genesis.lightProof.sequencerAddress;
}

/**
 * Who may produce the pixel at `height` — folded from history alone.
 *
 * This used to read `state.sequencers`, a set that gossip could mutate and that
 * `acceptPixels` populated from the very block being validated. That made membership
 * an input to validation, which is what let a stranger with one ground keypair
 * extend the tip and mint the light reward. Now it is an output of history: the same
 * pixels always produce the same answer, on every node, forever.
 *
 * `state.sequencers` survives as a public-key lookup for display and hello
 * bookkeeping. It has no authority and validation never consults it.
 */
export function electableAt(state: PixelChainState, height: number): string[] {
  return membersAt({
    founder: founderOf(state),
    height,
    recordsAt: (index) => state.pixels[index]?.membership,
  });
}

/**
 * The key genesis' producer signs with — the seed of the key fold.
 *
 * Read from the genesis light proof rather than from any registry, for the same
 * reason the address is: a key that validation trusts must come from history.
 */
export function founderKeyOf(pixels: LedgerPixel[]): { publicKey: Hex; scheme: SchemeId } {
  const genesis = pixels[0];
  if (!genesis) throw new Error("Cannot derive membership without a genesis pixel");
  return {
    publicKey: genesis.lightProof.sequencerPublicKey,
    scheme: (genesis.lightProof.scheme ?? "PIX-HASH-OTS-128") as SchemeId,
  };
}

/**
 * Active members at `height` with the key each signs with.
 *
 * Authorizing a join means verifying a signature, and the authorizer's public key has
 * to come from history — not from the record asking to be admitted. Folded from the
 * same pixels and the same activation delay as membership itself, so a member's key
 * and its eligibility can never disagree.
 */
export function electableKeysFromPixels(pixels: LedgerPixel[], height: number) {
  const genesis = pixels[0];
  if (!genesis) return new Map();
  return memberKeysAt({
    founder: genesis.lightProof.sequencerAddress,
    founderKey: founderKeyOf(pixels),
    height,
    recordsAt: (index) => pixels[index]?.membership,
  });
}

export function electableKeysAt(state: PixelChainState, height: number) {
  return electableKeysFromPixels(state.pixels, height);
}

/**
 * Electable set for the *next* pixel. Kept for callers that mean "right now".
 */
export function derivedElectable(state: PixelChainState): string[] {
  const tip = state.pixels[state.pixels.length - 1];
  return electableAt(state, (tip?.index ?? -1) + 1);
}

/** Who should sequence next — deterministic from tip hash (+ optional Gate C skip). */
export function nextSequencerAddress(state: PixelChainState, skipCount = 0): string {
  const tip = state.pixels[state.pixels.length - 1];
  return selectSequencerWithSkip(tip.hash, tip.sequence + 1, derivedElectable(state), skipCount);
}

/**
 * Stall anchor for skip justification — the parent block's timestamp.
 *
 * Node-local `pendingSince` is not consensus data: two honest peers could
 * disagree on whether a skip was legitimate (PIX-14).
 */
export function stallAnchorMs(state: PixelChainState): number {
  const tip = state.pixels[state.pixels.length - 1];
  return tip?.timestamp ?? 0;
}

/** Smallest skipCount at which `address` is elected, or null if none within max. */
export function skipCountForAddress(state: PixelChainState, address: string): number | null {
  for (let skip = 0; skip <= POLS_MAX_SKIP; skip++) {
    if (nextSequencerAddress(state, skip) === address) return skip;
  }
  return null;
}

export class BlockValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BlockValidationError";
  }
}

function creditOutputs(working: Map<string, Utxo>, tx: Transaction): void {
  tx.outputs.forEach((out, vout) => {
    working.set(utxoKey(tx.txid, vout), {
      txid: tx.txid,
      vout,
      amount: out.amount,
      address: out.address,
    });
  });
}

/** Every output must be a positive safe integer; returns the total. */
export function outputTotalOf(tx: Transaction): number {
  let total = 0;
  for (const out of tx.outputs) {
    if (!Number.isSafeInteger(out.amount) || out.amount <= 0) {
      throw new BlockValidationError(
        `Output amount must be a positive integer (tx ${tx.txid.slice(0, 12)}…, got ${out.amount})`,
      );
    }
    total += out.amount;
  }
  if (!Number.isSafeInteger(total)) {
    throw new BlockValidationError(`Output total overflows safe integers (${total})`);
  }
  return total;
}

/**
 * Validate one spending transaction against `working` and apply it.
 *
 * Enforces (PIX-01/PIX-03): the signing key owns each input, every input still
 * exists (so a second reference anywhere in the block fails), no input is
 * repeated inside the transaction, and value is conserved. Returns the fee.
 * Mutates `working` only on success.
 */
async function applySpendTx(
  working: Map<string, Utxo>,
  tx: Transaction,
  policy?: SignaturePolicy,
): Promise<number> {
  const outputTotal = outputTotalOf(tx);
  const seen = new Set<string>();
  let inputTotal = 0;

  for (const input of tx.inputs) {
    const key = utxoKey(input.txid, input.vout);
    if (seen.has(key)) {
      throw new BlockValidationError(`Input ${key} referenced twice in ${tx.txid.slice(0, 12)}…`);
    }
    seen.add(key);
    const utxo = working.get(key);
    if (!utxo) {
      throw new BlockValidationError(`Input ${key} does not exist or is already spent`);
    }
    inputTotal += utxo.amount;
  }

  const authorized = await verifyTransactionSignaturesForOwners(
    tx,
    (txid, vout) => working.get(utxoKey(txid, vout))?.address,
    policy,
  );
  if (!authorized) {
    throw new BlockValidationError(
      `Unauthorized spend in ${tx.txid.slice(0, 12)}… — signing key is not the UTXO owner`,
    );
  }

  if (outputTotal > inputTotal) {
    throw new BlockValidationError(
      `Value not conserved in ${tx.txid.slice(0, 12)}… (outputs ${outputTotal} > inputs ${inputTotal})`,
    );
  }

  for (const key of seen) working.delete(key);
  creditOutputs(working, tx);
  return inputTotal - outputTotal;
}

/**
 * Single monetary + authorization gate for a block's transaction set.
 *
 * Called by `sequenceBlock` (produce), `acceptBlock` (accept), `createGenesis`
 * and `verifyChain` (replay) so the produce and accept paths cannot drift —
 * that asymmetry was PIX-02.
 */
export async function validateAndApplyBlockTxs(params: {
  utxos: Map<string, Utxo>;
  txs: Transaction[];
  index: number;
  /**
   * PoLS sequence of the pixel these transactions belong to.
   *
   * Needed so `lightSequence` can be checked against the block that carries it.
   * Optional for callers that predate the check; when omitted the check is skipped
   * rather than guessed, because guessing here would invent a rule.
   */
  sequence?: number;
  /**
   * Signature rules to apply. Omitted ⇒ current rules, which is right for every
   * produce path and for `acceptBlock` (a new block is always current-era).
   * `verifyChain` passes an era-aware policy because it replays history that
   * predates PIX-10/PIX-16 — see `sig-era.ts`.
   */
  policy?: SignaturePolicy;
}): Promise<{ utxos: Map<string, Utxo>; fees: number; coinbaseTotal: number }> {
  const { txs, index } = params;
  if (txs.length === 0) throw new BlockValidationError("Block carries no transactions");

  // Bounds first, before a single signature is verified. The ordering is the
  // defence: an oversized block must cost a length comparison, not thousands of
  // lattice operations under the chain lock. A count alone does not bound the work,
  // so bytes are checked too — 4,096 transactions each carrying maximal metadata is
  // still a large object to hash.
  if (txs.length > MAX_BLOCK_TXS) {
    throw new BlockValidationError(
      `Block carries ${txs.length} transactions, over the ${MAX_BLOCK_TXS} limit`,
    );
  }
  const txBytes = JSON.stringify(txs).length;
  if (txBytes > MAX_BLOCK_TX_BYTES) {
    throw new BlockValidationError(
      `Block transaction set is ${txBytes} bytes, over the ${MAX_BLOCK_TX_BYTES} limit`,
    );
  }
  for (const tx of txs) {
    const metadataBytes = JSON.stringify(tx.metadata ?? {}).length;
    if (metadataBytes > MAX_METADATA_BYTES) {
      throw new BlockValidationError(
        `Transaction ${tx.txid.slice(0, 12)}… carries ${metadataBytes} bytes of metadata, ` +
          `over the ${MAX_METADATA_BYTES} limit`,
      );
    }
  }

  const coinbaseCount = txs.filter((t) => t.inputs.length === 0).length;
  if (coinbaseCount !== 1) {
    throw new BlockValidationError(`Block must carry exactly one coinbase (got ${coinbaseCount})`);
  }
  if (txs[0]!.inputs.length !== 0) {
    throw new BlockValidationError("Coinbase must be the first transaction in the block");
  }

  const working = new Map(params.utxos);
  let fees = 0;
  let coinbaseTotal = 0;

  for (const tx of txs) {
    // Identity: a transaction's txid and commitment must derive from its own body.
    //
    // Nothing checked this. The merkle root committed to whatever txid a transaction
    // claimed and the UTXO set was keyed under it, so a producer could put a
    // transaction with txid X and body Y into a block and no rule anywhere tied X to
    // Y. A receiver computing the txid it expected would disagree with the chain
    // about what had happened to its money.
    const identity = await txIdentityProblem(tx);
    if (identity) {
      throw new BlockValidationError(`Transaction identity does not match content: ${identity}`);
    }

    // Lifecycle: on-chain means light has already revealed it. `verifyChain` required
    // this and `acceptBlock` did not, so a block could be accepted live and then fail
    // as history — the produce/accept/replay asymmetry this gate exists to remove.
    if (tx.state !== "final" && tx.state !== "revealed") {
      throw new BlockValidationError(
        `Transaction ${tx.txid.slice(0, 12)}… is ${tx.state}; a pixel only carries revealed light`,
      );
    }

    // `lightSequence` records which sequence revealed it, so it must be this one. It
    // was unbound, letting a transaction claim it was revealed somewhere it was not.
    if (
      params.sequence != null &&
      tx.lightSequence != null &&
      tx.lightSequence !== params.sequence
    ) {
      throw new BlockValidationError(
        `Transaction ${tx.txid.slice(0, 12)}… claims lightSequence ${tx.lightSequence}, ` +
          `but this pixel is sequence ${params.sequence}`,
      );
    }
  }

  for (const tx of txs) {
    if (tx.inputs.length === 0) {
      coinbaseTotal = outputTotalOf(tx);
      creditOutputs(working, tx);
    } else {
      fees += await applySpendTx(working, tx, params.policy);
    }
  }

  const reward = lightReward(index);
  if (coinbaseTotal !== reward + fees) {
    throw new BlockValidationError(
      `Coinbase must equal light reward + fees at #${index} (got ${coinbaseTotal}, expected ${reward + fees})`,
    );
  }
  assertUnderCap(mintedThrough(index), coinbaseTotal);

  return { utxos: working, fees, coinbaseTotal };
}

/**
 * Pick the pending transactions that are still spendable against `utxos`.
 * Producers drop the rest instead of aborting, so one poisoned mempool entry
 * cannot stall the tip.
 */
async function selectSpendableTxs(
  utxos: Map<string, Utxo>,
  txs: Transaction[],
  /**
   * History, for the gift-and-record rules — they ask questions a UTXO set cannot
   * answer, such as whether this pair has exchanged a gift before. Omitted by
   * callers that only need spendability.
   */
  history?: PixelChainState,
): Promise<{
  accepted: Transaction[];
  rejected: Array<{ txid: string; reason: string }>;
  fees: number;
}> {
  const working = new Map(utxos);
  const accepted: Transaction[] = [];
  const rejected: Array<{ txid: string; reason: string }> = [];
  let fees = 0;
  const enforceMoments = history && giftAndRecordEnabled();
  for (const tx of txs) {
    try {
      // Rules before spendability: a moment that breaks them must not reach a block
      // even when the money would have moved cleanly.
      if (enforceMoments) await assertMomentAllowed(history, tx);
      fees += await applySpendTx(working, tx);
      accepted.push(tx);
    } catch (err) {
      rejected.push({
        txid: tx.txid,
        reason: err instanceof Error ? err.message : String(err),
      });
    }
  }
  return { accepted, rejected, fees };
}

/**
 * Replay-only application for already-validated history (join / deserialize).
 * Throws on a missing input instead of silently no-op deleting (PIX-03).
 */
function applyTxUtxos(utxos: Map<string, Utxo>, txs: Transaction[]): Map<string, Utxo> {
  const next = new Map(utxos);
  for (const tx of txs) {
    for (const input of tx.inputs) {
      const key = utxoKey(input.txid, input.vout);
      if (!next.delete(key)) {
        throw new BlockValidationError(`Replay hit a missing input ${key}`);
      }
    }
    creditOutputs(next, tx);
  }
  return next;
}

export interface SequenceOpts {
  /** Gate C — how many elected sequencers to skip (0 = on-time). */
  skipCount?: number;
  /** Injected clock for tests. */
  now?: number;
  /**
   * Sequencer membership changes to commit in this pixel (T1.1).
   *
   * Validated here on the produce side with the same function the accept side uses,
   * so a producer cannot build a block that only it considers valid. They take effect
   * `MEMBERSHIP_ACTIVATION_DELAY` pixels later, so including a record never changes
   * the set that elected this block's producer.
   */
  membership?: SequencerRecord[];
}

/** Shine light locally: elected sequencer (or skip-elected after stall) may produce. */
export async function sequenceBlock(
  state: PixelChainState,
  localSequencer: LightKeypair,
  opts: SequenceOpts = {},
): Promise<PixelChainState> {
  if (state.pending.length === 0) {
    throw new Error("Nothing in superposition to reveal");
  }

  const skipCount = opts.skipCount ?? 0;
  const now = opts.now ?? Date.now();
  const tip = state.pixels[state.pixels.length - 1];
  const sequence = tip.sequence + 1;
  const nextHeight = tip.index + 1;
  // Same fold the accept path uses, at the same height. Produce and accept sharing
  // one source is the point: the old code read a gossip-mutable registry here and
  // compared against it there, which is how one block became valid on one node and
  // invalid on another.
  const addresses = electableAt(state, nextHeight);
  const chosen = selectSequencerWithSkip(tip.hash, sequence, addresses, skipCount);
  if (localSequencer.address !== chosen) {
    throw new Error(`Not this node's turn to sequence (need ${chosen}, skip=${skipCount})`);
  }
  // Timestamps must advance so peers agree on the stall window (PIX-14).
  const timestamp = Math.max(now, tip.timestamp + 1);
  if (skipCount > 0 && timestamp < tip.timestamp + POLS_STALL_MS) {
    throw new Error(`Skip not justified yet — stall ${POLS_STALL_MS}ms required (Gate C)`);
  }

  const nextIndex = tip.index + 1;
  const reward = lightReward(nextIndex);
  assertUnderCap(mintedThrough(nextIndex), reward);

  // Drop unauthorized / unspendable mempool entries before building the block,
  // so one poisoned entry cannot stall the tip.
  const { accepted, rejected, fees } = await selectSpendableTxs(state.utxos, state.pending, state);
  for (const drop of rejected) {
    console.warn(`sequenceBlock dropped ${drop.txid.slice(0, 12)}…: ${drop.reason}`);
  }

  const coinbase = finalizeTransaction(
    revealTransaction(
      await createTransaction({
        inputs: [],
        outputs: [{ amount: reward + fees, address: localSequencer.address }],
        metadata: {
          description:
            skipCount > 0
              ? `Light reward (skip=${skipCount}) for illuminating pixel #${nextIndex}`
              : `Light reward for illuminating pixel #${nextIndex}`,
          reference: `LIGHT-${nextIndex}`,
        },
      }),
      sequence,
    ),
  );

  const revealed = [
    coinbase,
    ...accepted.map((tx) => finalizeTransaction(revealTransaction(tx, sequence))),
  ];

  // Same gate the accept path runs — produce and accept cannot drift (PIX-02).
  const applied = await validateAndApplyBlockTxs({
    utxos: state.utxos,
    txs: revealed,
    index: nextIndex,
    sequence,
  });

  // Reject OTS leaf reuse in pending txs before burning a sequencer leaf.
  const afterTxs = assertAndMergeOtsLeaves(state.usedOtsLeaves, collectOtsUsages(revealed));
  advancePastUsedOtsLeaves(localSequencer, afterTxs);

  // Validate membership records with the accept path's own checker, so a producer
  // cannot ship a record only it would accept.
  const membership = opts.membership ?? [];
  const listProblem = membershipListProblem(membership);
  if (listProblem) throw new Error(listProblem);
  for (const record of membership) {
    if (record.includedAt !== nextIndex) {
      throw new Error(
        `Membership record claims includedAt #${record.includedAt} but this pixel is #${nextIndex}`,
      );
    }
    const problem = await sequencerRecordProblem(record, electableKeysAt(state, nextHeight));
    if (problem) throw new Error(problem);
  }
  const membershipDigestValue = (await membershipDigest(membership)) ?? undefined;

  const root = await merkleRoot(revealed.map((t) => t.txid));
  const field = buildFieldWitnesses(nextIndex, priorFieldColors(state.pixels));
  const fieldDigest = computeFieldDigest(field);
  const waveField = computeTipWaveField({
    tipIndex: nextIndex,
    sequence,
    prevHash: tip.hash,
    merkleRoot: root,
    priorTipHashes: state.pixels.map((p) => p.hash),
  });
  const beacon = await opticalBeacon(sequence, tip.hash);
  const hash = await hashBlock({
    index: nextIndex,
    prevHash: tip.hash,
    merkleRoot: root,
    sequence,
    timestamp,
    beacon,
  });
  const { color, proximity } = await colorFromLight({
    index: nextIndex,
    hash,
    prevHash: tip.hash,
    merkleRoot: root,
    beacon,
    sequence,
    timestamp,
    transactions: revealed,
  });
  const picture = await buildSpatialPicture([
    ...state.pixels,
    { index: nextIndex, illuminated: true, color },
  ]);
  const proof = await createLightProof({
    sequence,
    prevHash: tip.hash,
    sequencer: localSequencer,
    skipCount,
    electable: addresses,
    fieldDigest,
    waveDigest: waveField.waveDigest as Hex,
    spatialRoot: picture.spatialRoot,
    membershipDigest: membershipDigestValue as Hex | undefined,
  });
  if (proof.beacon !== beacon) throw new Error("beacon drift");
  if (!(await verifyLightProof(proof, chosen))) {
    throw new Error("Invalid light proof");
  }

  const usedOtsLeaves = assertAndMergeOtsLeaves(
    state.usedOtsLeaves,
    collectOtsUsages(revealed, proof),
  );

  const block: LedgerPixel = {
    index: nextIndex,
    prevHash: tip.hash,
    merkleRoot: root,
    sequence,
    lightProof: proof,
    transactions: revealed,
    timestamp,
    hash,
    color,
    illuminated: true,
    proximity,
    field,
    wave: waveField.hits,
    ...(membership.length > 0 ? { membership } : {}),
  };

  return {
    ...state,
    pixels: [...state.pixels, block],
    utxos: applied.utxos,
    pending: [],
    pendingSince: undefined,
    reservedInputs: new Set(),
    usedOtsLeaves,
  };
}

/**
 * Accept the next sequential pixel from a peer (full validation, no private key).
 *
 * Gate C: skipCount > 0 allowed when stall window elapsed (lab clocks).
 * Not BFT — honest majority / synchronized enough clocks assumed.
 */
export async function acceptBlock(
  state: PixelChainState,
  block: LedgerPixel,
): Promise<PixelChainState> {
  const tip = state.pixels[state.pixels.length - 1];
  if (block.index !== tip.index + 1) {
    throw new Error(`Unexpected block height ${block.index}, tip is ${tip.index}`);
  }
  if (block.prevHash !== tip.hash) {
    throw new Error("Block does not link to tip");
  }

  // Sequence must advance by exactly one, and the proof must be about this block.
  //
  // Neither was checked. `sequence` is the lottery's input — the leader is
  // `argmin sha512(pols-lottery|prevHash|sequence|address)` — so an unbound sequence
  // is a free grinding lever: a producer picks the number that makes it the winner.
  // Height was checked and sequence was not, even though they are produced in
  // lockstep, so the two could disagree and only the unchecked one decided elections.
  //
  // `proof.sequence` was likewise never compared to the block's own. The proof's copy
  // feeds `opticalBeacon`, so a proof could be signed about a different position than
  // the block claims to occupy. It also made the full node a weaker validator than
  // the light client, which already checks its sibling field `lightProof.prevHash`.
  if (block.sequence !== tip.sequence + 1) {
    throw new Error(
      `Block sequence ${block.sequence} must be exactly one past the tip's ${tip.sequence}`,
    );
  }
  const binding = proofBindingProblem(block);
  if (binding) throw new Error(binding);

  // Timestamps: strictly increasing, bounded drift — consensus-checkable stall.
  if (!Number.isFinite(block.timestamp)) throw new Error("Block timestamp not finite");
  if (block.timestamp <= tip.timestamp) {
    throw new Error(
      `Block timestamp ${block.timestamp} must exceed parent ${tip.timestamp} (PIX-14)`,
    );
  }
  if (block.timestamp > Date.now() + POLS_MAX_FUTURE_DRIFT_MS) {
    throw new Error(
      `Block timestamp more than ${POLS_MAX_FUTURE_DRIFT_MS}ms in the future (PIX-14)`,
    );
  }

  const skipCount = block.lightProof.skipCount ?? 0;
  // The electable set is folded from history at this height — not read from local
  // gossip state, and above all not read from the block under validation. That
  // asymmetry is what let a stranger with one ground keypair extend the tip: node.ts
  // used to register a block's *claimed* producer before validating it, so the set
  // was whatever the block said it should be. Membership is now an output of the
  // chain (see membership.ts), which makes both the takeover and the two-operator
  // drift unrepresentable rather than merely fixed.
  const electable = electableAt(state, block.index);
  const claimed = block.lightProof.electable ?? [];
  if (claimed.length === 0) {
    throw new Error("Block must bind its electable set (PIX-04)");
  }
  if (claimed.join("|") !== electable.join("|")) {
    throw new Error(
      `Electable set mismatch — block binds ${claimed.length} address(es), history says ` +
        `${electable.length} at #${block.index} (PIX-04)`,
    );
  }

  // Membership records this block commits. Validated before the block is accepted,
  // and they take effect only after the activation delay — so a producer can never
  // be elected by a set it wrote itself.
  const listProblem = membershipListProblem(block.membership);
  if (listProblem) throw new Error(listProblem);
  for (const record of block.membership ?? []) {
    if (record.includedAt !== block.index) {
      throw new Error(
        `Membership record claims includedAt #${record.includedAt} inside pixel #${block.index}`,
      );
    }
    const problem = await sequencerRecordProblem(record, electableKeysAt(state, block.index));
    if (problem) throw new Error(problem);
  }

  const chosen = selectSequencerWithSkip(tip.hash, block.sequence, electable, skipCount);
  if (!(await verifyLightProof(block.lightProof, chosen))) {
    throw new Error("Invalid PoLS light proof");
  }
  // Sphere combination lock — recompute peer field; reject wrong neighbor effects.
  assertFieldWitnessesMatch(
    block.lightProof.fieldDigest,
    block.index,
    priorFieldColors(state.pixels),
  );
  // …and the array the block actually carries, not only the digest it binds. Those were
  // different things: `block.field` and `block.wave` are what a node serves at
  // `/wave/tip`, fans out to waveBus subscribers and the UI renders, and neither was
  // constrained by consensus. The recomputation is already happening for the digests, so
  // this is the difference between "the picture is the chain" being nearly true and true.
  assertFieldWitnessesBodyMatch(block.field, block.index, priorFieldColors(state.pixels));
  // Lead wave — recompute lattice propagation; reject tampered neighbor physics.
  const waveParams = {
    tipIndex: block.index,
    sequence: block.sequence,
    prevHash: block.prevHash,
    merkleRoot: block.merkleRoot,
    priorTipHashes: state.pixels.map((p) => p.hash),
  };
  assertWaveDigestMatch(block.lightProof.waveDigest, waveParams);
  assertWaveHitsBodyMatch(block.wave, waveParams);
  if (skipCount > 0 && block.timestamp < tip.timestamp + POLS_STALL_MS) {
    throw new Error("Skip pixel rejected — stall window not elapsed");
  }

  const root = await merkleRoot(block.transactions.map((t) => t.txid));
  if (root !== block.merkleRoot) throw new Error("Bad merkle root");

  const hash = await hashBlock({
    index: block.index,
    prevHash: block.prevHash,
    merkleRoot: block.merkleRoot,
    sequence: block.sequence,
    timestamp: block.timestamp,
    beacon: block.lightProof.beacon,
  });
  if (hash !== block.hash) throw new Error("Bad block hash");

  if (!block.illuminated) throw new Error("Block not illuminated");
  const { color, proximity } = await colorFromLight({
    index: block.index,
    hash: block.hash,
    prevHash: block.prevHash,
    merkleRoot: block.merkleRoot,
    beacon: block.lightProof.beacon,
    sequence: block.sequence,
    timestamp: block.timestamp,
    transactions: block.transactions,
    proximity: block.proximity,
  });
  if (color.r !== block.color.r || color.g !== block.color.g || color.b !== block.color.b) {
    throw new Error("Color does not match light composition");
  }
  if (proximity.join(",") !== block.proximity.join(",")) {
    throw new Error("Proximity cone mismatch");
  }

  // Sparse occupancy Merkle — recompute illuminated picture; reject tamper.
  const picture = await buildSpatialPicture([...state.pixels, block]);
  assertSpatialRootMatch(block.lightProof.spatialRoot, picture.spatialRoot, block.index);

  // Authorization + monetary invariants (PIX-01/02/03) — same gate as produce.
  const applied = await validateAndApplyBlockTxs({
    utxos: state.utxos,
    txs: block.transactions,
    index: block.index,
    sequence: block.sequence,
  });

  const usedOtsLeaves = assertAndMergeOtsLeaves(
    state.usedOtsLeaves,
    collectOtsUsages(block.transactions, block.lightProof),
  );

  // Drop pending txs included or conflicting
  const included = new Set(block.transactions.map((t) => t.txid));
  const spent = new Set(
    block.transactions.flatMap((t) => t.inputs.map((i) => utxoKey(i.txid, i.vout))),
  );
  const pending = state.pending.filter((tx) => {
    if (included.has(tx.txid)) return false;
    return !tx.inputs.some((i) => spent.has(utxoKey(i.txid, i.vout)));
  });

  return {
    ...state,
    pixels: [...state.pixels, block],
    utxos: applied.utxos,
    pending,
    pendingSince: pending.length ? state.pendingSince : undefined,
    reservedInputs: reservationsFor(pending),
    usedOtsLeaves,
  };
}

/**
 * Depth-1 tip replace: if we already have height H and a peer offers another
 * pixel at H with better fork-choice (lower skip / hash), replace tip.
 * Parent must match our tip-1. Lab only — not a reorg market.
 */
export async function replaceTipIfBetter(
  state: PixelChainState,
  candidate: LedgerPixel,
): Promise<PixelChainState | null> {
  const tip = state.pixels[state.pixels.length - 1];
  if (!tip || candidate.index !== tip.index) return null;
  if (preferPixel(tip, candidate) === tip) return null;
  if (state.pixels.length < 2) return null;
  const parent = state.pixels[state.pixels.length - 2];
  const rolledPixels = state.pixels.slice(0, -1);
  const rolled: PixelChainState = {
    ...state,
    pixels: rolledPixels,
    // Rebuild utxos from parent chain — replay remaining tip out
    utxos: (() => {
      let map = new Map<string, Utxo>();
      for (const p of rolledPixels) {
        map = applyTxUtxos(map, p.transactions);
      }
      return map;
    })(),
    /**
     * Consumed leaves are append-only (PIX-15). A signature for a dropped
     * block's leaf is already public, so releasing it would re-open the Lamport
     * reuse window. Rolled-back transactions are therefore NOT re-queued: their
     * inputs are spendable again, but the owner must re-sign with a fresh leaf.
     */
    usedOtsLeaves: new Set(state.usedOtsLeaves),
    pending: state.pending,
    pendingSince: state.pending.length ? (state.pendingSince ?? Date.now()) : undefined,
    reservedInputs: reservationsFor(state.pending),
  };
  void parent;
  try {
    return await acceptBlock(rolled, candidate);
  } catch {
    return null;
  }
}

/** Persistable snapshot (Maps → arrays). */
export interface SerializedChain {
  networkId: number;
  pixels: LedgerPixel[];
  utxos: Utxo[];
  pending: Transaction[];
  sequencers: SequencerId[];
  providers?: NodeProvider[];
  pendingSince?: number;
  /** Optional; always rebuilt from pixels on deserialize for safety. */
  usedOtsLeaves?: string[];
}

export function serializeChain(state: PixelChainState): SerializedChain {
  return {
    networkId: state.networkId,
    pixels: state.pixels,
    utxos: [...state.utxos.values()],
    pending: state.pending,
    sequencers: state.sequencers,
    providers: state.providers,
    pendingSince: state.pendingSince,
    usedOtsLeaves: [...state.usedOtsLeaves],
  };
}

export function deserializeChain(
  data: SerializedChain & { blocks?: LedgerPixel[] },
): PixelChainState {
  const utxos = new Map<string, Utxo>();
  for (const u of data.utxos ?? []) {
    utxos.set(utxoKey(u.txid, u.vout), u);
  }
  const pixels = data.pixels ?? data.blocks ?? [];
  // Union with any persisted burns so a restart cannot release a spent leaf.
  const usedOtsLeaves = rebuildUsedOtsLeaves(pixels);
  for (const key of data.usedOtsLeaves ?? []) usedOtsLeaves.add(key);
  // If snapshot omitted utxos, rebuild by replay.
  if (utxos.size === 0 && pixels.length > 0) {
    let map = new Map<string, Utxo>();
    for (const pixel of pixels) {
      map = applyTxUtxos(map, pixel.transactions);
    }
    return {
      networkId: data.networkId ?? PIXEL_NETWORK_ID,
      pixels,
      utxos: map,
      pending: data.pending ?? [],
      sequencers: data.sequencers,
      providers: data.providers,
      pendingSince: data.pendingSince,
      usedOtsLeaves,
    };
  }
  return {
    networkId: data.networkId ?? PIXEL_NETWORK_ID,
    pixels,
    utxos,
    pending: data.pending ?? [],
    sequencers: data.sequencers,
    providers: data.providers,
    pendingSince: data.pendingSince,
    usedOtsLeaves,
  };
}

/** Rebuild ledger state from a peer's pixel list (join network). */
export function stateFromPixels(
  pixels: LedgerPixel[],
  sequencers: SequencerId[],
  networkId = PIXEL_NETWORK_ID,
): PixelChainState {
  let utxos = new Map<string, Utxo>();
  for (const pixel of pixels) {
    utxos = applyTxUtxos(utxos, pixel.transactions);
  }
  return {
    pixels,
    utxos,
    pending: [],
    sequencers,
    networkId,
    usedOtsLeaves: rebuildUsedOtsLeaves(pixels),
  };
}

/**
 * Electable set for a pixel, folded from history.
 *
 * Replaces three ways of guessing. This function used to prefer the set the block
 * itself claimed, fall back to local gossip state, then fall back again to the
 * distinct producers seen so far — and `acceptBlock` used a fourth rule. Four
 * answers to one question is how a chain becomes valid as history and invalid live,
 * which `electable-drift-selftest.ts` demonstrated on purpose.
 *
 * There is now exactly one answer, and both paths call it.
 */
export function resolveElectable(
  _block: LedgerPixel,
  pixels: LedgerPixel[],
  height: number,
): string[] {
  const genesis = pixels[0];
  if (!genesis) return [];
  return membersAt({
    founder: genesis.lightProof.sequencerAddress,
    height,
    recordsAt: (index) => pixels[index]?.membership,
  });
}

export async function verifyChain(state: PixelChainState): Promise<boolean> {
  if (state.pixels.length === 0) return false;
  /**
   * Signature rules are a function of height, not of now.
   *
   * PIX-10/PIX-16 replaced three signature constructions in one commit, so pixels
   * produced before it were signed under rules no later code could check. Replaying
   * history therefore has to ask "what was true here", which is the only reason this
   * closure exists. New blocks never touch it — `acceptBlock` keeps the current rules
   * unconditionally. See `sig-era.ts`.
   */
  const policyAt = (height: number): SignaturePolicy =>
    signaturePolicyAtHeight({ networkId: state.networkId, height });
  let usedOts = new Set<string>();
  let replayUtxos = new Map<string, Utxo>();
  let replayMinted = 0;

  for (let i = 0; i < state.pixels.length; i++) {
    const block = state.pixels[i];
    if (i > 0 && block.prevHash !== state.pixels[i - 1].hash) return false;
    // Height, sequence and the proof's own view of both must agree — the same rules
    // acceptBlock applies, so history and the live path cannot disagree about one
    // block. verifyChain never checked any of the three: not that block.index equals
    // its position, not that sequence advances by one, and not that the light proof is
    // about this block at all.
    if (block.index !== i) return false;
    if (i > 0 && block.sequence !== state.pixels[i - 1].sequence + 1) return false;
    if (proofBindingProblem(block)) return false;

    const skipCount = block.lightProof.skipCount ?? 0;
    const prevHash = i === 0 ? "0".repeat(128) : state.pixels[i - 1].hash;
    const electable = resolveElectable(block, state.pixels, i);
    if (!electable.includes(block.lightProof.sequencerAddress)) return false;
    // The bound claim must equal the fold exactly. This used to only require that
    // the set never shrank relative to the parent, which accepted any superset a
    // producer cared to invent; the fold is a single answer, so equality is the
    // check and `acceptBlock` applies the identical one.
    const bound = block.lightProof.electable ?? [];
    if (bound.length === 0) return false;
    if (bound.join("|") !== electable.join("|")) return false;

    // Membership records are validated as history too, against the set that was
    // active when they were included.
    if (membershipListProblem(block.membership)) return false;
    for (const record of block.membership ?? []) {
      if (record.includedAt !== block.index) return false;
      if (await sequencerRecordProblem(record, electableKeysFromPixels(state.pixels, i)))
        return false;
    }
    // Timestamps must strictly increase (PIX-14).
    if (i > 0 && !(block.timestamp > state.pixels[i - 1].timestamp)) return false;
    const expectedSequencer = selectSequencerWithSkip(
      prevHash,
      block.sequence,
      electable,
      skipCount,
    );
    if (block.lightProof.sequencerAddress !== expectedSequencer) return false;
    if (!(await verifyLightProof(block.lightProof, expectedSequencer, policyAt(i).verify)))
      return false;
    try {
      assertFieldWitnessesMatch(
        block.lightProof.fieldDigest,
        block.index,
        priorFieldColors(state.pixels.slice(0, i)),
      );
      assertFieldWitnessesBodyMatch(
        block.field,
        block.index,
        priorFieldColors(state.pixels.slice(0, i)),
      );
      const replayWaveParams = {
        tipIndex: block.index,
        sequence: block.sequence,
        prevHash: block.prevHash,
        merkleRoot: block.merkleRoot,
        priorTipHashes: state.pixels.slice(0, i).map((p) => p.hash),
      };
      assertWaveDigestMatch(block.lightProof.waveDigest, replayWaveParams);
      assertWaveHitsBodyMatch(block.wave, replayWaveParams);
      const picture = await buildSpatialPicture(state.pixels.slice(0, i + 1));
      assertSpatialRootMatch(block.lightProof.spatialRoot, picture.spatialRoot, block.index);
    } catch {
      return false;
    }
    if (skipCount > 0 && i > 0) {
      const parent = state.pixels[i - 1];
      if (block.timestamp < parent.timestamp + POLS_STALL_MS) return false;
    }

    const root = await merkleRoot(block.transactions.map((t) => t.txid));
    if (root !== block.merkleRoot) return false;

    const hash = await hashBlock({
      index: block.index,
      prevHash: block.prevHash,
      merkleRoot: block.merkleRoot,
      sequence: block.sequence,
      timestamp: block.timestamp,
      beacon: block.lightProof.beacon,
    });
    if (hash !== block.hash) return false;

    if (!block.illuminated) return false; // on-chain ⇒ must have been lit
    const { color, proximity } = await colorFromLight({
      index: block.index,
      hash: block.hash,
      prevHash: block.prevHash,
      merkleRoot: block.merkleRoot,
      beacon: block.lightProof.beacon,
      sequence: block.sequence,
      timestamp: block.timestamp,
      transactions: block.transactions,
      proximity: block.proximity,
    });
    if (color.r !== block.color.r || color.g !== block.color.g || color.b !== block.color.b) {
      return false;
    }
    if (proximity.join(",") !== block.proximity.join(",")) return false;

    // Full state replay — ownership, supply and conservation at every height.
    try {
      const applied = await validateAndApplyBlockTxs({
        utxos: replayUtxos,
        txs: block.transactions,
        index: block.index,
        sequence: block.sequence,
        policy: policyAt(i),
      });
      replayUtxos = applied.utxos;
      replayMinted += applied.coinbaseTotal;
    } catch {
      return false;
    }

    try {
      usedOts = assertAndMergeOtsLeaves(
        usedOts,
        collectOtsUsages(block.transactions, block.lightProof),
      );
    } catch {
      return false;
    }
  }

  // Issuance must match the emission schedule for the replayed height.
  if (replayMinted !== mintedThrough(state.pixels.length)) return false;

  // Nothing in the live set may be absent from the replay (no conjured coins).
  // The replay may hold more: `proposeTransfer` debits pending spends locally.
  for (const [key, utxo] of state.utxos) {
    const replayed = replayUtxos.get(key);
    if (!replayed) return false;
    if (replayed.amount !== utxo.amount || replayed.address !== utxo.address) return false;
  }
  return true;
}

/** Serialize for UI — Maps don't travel through React state cleanly. */
export interface PixelChainView {
  pixels: LedgerPixel[];
  utxos: Utxo[];
  pending: Transaction[];
  sequencers: { address: string; publicKey: Hex; label?: string }[];
}

export function toView(state: PixelChainState): PixelChainView {
  return {
    pixels: state.pixels,
    utxos: [...state.utxos.values()],
    pending: state.pending,
    sequencers: state.sequencers.map((s) => ({
      address: s.address,
      publicKey: s.publicKey,
    })),
  };
}

export function tipHash(state: PixelChainState): Hex {
  return state.pixels[state.pixels.length - 1]?.hash ?? "0".repeat(128);
}
