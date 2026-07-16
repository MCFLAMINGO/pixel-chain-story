/**
 * Pixel Ledger value structure — scarcity like Bitcoin, issuance by light.
 *
 * Bitcoin’s 21M works because the schedule is knowable, capped, and costly to
 * attack. Pixel Ledger uses the same hard cap, but issuance is earned by
 * *illuminating pixels* (PoLS), not by burning electricity.
 *
 *   CAP              21_000_000 PIX
 *   ERA              every 210_000 illuminated pixels, reward halves
 *   GENESIS REWARD   50 PIX (first light)
 *   TOTAL SUPPLY     → 21M asymptotically (same geometric series as BTC)
 *
 * Value drivers (why anyone holds PIX):
 *   1. Scarcity — hard cap, transparent emission
 *   2. Utility — fees to illuminate / prioritize revelation
 *   3. Security — sequencer rewards fund decentralized light
 *   4. Bridge fuel — PIX locks/burns to shine proofs onto other chains
 *   5. Energy narrative — security without AWS-scale power plants
 */

export const PIX_HARD_CAP = 21_000_000;
export const LIGHT_ERA_LENGTH = 210_000;
export const GENESIS_LIGHT_REWARD = 50;
/** Base fee burned (or paid to sequencer) per revealed tx — in PIX. */
export const BASE_REVELATION_FEE = 0;

export interface EmissionInfo {
  pixelIndex: number;
  era: number;
  reward: number;
  mintedToDate: number;
  remaining: number;
  hardCap: number;
}

/** Reward for illuminating pixel at `index` (0-based). */
export function lightReward(pixelIndex: number): number {
  if (pixelIndex < 0) return 0;
  const era = Math.floor(pixelIndex / LIGHT_ERA_LENGTH);
  if (era >= 64) return 0; // dust floor
  const reward = GENESIS_LIGHT_REWARD / Math.pow(2, era);
  // integer PIX for MVP; later switch to 1e8 base units
  return Math.floor(reward);
}

/** Total minted if pixels 0..n-1 have all been illuminated with full rewards. */
export function mintedThrough(pixelCount: number): number {
  let total = 0;
  for (let i = 0; i < pixelCount; i++) total += lightReward(i);
  return total;
}

export function emissionInfo(nextPixelIndex: number): EmissionInfo {
  const mintedToDate = mintedThrough(nextPixelIndex);
  return {
    pixelIndex: nextPixelIndex,
    era: Math.floor(Math.max(0, nextPixelIndex) / LIGHT_ERA_LENGTH),
    reward: lightReward(nextPixelIndex),
    mintedToDate,
    remaining: Math.max(0, PIX_HARD_CAP - mintedToDate),
    hardCap: PIX_HARD_CAP,
  };
}

export function assertUnderCap(mintedToDate: number, newMint: number): void {
  if (mintedToDate + newMint > PIX_HARD_CAP) {
    throw new Error(`PIX hard cap exceeded (${mintedToDate + newMint} > ${PIX_HARD_CAP})`);
  }
}

/**
 * Value thesis — concise for whitepapers / Ethereum audiences.
 */
export function valueThesis(): {
  cap: number;
  analogy: string;
  issuance: string;
  sinks: string[];
  whyHold: string[];
} {
  return {
    cap: PIX_HARD_CAP,
    analogy: "Same 21M hard cap math as Bitcoin; eras of 210,000 pixels instead of blocks.",
    issuance: "New PIX only via light rewards when a sequencer illuminates a pixel (PoLS).",
    sinks: [
      "Revelation fees (priority / spam resistance)",
      "Bridge locks — PIX locked or burned to mint attestations on foreign chains",
      "Optional fee burn as supply deflation after emission tails off",
    ],
    whyHold: [
      "Scarce settlement asset for quantum-safe transfers",
      "Gas for illuminating and bridging light proofs",
      "Claim on decentralized sequencer security budget",
      "Collateral for cross-chain shine (agnostic bridges)",
    ],
  };
}
