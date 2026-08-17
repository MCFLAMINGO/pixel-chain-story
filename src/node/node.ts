/**
 * Pixel Ledger node — persistent UTXO light ledger with PoLS sequencing.
 * Gate B: catch-up, reconnect seeds, stall detection.
 */

import {
  acceptBlock,
  balanceOf,
  buildHeadersSync,
  createGenesis,
  createPeerBook,
  extractHeaders,
  handlePixelRpc,
  nextSequencerAddress,
  notePeerHello,
  POLS_STALL_MS,
  proveBalance,
  proposeTransfer,
  punishPeer,
  registerSequencer,
  noteSequencerKey,
  replaceTipIfBetter,
  rewardPeer,
  sequenceBlock,
  shouldAcceptTipFromPeer,
  signHello,
  skipCountForAddress,
  stallAnchorMs,
  tipHash,
  transportKemEnabled,
  transportStatus,
  generateKemKeypair,
  verifyChain,
  verifyHeaderChain,
  verifyHelloAuth,
  createWaveBus,
  waveFanoutFromPixel,
  type JsonRpcRequest,
  type KemKeypair,
  type LightKeypair,
  type PeerBookState,
  type PixelChainState,
  type ReadableMeta,
  type Transaction,
  type TxOutput,
  type LedgerPixel,
  type WaveBus,
  type WaveFanoutListener,
  type WaveFanoutSource,
  admitTransaction,
  considerBranch,
  electableKeysAt,
  MEMBERSHIP_ACTIVATION_DELAY,
  sequencerRecordProblem,
  MempoolRejected,
  type SequencerRecord,
  MAX_HELLO_SEQUENCERS,
  MAX_PIXELS_PER_MESSAGE,
  pixelPage,
} from "../lib/pixel/index";
import { createBunGossip } from "./gossip-bun";
import type { GossipNet, PeerMessage } from "./p2p";
import {
  ensureDatadir,
  loadChain,
  loadIdentity,
  loadOrCreateIdentity,
  loadBridgeFeeder,
  loadPeers,
  loadWallet,
  persistIdentityLeaf,
  saveBridgeFeeder,
  saveChain,
  savePeers,
  saveWallet,
} from "./store";
import { loadOrSeedLumenModules, saveLumenModules } from "./lumen-store";
import type { PersistedLumenBundle } from "../lumen/persist";
import { TRANSFER_LUMEN } from "../lumen/index";

export interface NodeOptions {
  datadir: string;
  rpcPort: number;
  gossipPort: number;
  seeds?: string[];
  label?: string;
  /**
   * Take turns producing pixels. Default false — a node follows and verifies
   * unless it opts in, because joining the rota without chain-carried membership
   * makes this node reject the tip's blocks.
   */
  sequencer?: boolean;
  /** Auto-sequence when this node is elected and mempool nonempty */
  autoSequenceMs?: number;
  /** Public host/IP peers should dial for gossip (VPS DNS or IP) */
  advertiseHost?: string;
  /** Warn when tip/pending stalls (ms). 0 = off */
  stallCheckMs?: number;
}

export class PixelLedgerNode {
  datadir: string;
  chain!: PixelChainState;
  keypair!: LightKeypair;
  gossip!: GossipNet;
  private timer?: ReturnType<typeof setInterval>;
  private stallTimer?: ReturnType<typeof setInterval>;
  private catchUpTimer?: ReturnType<typeof setInterval>;
  private persistQueued = false;
  private lastTipIndex = 0;
  private lastTipChangeAt = Date.now();
  private stallLoggedAt = 0;
  /**
   * Serialize critical chain mutations (sequence / accept / submit / send / peer apply)
   * so timer + gossip + RPC cannot race sequence/accept.
   */
  private chainLock: Promise<void> = Promise.resolve();
  /** Gate F peer scores */
  peerBook: PeerBookState = createPeerBook();
  /**
   * Membership records waiting to be committed to a pixel.
   *
   * Membership has been on-chain since T1.1, but nothing could put a record *into* a
   * block: `sequenceBlock` accepted a `membership` option and no caller ever passed one.
   * So the electable set was a fold over records that could not be created — correct,
   * enforced, and unreachable. A second operator was impossible for want of a queue.
   */
  private pendingMembership: SequencerRecord[] = [];

  private helloSig = "";
  private helloSigTip = "";
  /** Opt-in PQ transport (PIXEL_TRANSPORT_KEM=1) */
  transportKem: KemKeypair | null = null;
  /**
   * Local wave fan-out bus (SPATIAL S4) — notify after tip illuminate/accept.
   * Not consensus truth; acceptBlock still recomputes waveDigest.
   */
  readonly waveBus: WaveBus = createWaveBus();
  /** Lumen modules beside chain.json — source text, re-parsed on load. */
  lumen!: PersistedLumenBundle;
  /** Ethereum lock digests already shone in (persisted). */
  private bridgeConsumed = new Set<string>();

  constructor(private opts: NodeOptions) {
    this.datadir = opts.datadir;
  }

  /** Subscribe to async wave hits after tip progress. */
  onWaveHits(listener: WaveFanoutListener): () => void {
    return this.waveBus.on(listener);
  }

