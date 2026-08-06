/**
 * How much of the supply is still lit — measured, not enforced.
 *
 * The earlier proposal for tracking living presence was demurrage: make balances
 * decay so supply falls when people stop showing up. It works, and it taxes an
 * absent person at exactly the rate it taxes a fake one, because decay cannot
 * tell the two apart.
 *
 * It is also unnecessary. When someone dies their keys go silent and their coins
 * stop moving. The supply already goes dark on its own; the ledger simply does not
 * say so. Bitcoin's stated supply counts millions of coins nobody can reach.
 *
 * So the honest version of "the light goes out" is a measurement. An output's age
 * is the time since it last moved, because spending an output creates new ones.
 * Report the supply that is still moving, and the census-tracking property becomes
 * an observable statistic instead of a rule that punishes people for being away.
 *
 * Nothing here is consensus. No balance is altered, and no transaction is rejected.
 */

import type { LedgerPixel, PixelChainState } from "./chain";

export const DAY_MS = 86_400_000;

export interface AgedUtxo {
  key: string;
  address: string;
  amount: number;
  /** Pixel that created this output — equivalently, when it last moved. */
  bornPixel: number;
  bornAt: number;
  ageDays: number;
}

export interface LitSupplyBand {
  label: string;
  /** Inclusive lower bound in days; the last band is open-ended. */
  fromDays: number;
  toDays: number | null;
  amount: number;
  outputs: number;
  shareOfSupply: number;
}

export interface LitSupplyReport {
  /** Everything the ledger says exists. */
  nominalSupply: number;
  /** Supply that moved inside the window — the light still on. */
  litSupply: number;
  /** Supply that has not moved. Unreachable and merely patient look identical. */
  darkSupply: number;
  windowDays: number;
  litShare: number;
  /** Distinct addresses holding lit supply — a floor on who is still here. */
  litAddresses: number;
  bands: LitSupplyBand[];
  asOf: number;
}

/**
 * Age every unspent output by the pixel that created it.
 *
 * Outputs carry no timestamp of their own, so the creating pixel supplies it.
 * That is the correct clock regardless: an output that has never moved has been
 * still since it was made.
 */
export function agedUtxos(state: PixelChainState, now = Date.now()): AgedUtxo[] {
  const bornByTxid = new Map<string, LedgerPixel>();
  for (const pixel of state.pixels) {
    for (const tx of pixel.transactions) bornByTxid.set(tx.txid, pixel);
  }

  const aged: AgedUtxo[] = [];
  for (const [key, utxo] of state.utxos) {
    const born = bornByTxid.get(utxo.txid);
    // An output whose creating pixel is missing cannot be aged honestly, so it is
    // left out rather than dated to now and counted as lit.
    if (!born) continue;
    aged.push({
      key,
      address: utxo.address,
      amount: utxo.amount,
      bornPixel: born.index,
      bornAt: born.timestamp,
      ageDays: Math.max(0, (now - born.timestamp) / DAY_MS),
    });
  }
  return aged;
}

const DEFAULT_BANDS: Array<{ label: string; fromDays: number; toDays: number | null }> = [
  { label: "moved this week", fromDays: 0, toDays: 7 },
  { label: "moved this month", fromDays: 7, toDays: 30 },
  { label: "moved this year", fromDays: 30, toDays: 365 },
  { label: "still, over a year", fromDays: 365, toDays: 365 * 5 },
  { label: "dark, over five years", fromDays: 365 * 5, toDays: null },
];

export function litSupplyReport(
  state: PixelChainState,
  opts?: { windowDays?: number; now?: number },
): LitSupplyReport {
  const now = opts?.now ?? Date.now();
  const windowDays = opts?.windowDays ?? 365;
  const aged = agedUtxos(state, now);

  const nominalSupply = aged.reduce((sum, u) => sum + u.amount, 0);
  const lit = aged.filter((u) => u.ageDays <= windowDays);
  const litSupply = lit.reduce((sum, u) => sum + u.amount, 0);

  const bands: LitSupplyBand[] = DEFAULT_BANDS.map((b) => {
    const inBand = aged.filter(
      (u) => u.ageDays >= b.fromDays && (b.toDays === null || u.ageDays < b.toDays),
    );
    const amount = inBand.reduce((sum, u) => sum + u.amount, 0);
    return {
      ...b,
      amount,
      outputs: inBand.length,
      shareOfSupply: nominalSupply === 0 ? 0 : amount / nominalSupply,
    };
  });

  return {
    nominalSupply,
    litSupply,
    darkSupply: nominalSupply - litSupply,
    windowDays,
    litShare: nominalSupply === 0 ? 0 : litSupply / nominalSupply,
    litAddresses: new Set(lit.map((u) => u.address)).size,
    bands,
    asOf: now,
  };
}

/**
 * Brightness of one address: how much it moved, not how much it holds.
 *
 * A business transacting all day is brighter than a large dormant balance. This
 * is the reading that cannot be faked for free, because every transaction counted
 * here had to be paid for.
 */
export function addressBrightness(
  state: PixelChainState,
  address: string,
  opts?: { windowDays?: number; now?: number },
): { moments: number; movedAmount: number; windowDays: number } {
  const now = opts?.now ?? Date.now();
  const windowDays = opts?.windowDays ?? 30;
  const cutoff = now - windowDays * DAY_MS;

  let moments = 0;
  let movedAmount = 0;
  for (const pixel of state.pixels) {
    if (pixel.timestamp < cutoff) continue;
    for (const tx of pixel.transactions) {
      const sent = tx.outputs.some((o) => o.address === address);
      if (!sent) continue;
      moments += 1;
      movedAmount += tx.outputs
        .filter((o) => o.address === address)
        .reduce((sum, o) => sum + o.amount, 0);
    }
  }
  return { moments, movedAmount, windowDays };
}

export function litSupplyThesis(): {
  instead: string;
  why: string;
  brightness: string;
  limit: string;
} {
  return {
    instead:
      "Measure the dark rather than enforce it. Supply already goes quiet when " +
      "people do, because keys go silent; the ledger just has not been saying so.",
    why:
      "Demurrage would report the same fact by destroying value, and it cannot " +
      "distinguish an absent person from a farm standing still — it charges both at " +
      "the same rate. Measuring costs nobody anything.",
    brightness:
      "Brightness is what moved, not what is held. A business transacting all day " +
      "outshines a large dormant balance, and it cannot be faked cheaply because " +
      "every transaction counted had to be paid for.",
    limit:
      "Unreachable and merely patient are indistinguishable. A long-term holder " +
      "reads as dark, so this is a liveness statistic and not a claim about who is " +
      "alive.",
  };
}
