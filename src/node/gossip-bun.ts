/**
 * Bun WebSocket gossip implementation.
 *
 * Prototype limits (honest): no peer auth, no discovery DHT, dedupe is best-effort,
 * missed messages have limited catch-up via get_pixels. Fine for 2–3 local processes;
 * not a production network fabric.
 */

import type { GossipNet, MessageHandler, PeerMessage } from "./p2p";

interface PeerSock {
  url: string;
  ws: WebSocket;
}

export function createBunGossip(opts: {
  port: number;
  nodeId: string;
  address: string;
  getTip: () => { height: number; hash: string };
  onMessage: MessageHandler;
  seeds?: string[];
}): GossipNet & { server: ReturnType<typeof Bun.serve> } {
  const peers = new Map<string, PeerSock>();
  const seen = new Set<string>();

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
        peers.set(data.url, { url: data.url, ws: ws as unknown as WebSocket });
        const tip = opts.getTip();
        ws.send(
          JSON.stringify({
            type: "hello",
            nodeId: opts.nodeId,
            address: opts.address,
            tip: tip.height,
            tipHash: tip.hash,
          } satisfies PeerMessage),
        );
      },
      message(ws, message) {
        const data = ws.data as { url: string };
        try {
          const msg = JSON.parse(String(message)) as PeerMessage;
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

  function connect(url: string) {
    if (peers.has(url)) return;
    try {
      const ws = new WebSocket(url);
      ws.addEventListener("open", () => {
        peers.set(url, { url, ws });
        const tip = opts.getTip();
        ws.send(
          JSON.stringify({
            type: "hello",
            nodeId: opts.nodeId,
            address: opts.address,
            tip: tip.height,
            tipHash: tip.hash,
          } satisfies PeerMessage),
        );
      });
      ws.addEventListener("message", (ev) => {
        try {
          const msg = JSON.parse(String(ev.data)) as PeerMessage;
          void opts.onMessage(msg, url);
        } catch (err) {
          console.error("gossip client parse", err);
        }
      });
      ws.addEventListener("close", () => {
        peers.delete(url);
        setTimeout(() => connect(url), 3000);
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
    }
  }

  for (const seed of opts.seeds ?? []) {
    connect(seed);
  }

  return {
    server,
    broadcast(msg: PeerMessage) {
      const key = JSON.stringify(msg).slice(0, 120);
      if (seen.has(key)) return;
      seen.add(key);
      if (seen.size > 2000) seen.clear();
      const raw = JSON.stringify(msg);
      for (const peer of peers.values()) {
        try {
          if (peer.ws.readyState === WebSocket.OPEN) peer.ws.send(raw);
        } catch {
          /* ignore */
        }
      }
    },
    addPeer(url: string) {
      connect(url);
    },
    peerCount: () => peers.size,
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
