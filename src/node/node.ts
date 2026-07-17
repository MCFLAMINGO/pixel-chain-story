/**
 * Pixel Ledger node — persistent UTXO light ledger with PoLS sequencing.
 * Not a “blockchain node”: it paints and gossips illuminated pixels.
 */

import {
  acceptBlock,
  balanceOf,
  createGenesis,
  handlePixelRpc,
  nextSequencerAddress,
  proposeTransfer,
  registerSequencer,
  sequenceBlock,
  tipHash,
  verifyChain,
  type JsonRpcRequest,
  type LightKeypair,
  type PixelChainState,
  type ReadableMeta,
  type Transaction,
  type TxOutput,
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

export interface NodeOptions {
  datadir: string;
  rpcPort: number;
  gossipPort: number;
  seeds?: string[];
  label?: string;
  /** Auto-sequence when this node is elected and mempool nonempty */
  autoSequenceMs?: number;
}

export class PixelLedgerNode {
  datadir: string;
  chain!: PixelChainState;
  keypair!: LightKeypair;
  gossip!: GossipNet;
  private timer?: ReturnType<typeof setInterval>;
  private persistQueued = false;

  constructor(private opts: NodeOptions) {
    this.datadir = opts.datadir;
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
    await this.persist();

    const seeds = this.opts.seeds ?? (await loadPeers(this.datadir));
    this.gossip = createBunGossip({
      port: this.opts.gossipPort,
      nodeId: keypair.address.slice(0, 16),
      address: keypair.address,
      seeds,
      getTip: () => ({
        height: this.chain.pixels.length - 1,
        hash: tipHash(this.chain),
      }),
      onMessage: (msg, peer) => this.onPeerMessage(msg, peer),
    });

    const ms = this.opts.autoSequenceMs ?? 2000;
    this.timer = setInterval(() => {
      void this.trySequence();
    }, ms);

    console.log(`[pixel-ledger] node ${keypair.address}`);
    console.log(`[pixel-ledger] pixels=${this.chain.pixels.length} datadir=${this.datadir}`);
    console.log(`[pixel-ledger] gossip ws://127.0.0.1:${this.opts.gossipPort}/gossip`);
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.gossip?.stop();
  }

  async persist(): Promise<void> {
    await saveChain(this.datadir, this.chain);
    const identity = await loadIdentity(this.datadir);
    if (identity) {
      await persistIdentityLeaf(this.datadir, identity, this.keypair);
    }
  }

  private queuePersist(): void {
    if (this.persistQueued) return;
    this.persistQueued = true;
    setTimeout(() => {
      this.persistQueued = false;
      void this.persist();
    }, 50);
  }

  async rpc(req: JsonRpcRequest) {
    return handlePixelRpc(
      {
        chain: this.chain,
        networkId: this.chain.networkId,
        clientVersion: "PixelLedger/0.2.0",
      },
      req,
    );
  }

  async submitTx(tx: Transaction): Promise<void> {
    if (this.chain.pending.some((p) => p.txid === tx.txid)) return;
    this.chain = { ...this.chain, pending: [...this.chain.pending, tx] };
    this.gossip.broadcast({ type: "tx", tx });
    this.queuePersist();
  }

  async send(
    from: LightKeypair,
    outputs: TxOutput[],
    metadata: ReadableMeta,
  ): Promise<Transaction> {
    const { state, tx } = await proposeTransfer(this.chain, from, outputs, metadata);
    this.chain = state;
    // OTS leaf advanced during sign — persist wallet cursor when named wallets are used.
    if (from.address === this.keypair.address) {
      this.keypair.nextLeaf = from.nextLeaf;
    }
    this.gossip.broadcast({ type: "tx", tx });
    this.queuePersist();
    await this.trySequence();
    return tx;
  }

  async trySequence(): Promise<boolean> {
    if (this.chain.pending.length === 0) return false;
    const elected = nextSequencerAddress(this.chain);
    if (elected !== this.keypair.address) return false;
    try {
      this.chain = await sequenceBlock(this.chain, this.keypair);
      const pixel = this.chain.pixels[this.chain.pixels.length - 1];
      this.gossip.broadcast({ type: "pixel", pixel });
      this.queuePersist();
      console.log(`[pixel-ledger] illuminated pixel #${pixel.index}`);
      return true;
    } catch (err) {
      console.error("[pixel-ledger] sequence failed", err);
      return false;
    }
  }

  async onPeerMessage(msg: PeerMessage, peerUrl: string): Promise<void> {
    switch (msg.type) {
      case "hello": {
        if (msg.tip > this.chain.pixels.length - 1) {
          this.gossip.broadcast({
            type: "get_pixels",
            from: this.chain.pixels.length,
          });
        }
        if (peerUrl.startsWith("ws")) {
          const peers = await loadPeers(this.datadir);
          if (!peers.includes(peerUrl)) {
            await savePeers(this.datadir, [...peers, peerUrl]);
          }
        }
        break;
      }
      case "tx":
        await this.submitTx(msg.tx);
        break;
      case "pixel":
        try {
          if (msg.pixel.index === this.chain.pixels.length) {
            this.chain = await acceptBlock(this.chain, msg.pixel);
            this.queuePersist();
            console.log(`[pixel-ledger] accepted pixel #${msg.pixel.index} from peer`);
          }
        } catch (err) {
          console.error("[pixel-ledger] reject pixel", err);
        }
        break;
      case "get_pixels": {
        const slice = this.chain.pixels.slice(msg.from);
        if (slice.length) this.gossip.broadcast({ type: "pixels", pixels: slice });
        break;
      }
      case "pixels": {
        for (const pixel of msg.pixels) {
          if (pixel.index === this.chain.pixels.length) {
            try {
              this.chain = await acceptBlock(this.chain, pixel);
            } catch {
              break;
            }
          }
        }
        this.queuePersist();
        break;
      }
      default:
        break;
    }
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
    const { generateLightKeypair } = await import("../lib/pixel/index");
    const kp = await generateLightKeypair();
    await saveWallet(this.datadir, name, kp);
    return kp;
  }
}
