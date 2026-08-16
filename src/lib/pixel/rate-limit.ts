/**
 * A token bucket for write endpoints.
 *
 * ## Why writes only
 *
 * Reads are deliberately unlimited. The premise of this project is that a stranger
 * can pull the whole chain and check it without asking anyone's permission, so
 * throttling `/sync` would cost exactly the property the ledger exists to have.
 * Writes are different: a write consumes storage the operator pays for and, until
 * the mempool got a door, could grow the volume holding the only copy of history.
 * So writes get a bucket and reads do not.
 *
 * ## Why a bucket rather than a counter
 *
 * A fixed window punishes honest bursts — a wallet sending three payments in a row
 * is normal — and still lets an attacker sit at the limit forever. A token bucket
 * absorbs the burst and bounds the sustained rate, which is the shape of the actual
 * traffic.
 *
 * ## What this is not
 *
 * Not a defence against a distributed flood, and it does not pretend to be. Client
 * identity here is an address string, and an attacker with many addresses has many
 * buckets. What it does is make the trivial case trivial to stop — one host, one
 * loop — which is the case that was open. Real edge protection is an operational
 * concern and belongs in front of the node, but a mitigation that lives outside the
 * repository is one nobody can verify, so this is the one that ships with tests.
 */

import { RATE_LIMIT_BURST, RATE_LIMIT_MAX_CLIENTS, RATE_LIMIT_REFILL_PER_SEC } from "./limits";

interface Bucket {
  tokens: number;
  updatedAt: number;
}

export interface RateLimiter {
  /** Spend one token. False ⇒ refuse the request. */
  take(clientId: string, now?: number): boolean;
  /** Whole seconds a refused client should wait, for `Retry-After`. */
  retryAfterSec(clientId: string, now?: number): number;
  /** Buckets currently tracked — for tests and `/health`. */
  size(): number;
}

export function createRateLimiter(
  opts: {
    burst?: number;
    refillPerSec?: number;
    maxClients?: number;
  } = {},
): RateLimiter {
  const burst = opts.burst ?? RATE_LIMIT_BURST;
  const refillPerSec = opts.refillPerSec ?? RATE_LIMIT_REFILL_PER_SEC;
  const maxClients = opts.maxClients ?? RATE_LIMIT_MAX_CLIENTS;
  const buckets = new Map<string, Bucket>();

  function refill(clientId: string, now: number): Bucket {
    let bucket = buckets.get(clientId);
    if (!bucket) {
      // The bucket table is itself a resource an attacker can grow, so it is bounded
      // too. Full ⇒ drop the least recently used, which is safe: a dropped bucket
      // re-creates at full tokens, and a client idle long enough to be evicted has
      // earned a full bucket anyway.
      if (buckets.size >= maxClients) {
        let oldestKey: string | null = null;
        let oldestAt = Infinity;
        for (const [key, b] of buckets) {
          if (b.updatedAt < oldestAt) {
            oldestAt = b.updatedAt;
            oldestKey = key;
          }
        }
        if (oldestKey !== null) buckets.delete(oldestKey);
      }
      bucket = { tokens: burst, updatedAt: now };
      buckets.set(clientId, bucket);
      return bucket;
    }
    const elapsedSec = Math.max(0, (now - bucket.updatedAt) / 1000);
    bucket.tokens = Math.min(burst, bucket.tokens + elapsedSec * refillPerSec);
    bucket.updatedAt = now;
    return bucket;
  }

  return {
    take(clientId, now = Date.now()) {
      const bucket = refill(clientId, now);
      if (bucket.tokens < 1) return false;
      bucket.tokens -= 1;
      return true;
    },
    retryAfterSec(clientId, now = Date.now()) {
      const bucket = refill(clientId, now);
      if (bucket.tokens >= 1) return 0;
      return Math.max(1, Math.ceil((1 - bucket.tokens) / refillPerSec));
    },
    size() {
      return buckets.size;
    },
  };
}

/**
 * Best-effort client identity from a request.
 *
 * Behind a proxy the socket address is the proxy, so the forwarded header is used
 * when present. That header is spoofable, which is the honest limitation of doing
 * this in the application: it bounds accidents and single-host loops rather than a
 * determined attacker. Said plainly here so nobody reads the presence of a rate
 * limiter as a stronger claim than it is.
 */
export function clientIdFromRequest(req: Request, fallback = "unknown"): string {
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first;
  }
  const real = req.headers.get("x-real-ip");
  if (real) return real.trim();
  return fallback;
}
