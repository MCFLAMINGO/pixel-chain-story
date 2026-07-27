/**
 * Pixel Ledger Discord invite bot — tip proof + friend pack.
 * Phone = /wallet only. Never sells pixel init.
 *
 * Env:
 *   DISCORD_BOT_TOKEN   — Bot token from Developer Portal
 *   DISCORD_APP_ID      — Application ID (for command registration)
 *   DISCORD_GUILD_ID    — optional; guild commands register instantly
 *   PIXEL_TIP_RPC       — default crowned public tip
 *   PIXEL_SITE_URL      — site origin for /wallet link
 *
 *   bun run discord:bot
 *   bun run discord:register
 */
import {
  CROWNED_GENESIS_PREFIX,
  CROWNED_NETWORK_ID,
  PUBLIC_TIP_RPC_DEFAULT,
  isCrownedGenesisHash,
} from "../lib/pixel/crowned-genesis";

const API = "https://discord.com/api/v10";
const TIP = (process.env.PIXEL_TIP_RPC?.trim() || PUBLIC_TIP_RPC_DEFAULT).replace(/\/$/, "");
const SITE = (
  process.env.PIXEL_SITE_URL?.trim() || "https://pixel-chain-story.lovable.app"
).replace(/\/$/, "");

export const FRIEND_PACK = `PIXEL — join the one tip (not your own chain)

Phone (everyone):
1. Open the site → /wallet
2. Add to Home Screen (Safari Share → Add to Home Screen)
3. Create wallet → Unlock → Fund tip (faucet) → Bridge USDC / Send PIX
4. Tip must show genesis starting with: ${CROWNED_GENESIS_PREFIX}
   Public tip: ${TIP}

Laptop / always-on friend (Second Satoshi — not phone):
  bun install
  bun run pixel -- join --peer ${TIP} --datadir ./data/friend --require-crowned
  bun run pixel -- node --datadir ./data/friend --rpc 8546 --gossip 9002

Confirm after join:
  genesis starts with ${CROWNED_GENESIS_PREFIX}
  networkId ${CROWNED_NETWORK_ID}

NEVER run: pixel init
That forges a private notebook, not Pixel.
Phone = wallet only. Laptop = joined node.`;

type TipHealth = {
  ok?: boolean;
  genesisHash?: string;
  networkId?: number;
  tip?: number;
  faucet?: boolean;
  bridgeLab?: boolean;
  address?: string;
};

export async function fetchTipHealth(rpc = TIP): Promise<TipHealth> {
  const r = await fetch(`${rpc}/health`, {
    headers: { accept: "application/json", "user-agent": "PixelLedgerDiscordBot/1.0" },
  });
  if (!r.ok) throw new Error(`tip /health HTTP ${r.status}`);
  return (await r.json()) as TipHealth;
}

export function tipStatusLines(h: TipHealth): string {
  const g = h.genesisHash ?? "";
  const crowned = isCrownedGenesisHash(g);
  return [
    crowned ? "✓ crowned Earth" : "✗ NOT crowned — refuse this tip",
    `genesis: ${g.slice(0, 16)}…`,
    `networkId: ${h.networkId ?? "?"}`,
    `tip height: ${h.tip ?? "?"}`,
    `sequencer: ${h.address ?? "?"}`,
    `faucet: ${h.faucet ? "on" : "off"} · bridgeLab: ${h.bridgeLab ? "on" : "off"}`,
    `rpc: ${TIP}`,
  ].join("\n");
}

type Interaction = {
  id: string;
  token: string;
  type: number;
  data?: { name?: string; type?: number; options?: { name: string; value?: string }[] };
};

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json" },
  });
}

export async function handlePixelCommand(name: string): Promise<{ content: string }> {
  if (name === "join") {
    return { content: "```\n" + FRIEND_PACK + "\n```" };
  }
  if (name === "wallet") {
    return {
      content:
        `**Phone = Personal Source only**\n` +
        `${SITE}/wallet\n` +
        `Hold · Send · Fund tip · Bridge\n` +
        `Confirm genesis \`${CROWNED_GENESIS_PREFIX}…\` · network \`${CROWNED_NETWORK_ID}\``,
    };
  }
  if (name === "tip") {
    try {
      const h = await fetchTipHealth();
      return { content: "```\n" + tipStatusLines(h) + "\n```" };
    } catch (e) {
      return { content: `Tip unreachable: ${e instanceof Error ? e.message : String(e)}` };
    }
  }
  return { content: "Unknown command. Try `/pixel join`, `/pixel tip`, `/pixel wallet`." };
}

