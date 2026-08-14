/**
 * A farm has a shape, and the shape is the price.
 *
 * The presence work (see `farmDefenceThesis` in presence-peg.ts) concluded that a room
 * of devices genuinely *is* present, so there is no forgery to detect. That is true of
 * the meeting. It is not true of everything that comes after, and this module is about
 * what comes after.
 *
 * Three observations, in increasing order of how much they buy:
 *
 * **1. A farm is degenerate in structure.** Under a mint-once-per-identity budget every
 * minting graph is a tree, farm or village alike, so minting shape alone separates
 * nothing. What separates them is what happens next: people keep meeting, in clusters,
 * and their friends know each other. A camera watching a screen produces no second
 * meeting at all.
 *
 * **2. A farm is degenerate in time.** A script emits at a machine cadence — flat rate,
 * no day and night, no bursts. Human light arrives in clumps, sleeps for eight hours,
 * and at a concert arrives as one enormous burst in one place, with a distinctive
 * structure: one issuer to many, then many turning to whoever is next to them.
 *
 * **3. A farm cannot aggregate what it mints — and this one is not a heuristic.**
 * Light spread over a million addresses is useless until it is concentrated, and
 * concentration is a flow that all points one way. Reciprocity is the measure of light
 * flowing back, and a farm's consolidation has none by construction. It cannot buy any,
 * either: every PIX sent back to look alive is a PIX not consolidated. See
 * `consolidationPrice` — looking human costs exactly the fraction it gives back.
 *
 * That is why this is the strongest of the three. Detection can be evaded by a patient
 * adversary. **A trade-off cannot**, because it is arithmetic on the attacker's own
 * balance, and the payoff requires the very flow that exposes it.
 *
 * Nothing here is consensus. These are read-only measurements over history, for witness
 * eligibility and for anyone auditing the picture. A heuristic must never decide
 * validity — that would let a false positive confiscate a real person's light.
 */

/** A directed transfer of light, as history records it. */
export interface FlowEdge {
  from: string;
  to: string;
  amount: number;
  /** Milliseconds, for the cadence measures. */
  at: number;
}

export interface FlowSignature {
  /**
   * Fraction of gross flow that came back the other way, over the address pairs that
   * moved light at all. Zero means every edge points one direction.
   */
  reciprocity: number;
  /** Share of all light that ended at the single largest receiver. */
  sinkShare: number;
  /** Most distinct senders paying into one address. Humans do not have thousands. */
  maxDistinctInDegree: number;
  /** Addresses that received light and never sent any. A farm's leaves. */
  terminalShare: number;
}

function pairKey(a: string, b: string): string {
  return `${a}\u0000${b}`;
}

export function flowSignature(edges: FlowEdge[]): FlowSignature {
  if (edges.length === 0) {
    return { reciprocity: 0, sinkShare: 0, maxDistinctInDegree: 0, terminalShare: 0 };
  }
  const directed = new Map<string, number>();
  const inbound = new Map<string, number>();
  const senders = new Map<string, Set<string>>();
  const sent = new Set<string>();
  const received = new Set<string>();
  let gross = 0;

  for (const e of edges) {
    directed.set(pairKey(e.from, e.to), (directed.get(pairKey(e.from, e.to)) ?? 0) + e.amount);
    inbound.set(e.to, (inbound.get(e.to) ?? 0) + e.amount);
    if (!senders.has(e.to)) senders.set(e.to, new Set());
    senders.get(e.to)!.add(e.from);
    sent.add(e.from);
    received.add(e.to);
    gross += e.amount;
  }

  // Reciprocated volume: for each ordered pair, the part matched by the reverse pair.
  let matched = 0;
  for (const [key, amount] of directed) {
    const [a, b] = key.split("\u0000") as [string, string];
    const back = directed.get(pairKey(b, a)) ?? 0;
    matched += Math.min(amount, back);
  }

  const largestSink = Math.max(...inbound.values());
  const terminals = [...received].filter((a) => !sent.has(a)).length;

  return {
    reciprocity: gross === 0 ? 0 : matched / gross,
    sinkShare: gross === 0 ? 0 : largestSink / gross,
    maxDistinctInDegree: Math.max(...[...senders.values()].map((s) => s.size)),
    terminalShare: received.size === 0 ? 0 : terminals / received.size,
  };
}

