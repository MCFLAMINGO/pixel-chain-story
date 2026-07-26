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
} from "../lib/pixel/index";
import { createBunGossip } from "./gossip-bun";
import type { GossipNet, PeerMessage } from "./p2p";
import {
  ensureDatadir,
  loadChain,
  loadIdentity,
  loadOrCreateIdentity,
  loadPeers,
  loadWallet,
  persistIdentityLeaf,
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
      this.chain = registerSequencer(existing, keypair);
    } else {
      this.chain = await createGenesis(keypair);
    }
    this.lastTipIndex = this.chain.pixels.length - 1;
    this.lastTipChangeAt = Date.now();
    this.lumen = await loadOrSeedLumenModules(this.datadir, TRANSFER_LUMEN);
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

  async submitTx(tx: Transaction): Promise<void> {
    return this.withChainLock(() => this.submitTxLocked(tx));
  }

  /** Caller must hold `withChainLock` (or be the sole mutator). */
  private async submitTxLocked(tx: Transaction): Promise<void> {
    if (this.chain.pending.some((p) => p.txid === tx.txid)) return;
    this.chain = {
      ...this.chain,
      pending: [...this.chain.pending, tx],
      pendingSince:
        this.chain.pending.length === 0 ? Date.now() : (this.chain.pendingSince ?? Date.now()),
    };
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
    try {
      this.chain = await sequenceBlock(this.chain, this.keypair, { skipCount: skip });
      const pixel = this.chain.pixels[this.chain.pixels.length - 1]!;
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
        // Learn producer before accept — electable ⊆ registry requires it.
        this.chain = registerSequencer(this.chain, {
          address: pixel.lightProof.sequencerAddress,
          publicKey: pixel.lightProof.sequencerPublicKey,
        });
        this.chain = await acceptBlock(this.chain, pixel);
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
          for (const s of msg.sequencers ?? []) {
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
            const headers = extractHeaders(this.chain.pixels.slice(msg.tip + 1));
            if (headers.length) {
              this.gossip.sendTo(peerUrl, { type: "headers", headers });
            }
            const slice = this.chain.pixels.slice(msg.tip + 1);
            if (slice.length) {
              this.gossip.sendTo(peerUrl, { type: "pixels", pixels: slice });
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
          await this.submitTxLocked(msg.tx);
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
          await this.acceptPixels([msg.pixel]);
          break;
        }
        case "get_pixels": {
          const slice = this.chain.pixels.slice(msg.from);
          if (slice.length) {
            this.gossip.sendTo(peerUrl, { type: "pixels", pixels: slice });
          }
          break;
        }
        case "get_headers": {
          const headers = extractHeaders(this.chain.pixels.slice(msg.from));
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
        case "pixels":
          await this.acceptPixels(msg.pixels);
          rewardPeer(this.peerBook, peerUrl, 1);
          break;
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