  private fanoutWave(pixel: LedgerPixel, source: WaveFanoutSource): void {
    this.waveBus.emit(waveFanoutFromPixel(pixel, source));
  }

  private async refreshHelloSig(): Promise<void> {
    const tip = tipHash(this.chain);
    if (this.helloSig && this.helloSigTip === tip) return;
    const height = this.chain.pixels.length - 1;
    const gossipUrl = this.gossip?.localGossipUrl() ?? undefined;
    this.helloSig = await signHello(this.keypair, height, tip, gossipUrl ?? undefined);
    this.helloSigTip = tip;
  }

  async start(): Promise<void> {
    await ensureDatadir(this.datadir);
    const { keypair } = await loadOrCreateIdentity(this.datadir, this.opts.label ?? "node");
    this.keypair = keypair;

    const existing = await loadChain(this.datadir);
    if (existing) {
      // The crowned network accepts exactly one genesis. This is the other half of
      // namespacing lab chains: a chain claiming to be the public picture has to be
      // it. Lab chains carry PIXEL_LAB_NETWORK_ID and are not checked here.
      const { PIXEL_NETWORK_ID } = await import("../lib/pixel/chain");
      if (existing.networkId === PIXEL_NETWORK_ID) {
        const { assertCrownedEarth } = await import("../lib/pixel/crowned-genesis");
        assertCrownedEarth({
          genesisHash: existing.pixels[0]?.hash ?? "",
          networkId: existing.networkId,
          label: `ledger in ${this.datadir}`,
        });
      }
      // Adding yourself to the rota changes the electable set this node derives,
      // and acceptBlock requires that set to match what an incoming block binds.
      // A node that self-registers therefore rejects every block the tip makes
      // until the tip has heard its hello — so a fresh joiner would sync, then
      // freeze. Witnessing is the default; taking turns is opted into, and until
      // membership is carried by the chain that opt-in has known consequences
      // (scripts/electable-drift-selftest.ts).
      const wantsTurns =
        this.opts.sequencer === true ||
        process.env.PIXEL_SEQUENCER === "1" ||
        process.env.PIXEL_SEQUENCER === "true" ||
        process.env.PIXEL_TIP_HOST === "1" ||
        process.env.PIXEL_TIP_HOST === "true";
      this.chain = wantsTurns ? registerSequencer(existing, keypair) : existing;
      if (!wantsTurns) {
        console.log("[pixel-ledger] witness mode — following the tip, not taking turns");
      }
    } else {
      const allowLab =
        process.env.PIXEL_ALLOW_LAB_GENESIS === "1" ||
        process.env.PIXEL_ALLOW_LAB_GENESIS === "true" ||
        process.env.PIXEL_TIP_HOST === "1" ||
        process.env.PIXEL_TIP_HOST === "true";
      if (!allowLab) {
        throw new Error(
          `No ledger in ${this.datadir} — join the crowned tip (do not forge Earth). ` +
            `bun run pixel -- join --peer https://pixel-tip-production.up.railway.app --datadir ${this.datadir} --require-crowned`,
        );
      }
      this.chain = await createGenesis(keypair);
    }
    this.lastTipIndex = this.chain.pixels.length - 1;
    this.lastTipChangeAt = Date.now();
    this.lumen = await loadOrSeedLumenModules(this.datadir, TRANSFER_LUMEN);
    this.bridgeConsumed = await loadBridgeFeeder(this.datadir);
    await this.persist();

    const seeds = this.opts.seeds ?? (await loadPeers(this.datadir));
    const advertiseHost = this.opts.advertiseHost ?? "127.0.0.1";
    const gossipUrl = `ws://${advertiseHost}:${this.opts.gossipPort}/gossip`;
    const tip = tipHash(this.chain);
    this.helloSig = await signHello(keypair, this.chain.pixels.length - 1, tip, gossipUrl);
    this.helloSigTip = tip;
    if (transportKemEnabled()) {
      this.transportKem = generateKemKeypair();
      console.log("[pixel-ledger] transport PIX-ML-KEM-768 (opt-in PIXEL_TRANSPORT_KEM=1)");
    }
    this.gossip = createBunGossip({
      port: this.opts.gossipPort,
      nodeId: keypair.address.slice(0, 16),
      address: keypair.address,
      publicKey: keypair.publicKey,
      advertiseHost: this.opts.advertiseHost,
      seeds,
      transportKem: this.transportKem ?? undefined,
      getSequencers: () => this.chain.sequencers,
      getTip: () => ({
        height: this.chain.pixels.length - 1,
        hash: tipHash(this.chain),
      }),
      getHelloAuth: () => {
        void this.refreshHelloSig();
        return this.helloSig ? { helloSig: this.helloSig } : null;
      },
      onMessage: (msg, peer) => this.onPeerMessage(msg, peer),
      // A peer that sends frames we cannot parse is not a protocol error to crash
      // on, it is a peer worth trusting less. Scoring walks a persistent offender
      // out without dropping a session that may still be serving us history.
      onMalformed: (peer, reason) => {
        punishPeer(this.peerBook, peer, 4);
        console.warn(`[pixel-ledger] malformed frame from ${peer}: ${reason}`);
      },
    });

    const ms = this.opts.autoSequenceMs ?? 2000;
    if (ms > 0) {
      this.timer = setInterval(() => {
        void this.trySequence();
      }, ms);
    }

    // Periodic catch-up probe — ask peers if we might be behind.
    this.catchUpTimer = setInterval(() => {
      this.requestCatchUp(this.chain.pixels.length);
    }, 5000);

    const stallMs = this.opts.stallCheckMs ?? 15_000;
    if (stallMs > 0) {
      this.stallTimer = setInterval(() => this.checkStall(stallMs), Math.min(5000, stallMs));
    }

    console.log(`[pixel-ledger] node ${keypair.address}`);
    console.log(`[pixel-ledger] pixels=${this.chain.pixels.length} datadir=${this.datadir}`);
    console.log(`[pixel-ledger] gossip ${this.gossip.localGossipUrl()}`);
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    if (this.stallTimer) clearInterval(this.stallTimer);
    if (this.catchUpTimer) clearInterval(this.catchUpTimer);
    this.gossip?.stop();
  }

