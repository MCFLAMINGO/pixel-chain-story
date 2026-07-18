/**
 * Bun WebSocket gossip — Gate B hardened.
 *
 * - Reconnect with backoff to seed peers
 * - Unicast sendTo for catch-up (get_pixels → pixels)
 * - Receive/broadcast dedupe (dual-link safe)
 * Prototype limits: no peer auth, no DHT — fine for 2–N lab hosts, not production fabric.
 */

import type { SequencerId } from "../lib/pixel/index";
import type { GossipNet, MessageHandler, PeerMessage } from "./p2p";

interface PeerSock {
  url: string;
  ws: WebSocket;
  outbound: boolean;
}

export function createBunGossip(opts: {
  port: number;
  nodeId: string;
  address: string;
  publicKey?: string;
  /** Host others should use to dial us (VPS public IP/DNS). Default 127.0.0.1 */
  advertiseHost?: string;
  getTip: () => { height: number; hash: string };
  /** Current sequencer registry for hello gossip (electable convergence). */
  getSequencers?: () => SequencerId[];
  onMessage: MessageHandler;
  seeds?: string[];
}): GossipNet & { server: ReturnType<typeof Bun.serve> } {
  const peers = new Map<string, PeerSock>();
  const seen = new Set<string>();
  const reconnectAttempt = new Map<string, number>();
  const advertiseHost = opts.advertiseHost ?? "127.0.0.1";
  const localUrl = `ws://${advertiseHost}:${opts.port}/gossip`;

  const server = Bun.serve({
    port: opts.port,
    fetch(req, server) {
      const url = new URL(req.url);
      if (url.pathname === "/gossip") {
        if (server.upgrade(req, { data: { url: `inbound:${crypto.randomUUID()}` } })) {
          return undefined as unknown as Response;
        }
        return new Response("upgrade failed", { status: 500 });
      }
      return new Response("Pixel gossip — use /gossip WebSocket", { status: 200 });
    },
    websocket: {
      open(ws) {
        const data = ws.data as { url: string };
        peers.set(data.url, {
          url: data.url,
          ws: ws as unknown as WebSocket,
          outbound: false,
        });
        ws.send(JSON.stringify(helloMsg()));
      },
      message(ws, message) {
        const data = ws.data as { url: string };
        try {
          const msg = JSON.parse(String(message)) as PeerMessage;
          // Dedupe on receive — dual dial (inbound+outbound) otherwise double-delivers.
          if (!shouldHandle(msg)) return;
          void opts.onMessage(msg, data.url);
        } catch (err) {
          console.error("gossip parse error", err);
        }
      },
      close(ws) {
        const data = ws.data as { url: string };
        peers.delete(data.url);
      },
    },
  });

  function helloMsg(): PeerMessage {
    const tip = opts.getTip();
    return {
      type: "hello",
      nodeId: opts.nodeId,
      address: opts.address,
      tip: tip.height,
      tipHash: tip.hash,
      gossipUrl: localUrl,
      publicKey: opts.publicKey,
      sequencers: opts.getSequencers?.() ?? [],
    };
  }

  function scheduleReconnect(url: string) {
    const n = (reconnectAttempt.get(url) ?? 0) + 1;
    reconnectAttempt.set(url, n);
    const delay = Math.min(30_000, 1000 * 2 ** Math.min(n, 5));
    setTimeout(() => connect(url), delay);
  }

  function connect(url: string) {
    if (peers.has(url)) return;
    try {
      const ws = new WebSocket(url);
      ws.addEventListener("open", () => {
        reconnectAttempt.set(url, 0);
        peers.set(url, { url, ws, outbound: true });
        ws.send(JSON.stringify(helloMsg()));
        console.log(`[pixel-ledger] gossip connected ${url}`);
      });
      ws.addEventListener("message", (ev) => {
        try {
          const msg = JSON.parse(String(ev.data)) as PeerMessage;
          if (!shouldHandle(msg)) return;
          void opts.onMessage(msg, url);
        } catch (err) {
          console.error("gossip client parse", err);
        }
      });
      ws.addEventListener("close", () => {
        peers.delete(url);
        scheduleReconnect(url);
      });
      ws.addEventListener("error", () => {
        try {
          ws.close();
        } catch {
          /* ignore */
        }
      });
    } catch (err) {
      console.error("peer connect failed", url, err);
      scheduleReconnect(url);
    }
  }

  for (const seed of opts.seeds ?? []) {
    connect(seed);
  }

  function dedupeKey(msg: PeerMessage): string {
    if (msg.type === "pixel") return `pixel:${msg.pixel.hash}`;
    if (msg.type === "tx") return `tx:${msg.tx.txid}`;
    if (msg.type === "pixels") {
      return `pixels:${msg.pixels
        .map((p) => p.hash)
        .join("|")
        .slice(0, 160)}`;
    }
    return JSON.stringify(msg).slice(0, 160);
  }

  function remember(msg: PeerMessage): boolean {
    const key = dedupeKey(msg);
    if (seen.has(key)) return false;
    seen.add(key);
    if (seen.size > 4000) {
      const drop = [...seen].slice(0, 2000);
      for (const k of drop) seen.delete(k);
    }
    return true;
  }

  /** hello / get_pixels are idempotent probes — always handle; content msgs dedupe. */
  function shouldHandle(msg: PeerMessage): boolean {
    if (
      msg.type === "hello" ||
      msg.type === "get_pixels" ||
      msg.type === "ping" ||
      msg.type === "pong"
    ) {
      return true;
    }
    return remember(msg);
  }

  return {
    server,
    localGossipUrl: () => localUrl,
    announce() {
      const raw = JSON.stringify(helloMsg());
      for (const peer of peers.values()) {
        try {
          if (peer.ws.readyState === WebSocket.OPEN) peer.ws.send(raw);
        } catch {
          /* ignore */
        }
      }
    },
    broadcast(msg: PeerMessage) {
      // Mark seen so dual-link echoes are dropped on receive — do not gate the send
      // (receiver may call broadcast to relay after shouldHandle already remembered).
      if (
        msg.type !== "hello" &&
        msg.type !== "get_pixels" &&
        msg.type !== "ping" &&
        msg.type !== "pong"
      ) {
        remember(msg);
      }
      const raw = JSON.stringify(msg);
      for (const peer of peers.values()) {
        try {
          if (peer.ws.readyState === WebSocket.OPEN) peer.ws.send(raw);
        } catch {
          /* ignore */
        }
      }
    },
    sendTo(peerUrl: string, msg: PeerMessage) {
      const peer = peers.get(peerUrl);
      if (!peer || peer.ws.readyState !== WebSocket.OPEN) return;
      try {
        peer.ws.send(JSON.stringify(msg));
      } catch {
        /* ignore */
      }
    },
    addPeer(url: string) {
      connect(url);
    },
    peerCount: () => peers.size,
    peerUrls: () => [...peers.keys()],
    stop() {
      server.stop(true);
      for (const peer of peers.values()) {
        try {
          peer.ws.close();
        } catch {
          /* ignore */
        }
      }
      peers.clear();
    },
  };
}
