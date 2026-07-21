/**
 * Pixel Chain — Bitcoin-like UTXO ledger with Proof of Light Sequence.
 * Looking at all transactions paints a picture of pixels; each block is one pixel.
 */

import { otsUsageKey, parseOtsLeafIndex, sha512Hex, type Hex, type LightKeypair } from "./crypto";
import { ABSENT_COLOR, composePixelColor, revealProximity, type PixelColor } from "./light-color";
import {
  createLightProof,
  merkleRoot,
  POLS_MAX_SKIP,
  POLS_STALL_MS,
  preferPixel,
  selectSequencerWithSkip,
  verifyLightProof,
  type LightProof,
} from "./pol";
import {
  assertFieldWitnessesMatch,
  buildFieldWitnesses,
  computeFieldDigest,
  priorFieldColors,
  type FieldWitness,
} from "./field-witness";
import { assertUnderCap, lightReward, mintedThrough } from "./economics";
import {
  createTransaction,
  finalizeTransaction,
  revealTransaction,
  signTransaction,
  verifyTransactionSignatures,
  type ReadableMeta,
  type Transaction,
  type TxOutput,
  type Utxo,
} from "./transaction";
import { assertSovereignIfLive, type NodeProvider } from "./sovereignty";

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

function utxoKey(txid: string, vout: number): string {
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

export const PIXEL_NETWORK_ID = 0x5049; // "PI"

export async function createGenesis(
  sequencer: LightKeypair,
  networkId = PIXEL_NETWORK_ID,
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
  const field = buildFieldWitnesses(0, []);
  const fieldDigest = computeFieldDigest(field);
  const proof = await createLightProof({
    sequence: 0,
    prevHash,
    sequencer,
    electable: [sequencer.address],
    fieldDigest,
  });
  const root = await merkleRoot([revealed.txid]);
  const timestamp = Date.now();
  const hash = await hashBlock({
    index: 0,
    prevHash,
    merkleRoot: root,
    sequence: 0,
    timestamp,
    beacon: proof.beacon,
  });
  const { color, proximity } = await colorFromLight({
    index: 0,
    hash,
    prevHash,
    merkleRoot: root,
    beacon: proof.beacon,
    sequence: 0,
    timestamp,
    transactions: [revealed],
  });
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
  };

  const utxos = new Map<string, Utxo>();
  revealed.outputs.forEach((out, vout) => {
    utxos.set(utxoKey(revealed.txid, vout), {
      txid: revealed.txid,
      vout,
      amount: out.amount,
      address: out.address,
    });
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

export function registerSequencer(
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

export function balanceOf(state: PixelChainState, address: string): number {
  let sum = 0;
  for (const utxo of state.utxos.values()) {
    if (utxo.address === address) sum += utxo.amount;
  }
  return sum;
}

export function utxosFor(state: PixelChainState, address: string): Utxo[] {
  return [...state.utxos.values()].filter((u) => u.address === address);
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

  // Spend locally from mempool view so double-spends fail early.
  const nextUtxos = new Map(state.utxos);
  for (const u of selected) {
    nextUtxos.delete(utxoKey(u.txid, u.vout));
  }

  return {
    state: {
      ...state,
      utxos: nextUtxos,
      pending: [...state.pending, tx],
      pendingSince: state.pending.length === 0 ? Date.now() : (state.pendingSince ?? Date.now()),
    },
    tx,
  };
}

/** Who should sequence next — deterministic from tip hash (+ optional Gate C skip). */
export function nextSequencerAddress(state: PixelChainState, skipCount = 0): string {
  const tip = state.pixels[state.pixels.length - 1];
  return selectSequencerWithSkip(
    tip.hash,
    tip.sequence + 1,
    state.sequencers.map((s) => s.address),
    skipCount,
  );
}

/** Stall anchor for skip justification. */
export function stallAnchorMs(state: PixelChainState): number {
  const tip = state.pixels[state.pixels.length - 1];
  return state.pendingSince ?? tip?.timestamp ?? 0;
}

/** Smallest skipCount at which `address` is elected, or null if none within max. */
export function skipCountForAddress(state: PixelChainState, address: string): number | null {
  for (let skip = 0; skip <= POLS_MAX_SKIP; skip++) {
    if (nextSequencerAddress(state, skip) === address) return skip;
  }
  return null;
}

function applyTxUtxos(utxos: Map<string, Utxo>, txs: Transaction[]): Map<string, Utxo> {
  const next = new Map(utxos);
  for (const tx of txs) {
    for (const input of tx.inputs) {
      next.delete(utxoKey(input.txid, input.vout));
    }
    tx.outputs.forEach((out, vout) => {
      next.set(utxoKey(tx.txid, vout), {
        txid: tx.txid,
        vout,
        amount: out.amount,
        address: out.address,
      });
    });
  }
  return next;
}

export interface SequenceOpts {
  /** Gate C — how many elected sequencers to skip (0 = on-time). */
  skipCount?: number;
  /** Injected clock for tests. */
  now?: number;
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
  const addresses = state.sequencers.map((s) => s.address);
  const chosen = selectSequencerWithSkip(tip.hash, sequence, addresses, skipCount);
  if (localSequencer.address !== chosen) {
    throw new Error(`Not this node's turn to sequence (need ${chosen}, skip=${skipCount})`);
  }
  if (skipCount > 0) {
    const anchor = stallAnchorMs(state);
    if (now < anchor + POLS_STALL_MS) {
      throw new Error(`Skip not justified yet — stall ${POLS_STALL_MS}ms required (Gate C)`);
    }
  }

  const nextIndex = tip.index + 1;
  const reward = lightReward(nextIndex);
  assertUnderCap(mintedThrough(nextIndex), reward);

  const coinbase = finalizeTransaction(
    revealTransaction(
      await createTransaction({
        inputs: [],
        outputs: [{ amount: reward, address: localSequencer.address }],
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
    ...state.pending.map((tx) => finalizeTransaction(revealTransaction(tx, sequence))),
  ];

  for (const tx of revealed) {
    const ok = await verifyTransactionSignatures(tx);
    if (!ok) throw new Error(`Invalid signature on ${tx.txid}`);
  }

  // Reject OTS leaf reuse in pending txs before burning a sequencer leaf.
  const afterTxs = assertAndMergeOtsLeaves(state.usedOtsLeaves, collectOtsUsages(revealed));
  advancePastUsedOtsLeaves(localSequencer, afterTxs);

  const field = buildFieldWitnesses(nextIndex, priorFieldColors(state.pixels));
  const fieldDigest = computeFieldDigest(field);
  const proof = await createLightProof({
    sequence,
    prevHash: tip.hash,
    sequencer: localSequencer,
    skipCount,
    electable: addresses,
    fieldDigest,
  });
  if (!(await verifyLightProof(proof, chosen))) {
    throw new Error("Invalid light proof");
  }

  const usedOtsLeaves = assertAndMergeOtsLeaves(
    state.usedOtsLeaves,
    collectOtsUsages(revealed, proof),
  );

  const root = await merkleRoot(revealed.map((t) => t.txid));
  const timestamp = now;
  const hash = await hashBlock({
    index: nextIndex,
    prevHash: tip.hash,
    merkleRoot: root,
    sequence,
    timestamp,
    beacon: proof.beacon,
  });
  const { color, proximity } = await colorFromLight({
    index: nextIndex,
    hash,
    prevHash: tip.hash,
    merkleRoot: root,
    beacon: proof.beacon,
    sequence,
    timestamp,
    transactions: revealed,
  });

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
  };

  return {
    ...state,
    pixels: [...state.pixels, block],
    utxos: applyTxUtxos(state.utxos, revealed),
    pending: [],
    pendingSince: undefined,
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

  const skipCount = block.lightProof.skipCount ?? 0;
  const registry = new Set(state.sequencers.map((s) => s.address));
  const electable = resolveElectable(block, state.pixels, tip.index + 1, state);
  for (const addr of electable) {
    if (!registry.has(addr)) {
      throw new Error(`Electable sequencer ${addr} not in local registry`);
    }
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
  if (skipCount > 0) {
    const anchor = stallAnchorMs(state);
    if (block.timestamp < anchor + POLS_STALL_MS) {
      throw new Error("Skip pixel rejected — stall window not elapsed");
    }
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

  for (const tx of block.transactions) {
    if (!(await verifyTransactionSignatures(tx))) {
      throw new Error(`Bad tx signature ${tx.txid}`);
    }
  }

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
    utxos: applyTxUtxos(state.utxos, block.transactions),
    pending,
    pendingSince: pending.length ? state.pendingSince : undefined,
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
    usedOtsLeaves: rebuildUsedOtsLeaves(rolledPixels),
    pending: [...state.pending, ...tip.transactions.filter((t) => t.inputs.length > 0)],
    pendingSince: state.pendingSince ?? Date.now(),
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
  const usedOtsLeaves = rebuildUsedOtsLeaves(pixels);
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
 * Legacy fallback when a pixel has no bound `lightProof.electable`.
 * Prefer proof-bound sets — registry growth must not rewrite lottery history.
 */
export function electableSequencersAt(pixels: LedgerPixel[], height: number): string[] {
  if (height <= 0) {
    return pixels[0] ? [pixels[0].lightProof.sequencerAddress] : [];
  }
  const seen: string[] = [];
  const set = new Set<string>();
  for (let j = 0; j < height; j++) {
    const a = pixels[j].lightProof.sequencerAddress;
    if (!set.has(a)) {
      set.add(a);
      seen.push(a);
    }
  }
  return seen;
}

/** Electable set for a pixel: proof-bound first, else legacy producer prefix. */
export function resolveElectable(
  block: LedgerPixel,
  pixels: LedgerPixel[],
  height: number,
  state?: PixelChainState,
): string[] {
  const bound = block.lightProof.electable;
  if (bound && bound.length > 0) return [...bound];
  if (state && height > 0) {
    // Pre-binding pixels: tip-era used full registry; keep accept path working.
    return state.sequencers.map((s) => s.address);
  }
  return electableSequencersAt(pixels, height);
}

export async function verifyChain(state: PixelChainState): Promise<boolean> {
  if (state.pixels.length === 0) return false;
  const registry = new Set(state.sequencers.map((s) => s.address));
  let usedOts = new Set<string>();

  for (let i = 0; i < state.pixels.length; i++) {
    const block = state.pixels[i];
    if (i > 0 && block.prevHash !== state.pixels[i - 1].hash) return false;

    const skipCount = block.lightProof.skipCount ?? 0;
    const prevHash = i === 0 ? "0".repeat(128) : state.pixels[i - 1].hash;
    const electable = resolveElectable(block, state.pixels, i);
    if (!electable.includes(block.lightProof.sequencerAddress)) return false;
    if (!registry.has(block.lightProof.sequencerAddress)) return false;
    for (const addr of electable) {
      if (!registry.has(addr)) return false;
    }
    const expectedSequencer = selectSequencerWithSkip(
      prevHash,
      block.sequence,
      electable,
      skipCount,
    );
    if (block.lightProof.sequencerAddress !== expectedSequencer) return false;
    if (!(await verifyLightProof(block.lightProof, expectedSequencer))) return false;
    try {
      assertFieldWitnessesMatch(
        block.lightProof.fieldDigest,
        block.index,
        priorFieldColors(state.pixels.slice(0, i)),
      );
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

    for (const tx of block.transactions) {
      if (tx.state !== "final" && tx.state !== "revealed") return false;
      if (!(await verifyTransactionSignatures(tx))) return false;
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