  /** Snapshot for /sync — joiners pull this. */
  syncSnapshot() {
    const transport = transportStatus();
    const genesisHash = this.chain.pixels[0]?.hash ?? null;
    return {
      networkId: this.chain.networkId,
      genesisHash,
      canvasId: genesisHash != null ? `${this.chain.networkId}:${genesisHash}` : null,
      pixels: this.chain.pixels,
      sequencers: this.chain.sequencers,
      tip: this.chain.pixels.length - 1,
      tipHash: tipHash(this.chain),
      address: this.keypair.address,
      publicKey: this.keypair.publicKey,
      gossipUrl: this.gossip?.localGossipUrl() ?? null,
      transport: {
        enabled: Boolean(this.transportKem),
        kemPublicKey: this.transportKem?.publicKey ?? null,
        status: transport,
      },
    };
  }

  /** Headers-first sync — light clients verify tip without full bodies. */
  async headersSyncSnapshot() {
    return buildHeadersSync(this.chain);
  }

  async balanceProof(address: string) {
    return proveBalance(this.chain, address);
  }

  async spatialSnapshot() {
    const { buildSpatialPicture, pictureSnapshot } = await import("../lib/pixel/spatial-picture");
    return pictureSnapshot(await buildSpatialPicture(this.chain.pixels));
  }

  async illuminatedCellProof(index: number) {
    const { proveTipIlluminatedCell } = await import("../lib/pixel/light-client");
    return proveTipIlluminatedCell(this.chain, index);
  }

  async persist(): Promise<void> {
    await saveChain(this.datadir, this.chain);
    if (this.lumen) {
      await saveLumenModules(this.datadir, this.lumen);
    }
    await saveBridgeFeeder(this.datadir, this.bridgeConsumed);
    const identity = await loadIdentity(this.datadir);
    if (identity) {
      await persistIdentityLeaf(this.datadir, identity, this.keypair);
    }
  }

  /** Replace/upsert a Lumen module source and persist beside the chain. */
  async saveLumenSource(source: string): Promise<PersistedLumenBundle> {
    const { upsertLumenModule } = await import("../lumen/persist");
    this.lumen = upsertLumenModule(
      this.lumen ?? { v: 1, updatedAt: 0, activeName: "", modules: [] },
      source,
    );
    await saveLumenModules(this.datadir, this.lumen);
    return this.lumen;
  }

  private queuePersist(): void {
    if (this.persistQueued) return;
    this.persistQueued = true;
    setTimeout(() => {
      this.persistQueued = false;
      void this.persist();
    }, 50);
  }

  /** Mutex queue for tip / pending / registry mutations. */
  private async withChainLock<T>(fn: () => Promise<T>): Promise<T> {
    const prev = this.chainLock;
    let release!: () => void;
    this.chainLock = new Promise<void>((resolve) => {
      release = resolve;
    });
    await prev;
    try {
      return await fn();
    } finally {
      release();
    }
  }

  private noteTipProgress() {
    const tip = this.chain.pixels.length - 1;
    if (tip !== this.lastTipIndex) {
      this.lastTipIndex = tip;
      this.lastTipChangeAt = Date.now();
    }
  }

  private checkStall(stallMs: number) {
    const pending = this.chain.pending.length;
    if (pending === 0) return;
    const elected = nextSequencerAddress(this.chain, 0);
    const anchor = stallAnchorMs(this.chain);
    const silent = Date.now() - Math.max(this.lastTipChangeAt, anchor);
    if (elected !== this.keypair.address && silent > stallMs) {
      if (Date.now() - this.stallLoggedAt > stallMs) {
        this.stallLoggedAt = Date.now();
        console.warn(
          `[pixel-ledger] STALL: pending=${pending} elected=${elected.slice(0, 12)}… ` +
            `silent ${Math.round(silent / 1000)}s — trying Gate C skip illuminate`,
        );
        this.requestCatchUp(this.chain.pixels.length);
      }
      void this.trySequence(); // may skip-illuminate if we are next
    }
  }

