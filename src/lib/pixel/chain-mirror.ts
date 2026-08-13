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

/**
 * The copy as a picture that can open itself.
 *
 * JSON is data nobody can look at. A file that needs our website to be readable
 * is only as durable as our website, which is the dependency this whole exercise
 * exists to remove. So the export carries the pixels *and* the few lines needed to
 * draw them: one HTML file, no scripts fetched, no fonts, no server, no us.
 *
 * Open it in any browser in a hundred years and the picture is there.
 */
export function exportMirrorHtml(pixels: LedgerPixel[]): string {
  const cells = pixels.map((p) => ({
    i: p.index,
    // Colour already lives in the pixel; rendering is a reading, not a decision.
    c: p.illuminated ? [p.color.r, p.color.g, p.color.b] : null,
    t: p.transactions.length,
  }));
  const genesis = pixels[0]?.hash ?? "";
  const height = pixels[pixels.length - 1]?.index ?? -1;
  const data = JSON.stringify(cells).replace(/</g, "\\u003c");
  // The whole record, not just what it looks like. A file carrying only colours
  // is a picture *of* the picture — a visitor could see it and decode nothing.
  // Every transaction, author, note and signature travels too, which is what
  // makes this the artifact rather than a view of one.
  const archive = JSON.stringify(pixels).replace(/</g, "\\u003c");
  return `<!doctype html>
<meta charset="utf-8">
<title>Pixel Ledger — ${height + 1} pixels</title>
<style>
 body{background:#050706;color:#9fb8a8;font:14px/1.6 ui-monospace,monospace;margin:0;padding:24px}
 h1{font-size:15px;letter-spacing:.18em;text-transform:uppercase;color:#7fd4a4;margin:0 0 4px}
 p{margin:0 0 18px;color:#6b8779;font-size:12px;word-break:break-all}
 #f{display:grid;gap:1px;max-width:min(92vw,92vh);margin:0 auto}
 i{aspect-ratio:1;display:block}
</style>
<h1>Pixel Ledger</h1>
<p>${height + 1} pixels · genesis ${genesis.slice(0, 32)}…<br>
This file holds the picture, the whole record it was drawn from, and the code to
draw it. It needs no server.<br>
The record is in the <code>pixel-record</code> script tag below — every moment,
author and note. View source to read it.</p>
<div id="f"></div>
<script type="application/json" id="pixel-record">${archive}</script>
<script>
const px=${data};
const n=Math.max(1,Math.ceil(Math.sqrt(px.length)));
const f=document.getElementById("f");
f.style.gridTemplateColumns="repeat("+n+",minmax(0,1fr))";
for(const p of px){
  const d=document.createElement("i");
  d.title="#"+p.i+" · "+p.t+" tx";
  if(p.c){
    const rgb="rgb("+p.c[0]+","+p.c[1]+","+p.c[2]+")";
    d.style.background=rgb;
    d.style.boxShadow="0 0 12px "+rgb;
  }else{
    d.style.background="transparent";
    d.style.opacity=".15";
  }
  f.appendChild(d);
}
</script>
`;
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
