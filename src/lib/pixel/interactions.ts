/**
 * Pixel Ledger — every way a human (or machine) can touch the light.
 *
 * This is not a “blockchain app.” It is a pixel ledger: units of settlement
 * are illuminated pixels. Interaction channels are how light enters.
 */

export type InteractionKind =
  | "propose"
  | "shine"
  | "read_field"
  | "proximity"
  | "optical_project"
  | "optical_capture"
  | "two_screens"
  | "flashlight_maze"
  | "lumen_program"
  | "json_rpc"
  | "cli_wallet"
  | "cli_node"
  | "peer_gossip"
  | "sequence"
  | "veil_privacy"
  | "watch_picture";

export interface InteractionSurface {
  id: InteractionKind;
  name: string;
  channel: "human" | "light" | "code" | "network";
  summary: string;
  status: "live" | "partial" | "planned";
}

export const PIXEL_LEDGER_NAME = "Pixel Ledger";

export const INTERACTIONS: InteractionSurface[] = [
  {
    id: "propose",
    name: "Propose transfer",
    channel: "human",
    summary: "Write a human-readable memo; value enters superposition (no color yet).",
    status: "live",
  },
  {
    id: "shine",
    name: "Shine light (PoLS)",
    channel: "light",
    summary: "Proof of Light Sequence collapses ghosts into a lit pixel with color.",
    status: "live",
  },
  {
    id: "read_field",
    name: "Enter the field",
    channel: "human",
    summary: "Stand inside the living picture — AbEx field of illuminated pixels.",
    status: "live",
  },
  {
    id: "proximity",
    name: "Reveal proximity",
    channel: "light",
    summary: "Touch a lit pixel; neighbors appear. Dark pixels stay undisclosed.",
    status: "live",
  },
  {
    id: "optical_project",
    name: "Project key from screen",
    channel: "light",
    summary: "Phone/computer phosphor shines a picture that holds key bytes.",
    status: "live",
  },
  {
    id: "optical_capture",
    name: "Camera read",
    channel: "light",
    summary: "Camera (or simulated capture) recovers the key from luminance.",
    status: "live",
  },
  {
    id: "two_screens",
    name: "Two screens together",
    channel: "light",
    summary: "One screen projects; the other reads — peer optical handshake.",
    status: "live",
  },
  {
    id: "flashlight_maze",
    name: "Flashlight + maze card",
    channel: "light",
    summary: "Analog archaeological maze; light finds the path, seal verifies.",
    status: "partial",
  },
  {
    id: "lumen_program",
    name: "Lumen program",
    channel: "code",
    summary: "ghost → veil → shine → collapse → paint — light-native settlement code.",
    status: "live",
  },
  {
    id: "json_rpc",
    name: "JSON-RPC",
    channel: "code",
    summary: "pix_* methods for wallets, explorers, and Ethereum-familiar tooling.",
    status: "live",
  },
  {
    id: "cli_wallet",
    name: "CLI wallet",
    channel: "code",
    summary: "Create wallets, send, balance against a local or remote ledger node.",
    status: "live",
  },
  {
    id: "cli_node",
    name: "Run a ledger node",
    channel: "network",
    summary: "Persist pixels to disk, sequence when elected, serve RPC.",
    status: "live",
  },
  {
    id: "peer_gossip",
    name: "Peer gossip",
    channel: "network",
    summary: "WebSocket mesh shares txs and newly lit pixels between nodes.",
    status: "live",
  },
  {
    id: "sequence",
    name: "Sequence (illuminate)",
    channel: "network",
    summary: "Elected sequencer shines light for the next pixel in the ledger.",
    status: "live",
  },
  {
    id: "veil_privacy",
    name: "Privacy veil",
    channel: "human",
    summary: "public / private / selective — what light may disclose to whom.",
    status: "live",
  },
  {
    id: "watch_picture",
    name: "Watch the picture grow",
    channel: "human",
    summary: "The ledger is the artwork; each settlement paints another pixel.",
    status: "live",
  },
];