  private requestCatchUp(from: number) {
    if (!this.gossip) return;
    this.gossip.broadcast({ type: "get_pixels", from });
  }

  async rpc(req: JsonRpcRequest) {
    return handlePixelRpc(
      {
        chain: this.chain,
        networkId: this.chain.networkId,
        clientVersion: "PixelLedger/0.4.0-gateF",
      },
      req,
    );
  }

  /**
   * Queue a membership record for the next pixel this node produces.
   *
   * Validated here against the same fold `acceptBlock` uses, so a record that could never
   * be committed is refused at the door rather than silently held forever. `includedAt`
   * must be the height this node is about to produce: it is signed, so it cannot be
   * adjusted afterwards, which means the caller has to know where the tip is — and that
   * is the honest shape of the thing, not an inconvenience to paper over.
   */
  async submitMembership(record: SequencerRecord): Promise<void> {
    return this.withChainLock(async () => {
      const nextIndex = this.chain.pixels.length;
      if (record.includedAt !== nextIndex) {
        throw new Error(
          `membership record is stamped for pixel #${record.includedAt} but the next pixel ` +
            `is #${nextIndex} — rebuild it for the current tip`,
        );
      }
      const problem = await sequencerRecordProblem(record, electableKeysAt(this.chain, nextIndex));
      if (problem) throw new Error(problem);
      if (
        this.pendingMembership.some((r) => r.address === record.address && r.kind === record.kind)
      ) {
        return;
      }
      this.pendingMembership.push(record);
      console.log(
        `[pixel-ledger] queued ${record.kind} for ${record.address.slice(0, 12)}… at #${nextIndex}`,
      );
    });
  }

  /** Records queued but not yet committed — for `/health` and operators. */
  membershipQueue(): SequencerRecord[] {
    return [...this.pendingMembership];
  }

  async submitTx(tx: Transaction): Promise<void> {
    return this.withChainLock(() => this.submitTxLocked(tx));
  }

  /**
   * Caller must hold `withChainLock` (or be the sole mutator).
   *
   * Everything that arrives from outside — HTTP `/tx` and the `tx` gossip message —
   * passes `admitTransaction` first. This used to append, gossip and persist on the
   * strength of a zod shape check alone, which made the public endpoint an
   * unauthenticated way to grow the volume holding the only copy of history. See
   * `mempool.ts` for the full admission order and why it is ordered that way.
   *
   * Rejections throw. Callers turn that into a 4xx (HTTP) or a peer score penalty
   * (gossip); nothing is stored, gossiped, or persisted on the way out.
   */
  private async submitTxLocked(tx: Transaction): Promise<void> {
    this.chain = await admitTransaction(this.chain, tx);
    this.gossip.broadcast({ type: "tx", tx });
    this.queuePersist();
  }

  async send(
    from: LightKeypair,
    outputs: TxOutput[],
    metadata: ReadableMeta,
  ): Promise<Transaction> {
    return this.withChainLock(async () => {
      const { state, tx } = await proposeTransfer(this.chain, from, outputs, metadata);
      this.chain = state;
      // OTS leaf advanced during sign — persist wallet cursor when named wallets are used.
      if (from.address === this.keypair.address) {
        this.keypair.nextLeaf = from.nextLeaf;
      }
      this.gossip.broadcast({ type: "tx", tx });
      this.queuePersist();
      await this.trySequenceLocked();
      return tx;
    });
  }

  /**
   * Lab tip faucet-bridge: USDC/ETH/wire lock → shine-in → PIX on a pay face.
   * Enabled only when PIXEL_BRIDGE_LAB=1 (not a mainnet bridge claim).
   */
  async labBridgeShineIn(params: {
    asset: "USDC" | "ETH" | "USD";
    humanUsd: number;
    ownerAddress: string;
    ownerLocalId: string;
  }): Promise<{
    pixCredited: number;
    tipIndex: number;
    balance: number;
    summary: string;
    canvasId: string | null;
  }> {
    const enabled = process.env.PIXEL_BRIDGE_LAB === "1" || process.env.PIXEL_BRIDGE_LAB === "true";
    if (!enabled) {
      throw new Error("PIXEL_BRIDGE_LAB not enabled on this tip");
    }
    return this.withChainLock(async () => {
      const { prepareWalletBridgeIngress, WALLET_BRIDGE_MAX_USD } =
        await import("../lib/pixel/wallet-bridge");
      const { LockFeeder } = await import("../lib/pixel/lock-feeder");
      const { illuminateIngress } = await import("../lib/pixel/worldlight");
      if (!(params.humanUsd > 0) || params.humanUsd > WALLET_BRIDGE_MAX_USD) {
        throw new Error(`humanUsd must be 0 < x ≤ ${WALLET_BRIDGE_MAX_USD}`);
      }
      const rail = LockFeeder.createRail();
      const feeder = LockFeeder.createState();
      const { prepared, receipt } = await prepareWalletBridgeIngress({
        asset: params.asset,
        humanUsd: params.humanUsd,
        ownerAddress: params.ownerAddress,
        ownerLocalId: params.ownerLocalId,
        rail,
        feeder,
      });
      const vaultBal = balanceOf(this.chain, this.keypair.address);
      if (vaultBal < prepared.pixCredit) {
        throw new Error(
          `bridge vault needs ${prepared.pixCredit} PIX (has ${vaultBal}) — tip escrow empty`,
        );
      }
      const res = await illuminateIngress({
        prepared,
        state: this.chain,
        bridgeVault: this.keypair,
        sequencer: this.keypair,
      });
      if (receipt) LockFeeder.consume(feeder, receipt.lockDigest);
      this.chain = res.state;
      const tip = this.chain.pixels[this.chain.pixels.length - 1]!;
      this.gossip?.broadcast({ type: "pixel", pixel: tip });
      this.noteTipProgress();
      this.fanoutWave(tip, "sequence");
      this.queuePersist();
      const snap = this.syncSnapshot();
      return {
        pixCredited: res.pixCredited,
        tipIndex: tip.index,
        balance: balanceOf(this.chain, params.ownerAddress),
        summary: res.summary,
        canvasId: snap.canvasId,
      };
    });
  }