/**
 * What looking alive costs a farm, exactly.
 *
 * A farm's goal is net light at an address it controls. Reciprocity is light sent back.
 * The two are the same quantity pointing opposite ways, so a farm that returns a
 * fraction `r` of its gross flow to look reciprocal keeps `1 − r` of it.
 *
 * This is why the aggregation argument is stronger than any detector. It does not ask
 * whether the farm can imitate a village; it observes that imitating one costs the
 * imitation, at a rate the farm cannot negotiate. At the reciprocity of a real economy
 * the farm keeps a minority of what it minted, and every PIX of realism is a PIX it
 * does not have.
 */
export function consolidationPrice(reciprocity: number): {
  keptFraction: number;
  costMultiplier: number;
} {
  const r = Math.min(1, Math.max(0, reciprocity));
  const kept = 1 - r;
  return { keptFraction: kept, costMultiplier: kept === 0 ? Infinity : 1 / kept };
}

/**
 * Is this cadence machine-made?
 *
 * Two signals a script gives away for free, both computed over inter-arrival times:
 * a flat rate has almost no dispersion, and a population that never sleeps shows no
 * day-and-night swing. Human light is bursty and diurnal.
 *
 * Returned as measurements rather than a verdict. This is the weakest of the three
 * signals — a patient adversary can shape timing — and it must not gate validity.
 */
export interface CadenceSignature {
  /** Std dev over mean of inter-arrival gaps. ~1 is Poisson; ≫1 is bursty; ~0 is a metronome. */
  burstiness: number;
  /** Busiest hour's share of a day. 1/24 means no day or night at all. */
  peakHourShare: number;
  /** Hours of the day with no light at all. A sleeping population has some. */
  quietHours: number;
}

export function cadenceSignature(timestampsMs: number[]): CadenceSignature {
  if (timestampsMs.length < 3) return { burstiness: 0, peakHourShare: 1, quietHours: 24 };
  const sorted = [...timestampsMs].sort((a, b) => a - b);
  const gaps: number[] = [];
  for (let i = 1; i < sorted.length; i++) gaps.push(sorted[i]! - sorted[i - 1]!);
  const mean = gaps.reduce((s, g) => s + g, 0) / gaps.length;
  const variance = gaps.reduce((s, g) => s + (g - mean) ** 2, 0) / gaps.length;
  const burstiness = mean === 0 ? 0 : Math.sqrt(variance) / mean;

  const hours = new Array(24).fill(0);
  for (const t of sorted) hours[new Date(t).getUTCHours()] += 1;
  const peak = Math.max(...hours);
  return {
    burstiness,
    peakHourShare: peak / sorted.length,
    quietHours: hours.filter((h) => h === 0).length,
  };
}

export function farmSignatureThesis(): Record<string, string> {
  return {
    structure:
      "Under a mint-once budget every minting graph is a tree, farm or village, so " +
      "minting shape separates nothing. What separates them is the second meeting: " +
      "people keep meeting and their friends know each other. A camera watching a " +
      "screen has no second meeting.",
    time:
      "A script emits at a machine cadence — flat rate, no day and night, no bursts. A " +
      "concert is the opposite: one enormous burst in one place, one issuer to many, " +
      "then many turning to whoever is beside them.",
    aggregation:
      "The strongest, and not a heuristic. Light over a million addresses is useless " +
      "until concentrated, and concentration is a flow that points one way. A farm " +
      "cannot buy reciprocity because every PIX sent back to look alive is a PIX not " +
      "consolidated: it keeps exactly 1 - r of what it moves.",
    why:
      "Detection can be evaded by a patient adversary. A trade-off cannot. The payoff " +
      "requires the very flow that exposes it, so the farm pays for realism out of the " +
      "thing it was farming.",
    limit:
      "None of this may decide validity. These are read-only measurements for witness " +
      "eligibility and for anyone auditing the picture; a heuristic in consensus would " +
      "let a false positive confiscate a real person's light.",
  };
}