/** Register guild or global slash command `/pixel`. */
export async function registerCommands(opts: {
  token: string;
  appId: string;
  guildId?: string;
}): Promise<void> {
  const body = [
    {
      name: "pixel",
      description: "Pixel Ledger — join crowned tip, tip status, phone wallet",
      options: [
        {
          type: 1,
          name: "join",
          description: "Friend pack: phone /wallet · laptop join tip · never init",
        },
        {
          type: 1,
          name: "tip",
          description: "Live crowned tip /health (genesis f1d193…)",
        },
        {
          type: 1,
          name: "wallet",
          description: "Phone wallet link — Personal Source only",
        },
      ],
    },
  ];
  const path = opts.guildId
    ? `/applications/${opts.appId}/guilds/${opts.guildId}/commands`
    : `/applications/${opts.appId}/commands`;
  const r = await fetch(`${API}${path}`, {
    method: "PUT",
    headers: {
      authorization: `Bot ${opts.token}`,
      "content-type": "application/json",
      "user-agent": "DiscordBot (https://github.com/MCFLAMINGO/pixel-chain-story, 1.0)",
    },
    body: JSON.stringify(body),
  });
  const text = await r.text();
  if (!r.ok) throw new Error(`register commands ${r.status}: ${text}`);
  console.log(`registered /pixel → ${opts.guildId ? "guild " + opts.guildId : "global"}`);
}

type GatewayHello = { op: number; d?: { heartbeat_interval?: number; resumes?: unknown } };
type GatewayDispatch = {
  op: number;
  t?: string;
  s?: number;
  d?: {
    interactions?: unknown;
    id?: string;
    token?: string;
    type?: number;
    data?: Interaction["data"];
  };
};

/** Gateway bot — receives INTERACTION_CREATE for /pixel. */
export async function runGatewayBot(token: string): Promise<void> {
  const gateway = (await fetch(`${API}/gateway/bot`, {
    headers: {
      authorization: `Bot ${token}`,
      "user-agent": "DiscordBot (https://github.com/MCFLAMINGO/pixel-chain-story, 1.0)",
    },
  }).then(async (r) => {
    if (!r.ok) throw new Error(`gateway/bot ${r.status}: ${await r.text()}`);
    return r.json();
  })) as { url: string };

  const wsUrl = `${gateway.url}/?v=10&encoding=json`;
  console.log(`[pixel-discord] connecting ${wsUrl}`);

  let hb: ReturnType<typeof setInterval> | undefined;
  let seq: number | null = null;
  const ws = new WebSocket(wsUrl);

  const identify = () => {
    ws.send(
      JSON.stringify({
        op: 2,
        d: {
          token,
          intents: 0, // slash interactions; no privileged intents
          properties: { os: "linux", browser: "pixel", device: "pixel" },
        },
      }),
    );
  };

  ws.addEventListener("message", async (ev) => {
    const msg = JSON.parse(String(ev.data)) as GatewayHello & GatewayDispatch;
    if (msg.s != null) seq = msg.s;
    if (msg.op === 10) {
      const interval = msg.d?.heartbeat_interval ?? 41_250;
      const sendHb = () => ws.send(JSON.stringify({ op: 1, d: seq }));
      // Discord: first heartbeat after jitter * interval
      setTimeout(sendHb, interval * Math.random());
      hb = setInterval(sendHb, interval);
      identify();
      return;
    }
    if (msg.op === 7) {
      console.warn("[pixel-discord] reconnect requested");
      ws.close();
      return;
    }
    if (msg.op === 9) {
      console.error("[pixel-discord] invalid session — re-identify");
      identify();
      return;
    }
    if (msg.op === 0 && msg.t === "READY") {
      console.log("[pixel-discord] READY — /pixel join|tip|wallet");
      return;
    }
    if (msg.op === 0 && msg.t === "INTERACTION_CREATE" && msg.d) {
      const ix = msg.d as Interaction;
      const name =
        ix.data?.name === "pixel" ? (ix.data.options?.[0]?.name ?? "join") : (ix.data?.name ?? "");
      const reply = await handlePixelCommand(name || "join");
      const r = await fetch(`${API}/interactions/${ix.id}/${ix.token}/callback`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "user-agent": "DiscordBot (https://github.com/MCFLAMINGO/pixel-chain-story, 1.0)",
        },
        body: JSON.stringify({ type: 4, data: { content: reply.content } }),
      });
      if (!r.ok) console.error("interaction callback", r.status, await r.text());
    }
  });

  ws.addEventListener("close", () => {
    if (hb) clearInterval(hb);
    console.error("[pixel-discord] gateway closed — exiting");
    process.exit(1);
  });

  await new Promise(() => {});
}

export { jsonResponse, TIP, SITE, API };