  /**
   * Agnostic EVM shine-in: verify PixelUsdcLock.Locked on configured eth RPC,
   * then illuminate PIX on this tip. Set PIXEL_EVM_LOCK + PIXEL_EVM_RPC
   * (legacy PIXEL_USDC_LOCK_SEPOLIA still works). Lab open shine-in stays separate.
   */
  async shineInFromUsdcLockTx(params: {
    txHash: string;
    ownerAddress: string;
    ownerLocalId?: string;
  }): Promise<{
    pixCredited: number;
    tipIndex: number;
    balance: number;
    summary: string;
    canvasId: string | null;
    lockTx: string;
    humanUsd: number;
    plane: "shared_tip";
    chainKey: string;
  }> {
    const { readEvmBridgeConfig, verifyUsdcLockTx, lockReceiptFromParsed } =
      await import("../lib/pixel/eth-usdc-lock");
    const { WALLET_BRIDGE_MAX_USD } = await import("../lib/pixel/wallet-bridge");
    const cfg = readEvmBridgeConfig();
    if (!cfg) {
      throw new Error("EVM lock bridge not configured — set PIXEL_EVM_LOCK + PIXEL_EVM_RPC");
    }
    const { assertPixelAddress } = await import("../lib/pixel/crypto");
    assertPixelAddress(params.ownerAddress, "ownerAddress");

    const parsed = await verifyUsdcLockTx({
      ethRpcUrl: cfg.ethRpcUrl,
      txHash: params.txHash,
      lockContract: cfg.lockContract,
      expectedChainId: cfg.chainId,
      expectPixelRecipient: params.ownerAddress,
    });
    const humanUsd = Number(parsed.amountRaw) / 1e6;
    if (!(humanUsd > 0) || humanUsd > WALLET_BRIDGE_MAX_USD) {
      throw new Error(`lock amount must be 0 < x ≤ $${WALLET_BRIDGE_MAX_USD}`);
    }
    const digest = parsed.lockDigest.replace(/^0x/, "").toLowerCase();
    if (this.bridgeConsumed.has(digest)) {
      throw new Error("lock already shone in — no double credit");
    }

    return this.withChainLock(async () => {
      if (this.bridgeConsumed.has(digest)) {
        throw new Error("lock already shone in — no double credit");
      }
      const { LockFeeder } = await import("../lib/pixel/lock-feeder");
      const { illuminateIngress } = await import("../lib/pixel/worldlight");
      const receipt = lockReceiptFromParsed(parsed, cfg.chainId);
      const feeder = LockFeeder.createState();
      for (const d of this.bridgeConsumed) feeder.consumed.add(d);

      const prepared = await LockFeeder.feed({
        receipt,
        ownerLocalId: (params.ownerLocalId ?? "phone").slice(0, 64),
        feeder,
        ethereumLogVerified: true,
      });
      const vaultBal = balanceOf(this.chain, this.keypair.address);
      if (vaultBal < prepared.pixCredit) {
        throw new Error(
          `bridge vault needs ${prepared.pixCredit} PIX (has ${vaultBal}) — tip escrow empty`,
        );
      }
      const res = await illuminateIngress({
        prepared,
        state: this.chain,
        bridgeVault: this.keypair,
        sequencer: this.keypair,
      });
      LockFeeder.consume(feeder, receipt.lockDigest);
      this.bridgeConsumed.add(digest);
      this.chain = res.state;
      const tip = this.chain.pixels[this.chain.pixels.length - 1]!;
      this.gossip?.broadcast({ type: "pixel", pixel: tip });
      this.noteTipProgress();
      this.fanoutWave(tip, "sequence");
      this.queuePersist();
      const snap = this.syncSnapshot();
      return {
        pixCredited: res.pixCredited,
        tipIndex: tip.index,
        balance: balanceOf(this.chain, params.ownerAddress),
        summary: `${res.summary} · ${cfg.chainName} lock ${parsed.txHash.slice(0, 10)}…`,
        canvasId: snap.canvasId,
        lockTx: parsed.txHash,
        humanUsd,
        plane: "shared_tip" as const,
        chainKey: cfg.chainKey,
      };
    });
  }

