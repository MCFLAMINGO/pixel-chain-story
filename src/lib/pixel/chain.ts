/**
 * Pixel Chain — Bitcoin-like UTXO ledger with Proof of Light Sequence.
 * Looking at all transactions paints a picture of pixels; each block is one pixel.
 */

import { sha512Hex, type Hex, type LightKeypair } from "./crypto";
import { ABSENT_COLOR, composePixelColor, revealProximity, type PixelColor } from "./light-color";
import {
  createLightProof,
  merkleRoot,
  selectSequencer,
  verifyLightProof,
  type LightProof,
} from "./pol";
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
  const proof = await createLightProof({
    sequence: 0,
    prevHash,
    sequencer,
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

  return {
    pixels: [genesis],
    utxos,
    pending: [],
    sequencers: [{ address: sequencer.address, publicKey: sequencer.publicKey }],
    networkId,
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
    },
    tx,
  };
}

/** Who should sequence next — deterministic from tip hash. */
export function nextSequencerAddress(state: PixelChainState): string {
  const tip = state.pixels[state.pixels.length - 1];
  return selectSequencer(
    tip.hash,
    tip.sequence + 1,
    state.sequencers.map((s) => s.address),
  );
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

/** Shine light locally: only the elected sequencer key may produce the block. */
export async function sequenceBlock(
  state: PixelChainState,
  localSequencer: LightKeypair,
): Promise<PixelChainState> {
  if (state.pending.length === 0) {
    throw new Error("Nothing in superposition to reveal");
  }

  const tip = state.pixels[state.pixels.length - 1];
  const sequence = tip.sequence + 1;
  const chosen = nextSequencerAddress(state);
  if (localSequencer.address !== chosen) {
    throw new Error(`Not this node's turn to sequence (need ${chosen})`);
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
          description: `Light reward for illuminating pixel #${nextIndex}`,
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

  const proof = await createLightProof({
    sequence,
    prevHash: tip.hash,
    sequencer: localSequencer,
  });
  if (!(await verifyLightProof(proof, chosen))) {
    throw new Error("Invalid light proof");
  }

  const root = await merkleRoot(revealed.map((t) => t.txid));
  const timestamp = Date.now();
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
  };

  return {
    ...state,
    pixels: [...state.pixels, block],
    utxos: applyTxUtxos(state.utxos, revealed),
    pending: [],
  };
}

/**
 * Accept the next sequential pixel from a peer (full validation, no private key).
 *
 * Honesty: this is sequential tip-extension, not BFT fork-choice. An elected
 * sequencer going offline stalls illumination until that turn can be skipped
 * by a future protocol upgrade. Fine for a networked prototype; not a finished L1.
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

  const chosen = selectSequencer(
    tip.hash,
    block.sequence,
    state.sequencers.map((s) => s.address),
  );
  if (!(await verifyLightProof(block.lightProof, chosen))) {
    throw new Error("Invalid PoLS light proof");
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
  };
}

/** Persistable snapshot (Maps → arrays). */
export interface SerializedChain {
  networkId: number;
  pixels: LedgerPixel[];
  utxos: Utxo[];
  pending: Transaction[];
  sequencers: SequencerId[];
  providers?: NodeProvider[];
}

export function serializeChain(state: PixelChainState): SerializedChain {
  return {
    networkId: state.networkId,
    pixels: state.pixels,
    utxos: [...state.utxos.values()],
    pending: state.pending,
    sequencers: state.sequencers,
    providers: state.providers,
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
    };
  }
  return {
    networkId: data.networkId ?? PIXEL_NETWORK_ID,
    pixels,
    utxos,
    pending: data.pending ?? [],
    sequencers: data.sequencers,
    providers: data.providers,
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
  return { pixels, utxos, pending: [], sequencers, networkId };
}

export async function verifyChain(state: PixelChainState): Promise<boolean> {
  if (state.pixels.length === 0) return false;
  const addresses = state.sequencers.map((s) => s.address);

  for (let i = 0; i < state.pixels.length; i++) {
    const block = state.pixels[i];
    if (i > 0 && block.prevHash !== state.pixels[i - 1].hash) return false;

    const expectedSequencer = selectSequencer(
      i === 0 ? "0".repeat(128) : state.pixels[i - 1].hash,
      block.sequence,
      addresses,
    );
    if (!(await verifyLightProof(block.lightProof, expectedSequencer))) return false;

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
