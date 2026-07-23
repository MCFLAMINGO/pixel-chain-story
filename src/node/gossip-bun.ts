// @ts-nocheck — Bun runtime file, not typechecked in app build
/**
 * Bun WebSocket gossip — Gate B hardened + optional ML-KEM wire.
 *
 * - Reconnect with backoff to seed peers
 * - Unicast sendTo for catch-up (get_pixels → pixels)
 * - Receive/broadcast dedupe (dual-link safe)
 * - Gate F: optional signed hello via getHelloAuth
 * - PIXEL_TRANSPORT_KEM=1: sealed tx/pixel/headers after kem_session
 */

import type { SequencerId } from "../lib/pixel/index";
import {
  establishSessionAsInitiator,
  establishSessionAsResponder,
  openFrameText,
  sealFrame,
  TRANSPORT_KEM,
  type KemKeypair,
} from "../lib/pixel/transport-kem";
import type { GossipNet, MessageHandler, PeerMessage } from "./p2p";

interface PeerSock {
  url: string;
  ws: WebSocket;
  outbound: boolean;
  peerAddress?: string;
  peerKemPk?: string;
  aeadKey?: Uint8Array;
  /** Queued app messages until session ready (KEM mode only) */
  pending: PeerMessage[];
}

const PLAIN_ALWAYS = new Set(["hello", "kem_session", "ping", "pong", "get_pixels", "get_headers"]);

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
  /** Gate F — signature over tip claim */
  getHelloAuth?: () => { helloSig: string } | null;
  /** Opt-in PQ transport identity — when set, seal application frames */
  transportKem?: KemKeypair;
  onMessage: MessageHandler;
  seeds?: string[];
}): GossipNet & { server: ReturnType<typeof Bun.serve>; transportKemEnabled: boolean } {
  const peers = new Map<string, PeerSock>();
  const seen = new Set<string>();
  const reconnectAttempt = new Map<string, number>();
  const advertiseHost = opts.advertiseHost ?? "127.0.0.1";
  const localUrl = `ws://${advertiseHost}:${opts.port}/gossip`;
  const kem = opts.transportKem;
  const kemOn = Boolean(kem);

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
          pending: [],
        });
        ws.send(JSON.stringify(helloMsg()));
      },
      message(ws, message) {
        const data = ws.data as { url: string };
        try {
          void handleRaw(data.url, String(message));
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
    const auth = opts.getHelloAuth?.() ?? null;
    const msg: PeerMessage = {
      type: "hello",
      nodeId: opts.nodeId,
      address: opts.address,
      tip: tip.height,
      tipHash: tip.hash,
      gossipUrl: localUrl,
      publicKey: opts.publicKey,
      sequencers: opts.getSequencers?.() ?? [],
      helloSig: auth?.helloSig,
    };
    if (kem) {
      msg.kemPublicKey = kem.publicKey;
      msg.kemScheme = TRANSPORT_KEM;
    }
    return msg;
  }

  function rawSend(peer: PeerSock, msg: PeerMessage) {
    if (peer.ws.readyState !== WebSocket.OPEN) return;
    try {
      peer.ws.send(JSON.stringify(msg));
    } catch {
      /* ignore */
    }
  }

  function sendApp(peer: PeerSock, msg: PeerMessage) {
    if (!kemOn || PLAIN_ALWAYS.has(msg.type)) {
      rawSend(peer, msg);
      return;
    }
    if (!peer.aeadKey) {
      peer.pending.push(msg);
      return;
    }
    const frame = sealFrame(peer.aeadKey, JSON.stringify(msg));
    rawSend(peer, {
      type: "sealed",
      nonce: frame.nonce,
      ciphertext: frame.ciphertext,
      kemScheme: TRANSPORT_KEM,
    });
  }

  function flushPending(peer: PeerSock) {
    if (!peer.aeadKey || peer.pending.length === 0) return;
    const q = peer.pending.splice(0, peer.pending.length);
    for (const m of q) sendApp(peer, m);
  }

  function maybeInitiateSession(peer: PeerSock) {
    if (!kem || !peer.peerKemPk || peer.aeadKey) return;
    // Deterministic initiator: lower address starts (avoids dual sessions).
    if (opts.address >= (peer.peerAddress ?? "")) return;
    const { kemCt, aeadKey } = establishSessionAsInitiator(peer.peerKemPk);
    peer.aeadKey = aeadKey;
    rawSend(peer, {
      type: "kem_session",
      kemCt,
      fromAddress: opts.address,
      kemScheme: TRANSPORT_KEM,
    });
    flushPending(peer);
  }

  async function handleRaw(peerUrl: string, raw: string) {
    const wire = JSON.parse(raw) as PeerMessage;
    const peer = peers.get(peerUrl);
    if (!peer) return;

    if (wire.type === "sealed") {
      if (!peer.aeadKey) return;
      let inner: PeerMessage;
      try {
        inner = JSON.parse(openFrameText(peer.aeadKey, wire.nonce, wire.ciphertext)) as PeerMessage;
      } catch {
        console.error("gossip sealed open failed", peerUrl);
        return;
      }
      if (!shouldHandle(inner)) return;
      await opts.onMessage(inner, peerUrl);
      return;
    }

    if (wire.type === "kem_session") {
      if (!kem) return;
      if (peer.aeadKey) return;
      try {
        peer.aeadKey = establishSessionAsResponder(wire.kemCt, kem.secretKey);
        flushPending(peer);
      } catch (err) {
        console.error("kem_session failed", err);
      }
      return;
    }

    if (wire.type === "hello") {
      peer.peerAddress = wire.address;
      if (wire.kemPublicKey) peer.peerKemPk = wire.kemPublicKey;
      maybeInitiateSession(peer);
    }

    if (!shouldHandle(wire)) return;
    await opts.onMessage(wire, peerUrl);
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
        peers.set(url, { url, ws, outbound: true, pending: [] });
        ws.send(JSON.stringify(helloMsg()));
        console.log(`[pixel-ledger] gossip connected ${url}`);
      });
      ws.addEventListener("message", (ev) => {
        void handleRaw(url, String(ev.data));
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

  /** hello / get_pixels / get_headers are idempotent probes — always handle. */
  function shouldHandle(msg: PeerMessage): boolean {
    if (
      msg.type === "hello" ||
      msg.type === "get_pixels" ||
      msg.type === "get_headers" ||
      msg.type === "ping" ||
      msg.type === "pong" ||
      msg.type === "kem_session"
    ) {
      return true;
    }
    return remember(msg);
  }

  return {
    server,
    transportKemEnabled: kemOn,
    localGossipUrl: () => localUrl,
    announce() {
      const msg = helloMsg();
      for (const peer of peers.values()) {
        rawSend(peer, msg);
      }
    },
    broadcast(msg: PeerMessage) {
      if (
        msg.type !== "hello" &&
        msg.type !== "get_pixels" &&
        msg.type !== "get_headers" &&
        msg.type !== "ping" &&
        msg.type !== "pong" &&
        msg.type !== "kem_session" &&
        msg.type !== "sealed"
      ) {
        remember(msg);
      }
      for (const peer of peers.values()) {
        sendApp(peer, msg);
      }
    },
    sendTo(peerUrl: string, msg: PeerMessage) {
      const peer = peers.get(peerUrl);
      if (!peer) return;
      sendApp(peer, msg);
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