  /**
   * Lab tip faucet — fund a new pay face so friends can send/bridge demos.
   * PIXEL_FAUCET=1 or PIXEL_BRIDGE_LAB=1. Skips if already funded ≥ amount.
   */
  async faucetPayFace(params: { address: string; amount?: number }): Promise<{
    funded: number;
    balance: number;
    tipIndex: number;
    skipped: boolean;
    summary: string;
  }> {
    const enabled =
      process.env.PIXEL_FAUCET === "1" ||
      process.env.PIXEL_FAUCET === "true" ||
      process.env.PIXEL_BRIDGE_LAB === "1" ||
      process.env.PIXEL_BRIDGE_LAB === "true";
    if (!enabled) {
      throw new Error("PIXEL_FAUCET / PIXEL_BRIDGE_LAB not enabled on this tip");
    }
    const amount = Math.min(Math.max(1, Math.floor(params.amount ?? 10)), 50);
    const { assertPixelAddress } = await import("../lib/pixel/crypto");
    assertPixelAddress(params.address, "faucet address");
    return this.withChainLock(async () => {
      const have = balanceOf(this.chain, params.address);
      if (have >= amount) {
        return {
          funded: 0,
          balance: have,
          tipIndex: this.chain.pixels.length - 1,
          skipped: true,
          summary: `already funded (${have} PIX)`,
        };
      }
      const need = amount - have;
      const vaultBal = balanceOf(this.chain, this.keypair.address);
      if (vaultBal < need) {
        throw new Error(`faucet vault needs ${need} PIX (has ${vaultBal})`);
      }
      const spoken = await proposeTransfer(
        this.chain,
        this.keypair,
        [{ address: params.address, amount: need }],
        {
          description: `faucet ${need} PIX → pay face`,
          recipientLabel: "faucet",
          reference: `FAUCET-${params.address.slice(0, 18)}`,
        },
      );
      this.chain = await sequenceBlock(spoken.state, this.keypair);
      const tip = this.chain.pixels[this.chain.pixels.length - 1]!;
      this.gossip?.broadcast({ type: "pixel", pixel: tip });
      this.noteTipProgress();
      this.fanoutWave(tip, "sequence");
      this.queuePersist();
      const bal = balanceOf(this.chain, params.address);
      return {
        funded: need,
        balance: bal,
        tipIndex: tip.index,
        skipped: false,
        summary: `fauceted ${need} PIX → ${params.address.slice(0, 20)}… (tip #${tip.index})`,
      };
    });
  }

  async trySequence(): Promise<boolean> {
    return this.withChainLock(() => this.trySequenceLocked());
  }

  private async trySequenceLocked(): Promise<boolean> {
    if (this.chain.pending.length === 0) return false;
    const skip = skipCountForAddress(this.chain, this.keypair.address);
    if (skip === null) return false;
    if (skip > 0) {
      const ready = Date.now() >= stallAnchorMs(this.chain) + POLS_STALL_MS;
      if (!ready) return false;
    } else if (nextSequencerAddress(this.chain, 0) !== this.keypair.address) {
      return false;
    }
    // Records are stamped with the height they are included at, and that height is
    // signed, so a record built for one pixel cannot be carried into another. Re-stamping
    // is not possible without the signers, so a record that misses its slot is dropped
    // and must be rebuilt — which is correct: it was authorised for a specific height.
    const nextIndex = this.chain.pixels.length;
    const membership = this.pendingMembership.filter((r) => r.includedAt === nextIndex);
    try {
      this.chain = await sequenceBlock(this.chain, this.keypair, {
        skipCount: skip,
        membership: membership.length > 0 ? membership : undefined,
      });
      const pixel = this.chain.pixels[this.chain.pixels.length - 1]!;
      if (membership.length > 0) {
        this.pendingMembership = this.pendingMembership.filter((r) => !membership.includes(r));
        for (const r of membership) {
          console.log(
            `[pixel-ledger] committed ${r.kind} for ${r.address.slice(0, 12)}… in pixel #${pixel.index}` +
              ` (active at #${pixel.index + MEMBERSHIP_ACTIVATION_DELAY})`,
          );
        }
      }
      this.gossip.broadcast({ type: "pixel", pixel });
      this.noteTipProgress();
      this.fanoutWave(pixel, "sequence");
      this.queuePersist();
      console.log(
        `[pixel-ledger] illuminated pixel #${pixel.index}` + (skip > 0 ? ` (skip=${skip})` : ""),
      );
      return true;
    } catch (err) {
      console.error("[pixel-ledger] sequence failed", err);
      return false;
    }
  }

