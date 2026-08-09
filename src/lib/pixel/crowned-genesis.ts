/**
 * Crowned Earth — the one public tip genesis friends must join.
 * Ceremony hash (Erik); not whatever a random disk forges.
 */

/** Full genesis pixel hash of the crowned tip. */
export const CROWNED_GENESIS_HASH =
  "f1d193f62d54e98230da5e4b40fbaebb31c176bef241fcb4a44e8f025c8df04f163e7525cc9f0e99172368380d1e1f5341c0a4b2099c17b1f4ba3c0b6739b777";

/** Short prefix for Discord / human confirm. */
export const CROWNED_GENESIS_PREFIX = "f1d193f62d54e982";

/** Public tip RPC — phones and friends join here. */
export const PUBLIC_TIP_RPC_DEFAULT = "https://pixel-tip-production.up.railway.app";

export const CROWNED_NETWORK_ID = 20553;

export function crownedGenesisThesis(): string {
  return (
    "One crowned Earth — genesis f1d193… / network 20553. " +
    "Phones open /wallet on the public tip; friends join that tip. " +
    "Never pixel init a private notebook and call it Pixel."
  );
}

/** True when hash is the crowned genesis (full or unambiguous prefix). */
export function isCrownedGenesisHash(hash: string | null | undefined): boolean {
  if (!hash || typeof hash !== "string") return false;
  const h = hash.toLowerCase();
  return h === CROWNED_GENESIS_HASH || h.startsWith(CROWNED_GENESIS_PREFIX);
}

export function assertCrownedEarth(params: {
  genesisHash: string;
  networkId?: number;
  label?: string;
}): void {
  if (!isCrownedGenesisHash(params.genesisHash)) {
    throw new Error(
      `${params.label ?? "tip"} is not the crowned Earth ` +
        `(want genesis ${CROWNED_GENESIS_PREFIX}…, got ${params.genesisHash.slice(0, 16)}…)`,
    );
  }
  // This branch used to be empty, so a matching genesis on a foreign network id
  // passed. Genesis and network together are the canvas; half of it is not it.
  if (params.networkId != null && params.networkId !== CROWNED_NETWORK_ID) {
    throw new Error(
      `${params.label ?? "tip"} carries the crowned genesis on network ` +
        `${params.networkId}, but the crowned Earth is network ${CROWNED_NETWORK_ID}`,
    );
  }
}

export function assertCrownedPublicTip(params: { genesisHash: string; networkId: number }): void {
  if (!isCrownedGenesisHash(params.genesisHash)) {
    throw new Error(
      `refuse wrong Earth — want ${CROWNED_GENESIS_PREFIX}… got ${params.genesisHash.slice(0, 16)}…`,
    );
  }
  if (params.networkId !== CROWNED_NETWORK_ID) {
    throw new Error(`refuse wrong networkId — want ${CROWNED_NETWORK_ID}, got ${params.networkId}`);
  }
}
