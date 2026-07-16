// Legacy demo: each "block" is a single pixel (FNV hash toy chain).
// Prefer `src/lib/pixel/` for the real Light Protocol (UTXO + PoLS + optical keys).

export interface PixelBlock {
  index: number;
  data: number; // 0-255 payload
  prevHash: string;
  hash: string;
  color: { r: number; g: number; b: number };
}

function fnv1a(input: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
  }
  return h.toString(16).padStart(8, "0");
}

function toColor(index: number, data: number, hash: string) {
  return {
    r: index & 0xff,
    g: data & 0xff,
    b: parseInt(hash.slice(0, 2), 16),
  };
}

export function createGenesis(): PixelBlock {
  const data = 0;
  const prevHash = "00000000";
  const hash = fnv1a(`0|${data}|${prevHash}`);
  return { index: 0, data, prevHash, hash, color: toColor(0, data, hash) };
}

export function mineBlock(prev: PixelBlock, data: number): PixelBlock {
  const index = prev.index + 1;
  const payload = data & 0xff;
  const hash = fnv1a(`${index}|${payload}|${prev.hash}`);
  return {
    index,
    data: payload,
    prevHash: prev.hash,
    hash,
    color: toColor(index, payload, hash),
  };
}

export function verifyChain(chain: PixelBlock[]): boolean {
  if (chain.length === 0) return false;
  const genesis = chain[0];
  if (genesis.hash !== fnv1a(`0|${genesis.data}|${genesis.prevHash}`)) return false;
  for (let i = 1; i < chain.length; i++) {
    const b = chain[i];
    const p = chain[i - 1];
    if (b.prevHash !== p.hash) return false;
    if (b.hash !== fnv1a(`${b.index}|${b.data}|${b.prevHash}`)) return false;
    const expected = toColor(b.index, b.data, b.hash);
    if (b.color.r !== expected.r || b.color.g !== expected.g || b.color.b !== expected.b)
      return false;
  }
  return true;
}