  private async acceptPixels(pixels: typeof this.chain.pixels): Promise<number> {
    let n = 0;
    for (const pixel of pixels) {
      if (pixel.index < this.chain.pixels.length) continue;
      if (pixel.index > this.chain.pixels.length) {
        // Gap — ask for fill from our tip
        this.requestCatchUp(this.chain.pixels.length);
        break;
      }
      try {
        // No "learn producer before accept" here any more. That line registered a
        // block's *claimed* producer into the local registry before validating the
        // block, and acceptBlock then checked the block's electable set against that
        // just-poisoned registry — so a stranger who ground one keypair until it won
        // the lottery could extend the tip, mint the light reward, and become
        // permanently electable, with verifyChain returning true afterwards.
        //
        // The electable set is now folded from history inside acceptBlock, so there
        // is nothing to learn and nothing to poison. Producer keys are still noted
        // *after* acceptance, for display only.
        this.chain = await acceptBlock(this.chain, pixel);
        this.chain = noteSequencerKey(this.chain, {
          address: pixel.lightProof.sequencerAddress,
          publicKey: pixel.lightProof.sequencerPublicKey,
        });
        n++;
        this.noteTipProgress();
        this.fanoutWave(pixel, "accept");
        console.log(`[pixel-ledger] accepted pixel #${pixel.index} from peer`);
      } catch (err) {
        console.error("[pixel-ledger] reject pixel", err);
        break;
      }
    }
    if (n) this.queuePersist();
    // Replies are paged now, so a full page almost certainly means there is more
    // behind it. Asking again immediately keeps catch-up at wire speed instead of
    // one page per 5s catch-up tick — paging must bound the reply, not the sync.
    if (n > 0 && pixels.length > 1) {
      this.requestCatchUp(this.chain.pixels.length);
    }
    return n;
  }

