/**
 * Known anchoring venues.
 *
 * NO PRIVILEGED VENUE. This is a list, not a hierarchy — the same rule the
 * bridge doctrine already states. Anchoring to exactly one chain would rebuild
 * the dependency the sovereignty pillar exists to prevent, so `compareVenues()`
 * treats a single venue as weaker than two that agree.
 *
 * Every entry is witness-only: a venue holds a 32-byte digest and a timestamp.
 * None of them can be a value rail, which is why a centralized sequencer is
 * acceptable here and would not be for custody.
 */

import type { EvmVenueConfig, EvmSender } from "./anchor-evm";

export type VenueId =
  | "robinhood-testnet"
  | "robinhood-mainnet"
  | "base-sepolia"
  | "base-mainnet"
  | "ethereum-sepolia"
  | "anvil";

export interface VenueChain {
  id: VenueId;
  chainId: number;
  /** Public endpoint. Rate-limited; operators should supply their own. */
  rpcUrl: string;
  explorer?: string;
  sequencer: "decentralized" | "centralized" | "unknown";
  /** Honest operational note carried alongside the config, not in a README. */
  note: string;
}

/**
 * Verified 2026-08-05 against docs.robinhood.com/chain/connecting.
 *
 * Robinhood Chain is an Arbitrum Orbit (Nitro) L2 for tokenized equities and
 * RWAs, ETH gas, ~100ms preconfirmations, and a **centralized first-come
 * first-served sequencer with no public mempool**. Fine for a witness — the
 * operator can reorder or refuse a hash but cannot forge one, and there is no
 * value to seize. Not acceptable as a value rail: a venue custodying tokenized
 * securities has a compliance function that can be compelled to interfere.
 */
export const VENUE_CHAINS: Record<VenueId, VenueChain> = {
  "robinhood-testnet": {
    id: "robinhood-testnet",
    chainId: 46630,
    rpcUrl: "https://rpc.testnet.chain.robinhood.com",
    explorer: "https://explorer.testnet.chain.robinhood.com",
    sequencer: "centralized",
    note: "Arbitrum Orbit L2 testnet; centralized FCFS sequencer. Witness only — never a value rail.",
  },
  "robinhood-mainnet": {
    id: "robinhood-mainnet",
    chainId: 4663,
    rpcUrl: "https://rpc.mainnet.chain.robinhood.com",
    explorer: "https://robinhoodchain.blockscout.com",
    sequencer: "centralized",
    note: "Arbitrum Orbit L2 for tokenized equities; centralized FCFS sequencer, operator can censor. Witness only.",
  },
  "base-sepolia": {
    id: "base-sepolia",
    chainId: 84532,
    rpcUrl: "https://sepolia.base.org",
    explorer: "https://sepolia.basescan.org",
    sequencer: "centralized",
    note: "OP Stack testnet; sequencer operated by Coinbase. Witness only.",
  },
  "base-mainnet": {
    id: "base-mainnet",
    chainId: 8453,
    rpcUrl: "https://mainnet.base.org",
    explorer: "https://basescan.org",
    sequencer: "centralized",
    note: "OP Stack L2; sequencer operated by Coinbase. Witness only.",
  },
  "ethereum-sepolia": {
    id: "ethereum-sepolia",
    chainId: 11155111,
    rpcUrl: "https://ethereum-sepolia-rpc.publicnode.com",
    explorer: "https://sepolia.etherscan.io",
    sequencer: "decentralized",
    note: "L1 testnet; slowest and cheapest independence check.",
  },
  anvil: {
    id: "anvil",
    chainId: 31337,
    rpcUrl: "http://127.0.0.1:8545",
    sequencer: "unknown",
    note: "Local Foundry node for tests.",
  },
};

/** Build a venue config for a known chain. Omit `sender` for read-only use. */
export function venueConfig(params: {
  venue: VenueId;
  contract: string;
  sender?: EvmSender;
  rpcUrl?: string;
}): EvmVenueConfig {
  const chain = VENUE_CHAINS[params.venue];
  if (!chain) throw new Error(`unknown venue ${params.venue}`);
  const explorer = chain.explorer;
  return {
    id: chain.id,
    chainId: chain.chainId,
    rpcUrl: params.rpcUrl ?? chain.rpcUrl,
    contract: params.contract,
    sender: params.sender,
    sequencer: chain.sequencer,
    note: chain.note,
    explorerTxUrl: explorer ? (tx) => `${explorer}/tx/${tx}` : undefined,
  };
}

/**
 * Anchoring to a single venue is weaker than anchoring to several.
 * Returns the reasons a venue set is not yet independent.
 */
export function venueSetWarnings(venues: VenueId[]): string[] {
  const warnings: string[] = [];
  const unique = [...new Set(venues)];
  if (unique.length === 0) return ["no venues configured — anchors are unpublished"];
  if (unique.length === 1) {
    warnings.push(
      `only ${unique[0]} is configured — a single venue is a single point of failure for both liveness and honesty`,
    );
  }
  const decentralized = unique.filter((v) => VENUE_CHAINS[v]?.sequencer === "decentralized");
  if (decentralized.length === 0) {
    warnings.push(
      "every venue has a centralized sequencer — add at least one where no single operator can censor",
    );
  }
  return warnings;
}

export function anchorVenueThesis(): { rule: string; witnessOnly: string; caveat: string } {
  return {
    rule: "No privileged venue. The digest is portable, and agreement between independent venues is the strength — not the reputation of any one chain.",
    witnessOnly:
      "A venue stores a 32-byte digest and a timestamp. It cannot forge an anchor and holds nothing to seize, which is why a centralized sequencer is tolerable for witnessing.",
    caveat:
      "The same venue is NOT acceptable as a value rail. A chain custodying tokenized securities has a compliance function that can be compelled to freeze or reorder.",
  };
}
