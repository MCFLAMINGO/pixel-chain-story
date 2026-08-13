/**
 * The wallet carries the picture.
 *
 * One Railway volume holds the only copy of this history. If it dies, the anchors
 * prove a picture existed and what its digest was, and nobody can reconstruct a
 * single pixel of it — proof of existence without the thing.
 *
 * Asking friends to run a VPS fixes that and almost nobody will. Handing people a
 * wallet is something that already happens. So the wallet keeps a copy: at 46
 * pixels the whole chain is 610 KB, and five wallets in three countries is five
 * independent copies acquired without anyone volunteering for anything.
 *
 * A phone cannot *extend* the picture — sequencing needs a machine that stays
 * awake and can be dialled. It can hold one, and that is the half that decides
 * whether the record survives.
 *
 * Storage-agnostic on purpose: the caller supplies load and save, so this is
 * testable without a browser and reusable outside one.
 */

import type { LedgerPixel } from "./chain";

export interface MirrorStore {
  load(): Promise<LedgerPixel[] | null>;
  save(pixels: LedgerPixel[]): Promise<void>;
}

export interface MirrorState {
  pixels: LedgerPixel[];
  /** Highest index held, or -1 when empty. */
  height: number;
  bytes: number;
  genesisHash: string | null;
}

export function mirrorState(pixels: LedgerPixel[]): MirrorState {
  const last = pixels[pixels.length - 1];
  return {
    pixels,
    height: last ? last.index : -1,
    bytes: pixels.length === 0 ? 0 : JSON.stringify(pixels).length,
    genesisHash: pixels[0]?.hash ?? null,
  };
}

export type MirrorSync =
  | { ok: true; added: number; state: MirrorState }
  /**
   * The feed does not continue what we hold. Keeping both would stitch two
   * pictures together, so the copy is left untouched and the caller is told.
   */
  | { ok: false; reason: "fork" | "gap" | "wrong-earth" | "unreachable"; detail: string };

/** Pixels must chain: each index one higher, each prevHash the parent's hash. */
function continues(held: LedgerPixel[], fresh: LedgerPixel[]): true | string {
  let prev = held[held.length - 1];
  for (const pixel of fresh) {
    if (prev) {
      if (pixel.index !== prev.index + 1) {
        return `expected #${prev.index + 1}, got #${pixel.index}`;
      }
      if (pixel.prevHash !== prev.hash) {
        return `#${pixel.index} does not follow #${prev.index}`;
      }
    } else if (pixel.index !== 0) {
      return `a copy must start at genesis, got #${pixel.index}`;
    }
    prev = pixel;
  }
  return true;
}

/**
 * Take everything new from the tip and keep it.
 *
 * Only appends. A feed that does not continue what we hold is refused rather than
 * merged — a chain that does not line up is a *different* history, and the whole
 * point of holding a copy is to notice that.
 */
export async function syncMirror(params: {
  rpcBase: string;
  store: MirrorStore;
  expectGenesis?: string;
  fetchImpl?: typeof fetch;
}): Promise<MirrorSync> {
  const fetchImpl = params.fetchImpl ?? fetch;
  const base = params.rpcBase.replace(/\/$/, "");
  const held = (await params.store.load()) ?? [];
  const since = held.length > 0 ? held[held.length - 1]!.index : -1;

  let fresh: LedgerPixel[];
  try {
    const res = await fetchImpl(`${base}/pixels?since=${since}`);
    if (!res.ok) return { ok: false, reason: "unreachable", detail: `HTTP ${res.status}` };
    fresh = (await res.json()) as LedgerPixel[];
    if (!Array.isArray(fresh)) return { ok: false, reason: "unreachable", detail: "bad feed" };
  } catch (e) {
    return { ok: false, reason: "unreachable", detail: (e as Error).message };
  }

  if (fresh.length === 0) return { ok: true, added: 0, state: mirrorState(held) };

  const wantGenesis = params.expectGenesis ?? held[0]?.hash;
  const genesis = held[0]?.hash ?? fresh[0]?.hash;
  if (wantGenesis && genesis && wantGenesis !== genesis) {
    return { ok: false, reason: "wrong-earth", detail: `genesis ${genesis.slice(0, 16)}…` };
  }

  const chained = continues(held, fresh);
  if (chained !== true) {
    // A shorter or divergent feed is not a smaller history, it is another one.
    const reason = held.length > 0 && fresh[0]!.index <= since ? "fork" : "gap";
    return { ok: false, reason, detail: chained };
  }

  const merged = [...held, ...fresh];
  await params.store.save(merged);
  return { ok: true, added: fresh.length, state: mirrorState(merged) };
}

/** The copy, as a file someone could hand back if every server were gone. */
export function exportMirror(pixels: LedgerPixel[]): string {
  return JSON.stringify(
    {
      pixelMirror: 1,
      savedAt: Date.now(),
      height: pixels[pixels.length - 1]?.index ?? -1,
      genesisHash: pixels[0]?.hash ?? null,
      pixels,
    },
    null,
    2,
  );
}

export function mirrorThesis(): { why: string; cannot: string; limit: string } {
  return {
    why:
      "One volume holds the only copy. Wallets are already being handed out, so the " +
      "copies can ride along with them — no VPS, no volunteers, no commands.",
    cannot:
      "A phone cannot extend the picture. Sequencing needs a machine that stays awake " +
      "and can be dialled; holding a copy needs neither.",
    limit:
      "Browsers evict storage, so any single copy is unreliable. Five unreliable " +
      "copies still beat one reliable one, and the count grows with every wallet.",
  };
}