  async onPeerMessage(msg: PeerMessage, peerUrl: string): Promise<void> {
    const run = async () => {
      switch (msg.type) {
        case "hello": {
          let learned = false;
          let helloOk = false;
          if (msg.publicKey && msg.helloSig) {
            helloOk = await verifyHelloAuth({
              address: msg.address,
              publicKey: msg.publicKey,
              tip: msg.tip,
              tipHash: msg.tipHash,
              gossipUrl: msg.gossipUrl,
              signature: msg.helloSig,
            });
          }
          notePeerHello(this.peerBook, peerUrl, {
            address: msg.address,
            publicKey: (msg.publicKey ?? "") as typeof this.keypair.publicKey,
            tip: msg.tip,
            tipHash: msg.tipHash as typeof this.keypair.publicKey,
            helloOk,
          });
          // Register peer identity when hello verifies; also accept unsigned lab peers
          // that already carry a pubkey (OTS mesh bootstrap before all nodes sign).
          if (msg.publicKey && (helloOk || !msg.helloSig)) {
            const before = this.chain.sequencers.length;
            this.chain = registerSequencer(this.chain, {
              address: msg.address,
              publicKey: msg.publicKey,
            });
            learned = this.chain.sequencers.length > before;
          }
          // Bounded: a hello is display metadata, not authority, but an unbounded
          // array is still a bucket of someone else's memory. The wire schema caps
          // it too; this is the belt to that braces.
          for (const s of (msg.sequencers ?? []).slice(0, MAX_HELLO_SEQUENCERS)) {
            const before = this.chain.sequencers.length;
            this.chain = registerSequencer(this.chain, s);
            if (this.chain.sequencers.length > before) learned = true;
          }
          if (learned) {
            this.queuePersist();
            // Flood updated registry so electable sets converge across the hub mesh.
            this.gossip.announce();
          }
          // Headers-first probe when behind, then bodies.
          if (msg.tip > this.chain.pixels.length - 1) {
            const gate = shouldAcceptTipFromPeer(this.peerBook, peerUrl, {
              tip: msg.tip,
              tipHash: msg.tipHash,
            });
            if (gate.accept) {
              this.gossip.sendTo(peerUrl, {
                type: "get_headers",
                from: this.chain.pixels.length,
              });
              this.gossip.sendTo(peerUrl, {
                type: "get_pixels",
                from: this.chain.pixels.length,
              });
            } else {
              punishPeer(this.peerBook, peerUrl, 2);
            }
          } else if (msg.tip < this.chain.pixels.length - 1) {
            const headers = extractHeaders(
              this.chain.pixels.slice(msg.tip + 1, msg.tip + 1 + MAX_PIXELS_PER_MESSAGE),
            );
            if (headers.length) {
              this.gossip.sendTo(peerUrl, { type: "headers", headers });
            }
            const { page } = pixelPage(this.chain.pixels, msg.tip + 1);
            if (page.length) {
              this.gossip.sendTo(peerUrl, { type: "pixels", pixels: page });
            }
          }
          const dial = msg.gossipUrl;
          if (dial?.startsWith("ws")) {
            const peers = await loadPeers(this.datadir);
            if (!peers.includes(dial)) {
              await savePeers(this.datadir, [...peers, dial]);
            }
            this.gossip.addPeer(dial);
          } else if (peerUrl.startsWith("ws")) {
            const peers = await loadPeers(this.datadir);
            if (!peers.includes(peerUrl)) {
              await savePeers(this.datadir, [...peers, peerUrl]);
            }
          }
          break;
        }
        case "tx":
          // Already under withChainLock — do not call submitTx (re-entrant deadlock).
          //
          // A peer that relays junk is not a protocol error, it is a peer worth
          // trusting less. Refusing without throwing keeps one bad transaction from
          // tearing down a session that is otherwise serving us history, while the
          // score still walks a persistent offender out.
          try {
            await this.submitTxLocked(msg.tx);
          } catch (err) {
            if (err instanceof MempoolRejected) {
              // `duplicate` means the peer told us something we already knew, which
              // is ordinary gossip and not misbehaviour.
              if (err.code !== "duplicate") {
                punishPeer(this.peerBook, peerUrl, 2);
                console.warn(`[pixel-ledger] refused gossiped tx (${err.code}): ${err.message}`);
              }
            } else {
              throw err;
            }
          }
          break;
        case "pixel": {
          const tip = this.chain.pixels[this.chain.pixels.length - 1];
          if (tip && msg.pixel.index === tip.index) {
            const replaced = await replaceTipIfBetter(this.chain, msg.pixel);
            if (replaced) {
              this.chain = replaced;
              this.noteTipProgress();
              const tip = this.chain.pixels[this.chain.pixels.length - 1]!;
              this.fanoutWave(tip, "replace");
              this.queuePersist();
              console.log(`[pixel-ledger] tip replaced at #${msg.pixel.index} (fork-choice)`);
            }
            break;
          }
          // A competing pixel at or below our height is a fork deeper than one, and
          // depth-1 replacement cannot reach it. Ask for the peer's whole branch so
          // `considerBranch` can score it — this is the message that used to be dropped,
          // leaving two honest nodes split forever after a two-pixel partition.
          if (tip && msg.pixel.index < tip.index) {
            this.requestCatchUp(0);
            break;
          }
          await this.acceptPixels([msg.pixel]);
          break;
        }
        case "get_pixels": {
          // Paged. An unbounded reply is a resource the *asker* controls: one
          // request should not make us serialize the whole chain into a single
          // frame while we answer nobody else. The joiner keeps asking from its
          // new tip, which is what catch-up already does.
          const { page } = pixelPage(this.chain.pixels, msg.from);
          if (page.length) {
            this.gossip.sendTo(peerUrl, { type: "pixels", pixels: page });
          }
          break;
        }
        case "get_headers": {
          const headers = extractHeaders(
            this.chain.pixels.slice(msg.from, msg.from + MAX_PIXELS_PER_MESSAGE),
          );
          if (headers.length) {
            this.gossip.sendTo(peerUrl, { type: "headers", headers });
          }
          break;
        }
        case "headers": {
          const trusted = this.chain.sequencers.map((s) => s.address);
          const check = await verifyHeaderChain(msg.headers, trusted.length ? trusted : undefined);
          if (check.ok) {
            rewardPeer(this.peerBook, peerUrl, 2);
          } else {
            punishPeer(this.peerBook, peerUrl, 4);
            console.warn(`[pixel-ledger] reject headers from peer: ${check.reason}`);
          }
          break;
        }
        case "pixels": {
          // A batch starting at genesis is a whole branch, so it can be scored against
          // ours at any depth. Anything else is a forward extension and takes the
          // sequential path, which is cheaper and is the overwhelmingly common case.
          const first = msg.pixels[0];
          if (first && first.index === 0 && msg.pixels.length > this.chain.pixels.length) {
            const outcome = await considerBranch({ state: this.chain, theirs: msg.pixels });
            if (outcome.kind === "reorged") {
              this.chain = outcome.state;
              this.noteTipProgress();
              this.fanoutWave(this.chain.pixels[this.chain.pixels.length - 1]!, "replace");
              this.queuePersist();
              console.warn(
                `[pixel-ledger] REORG: dropped ${outcome.dropped} pixel(s) from #${
                  outcome.forkHeight + 1
                }, applied ${outcome.applied} — now at #${this.chain.pixels.length - 1}`,
              );
              rewardPeer(this.peerBook, peerUrl, 1);
              break;
            }
            if (outcome.kind === "extended") {
              this.chain = outcome.state;
              this.noteTipProgress();
              this.fanoutWave(this.chain.pixels[this.chain.pixels.length - 1]!, "accept");
              this.queuePersist();
              console.log(`[pixel-ledger] extended ${outcome.applied} pixel(s) from peer branch`);
              rewardPeer(this.peerBook, peerUrl, 1);
              break;
            }
            if (outcome.kind === "refused") {
              // Refusing a branch is a judgement about the peer, not just about the data.
              punishPeer(this.peerBook, peerUrl, 3);
              console.warn(`[pixel-ledger] refused peer branch: ${outcome.reason}`);
              break;
            }
            // `ignored` — our branch is preferred. Ordinary, and not the peer's fault.
            break;
          }
          await this.acceptPixels(msg.pixels);
          rewardPeer(this.peerBook, peerUrl, 1);
          break;
        }
        default:
          break;
      }
    };
    return this.withChainLock(run);
  }

  balance(address: string): number {
    return balanceOf(this.chain, address);
  }

  async verify(): Promise<boolean> {
    return verifyChain(this.chain);
  }

  async ensureWallet(name: string): Promise<LightKeypair> {
    const existing = await loadWallet(this.datadir, name);
    if (existing) return existing;
    const { generatePixelKeypair } = await import("../lib/pixel/index");
    const kp = await generatePixelKeypair();
    await saveWallet(this.datadir, name, kp);
    return kp;
  }
}
