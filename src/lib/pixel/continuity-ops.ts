/**
 * Continuity ops — operator ladder for small-store mirrors (lab).
 *
 * Merchant handshake: sign up via secure link — no DNS/rsync vocabulary.
 * Operator booth jobs (rsync/DNS) stay admin-only.
 * Economics: map fee ($/mo) + till bps when origin is dark.
 * Pixel holds the map (digest) and till bookkeeping — not ICP compute.
 */

import { sha512Hex, type Hex } from "./crypto";
import {
  acceptIntoLight,
  canServeWithoutOrigin,
  comeTowardLight,
  markOriginDark,
  type ContinuityRecord,
} from "./siso";

export type ContinuityStep =
  | "draft"
  | "invite_sent"
  | "merchant_joined"
  | "rungs_assigned"
  | "live";

export type RungHealth = "unknown" | "up" | "down";

export interface MirrorRung {
  id: string;
  label: string;
  /** Base URL where this rung serves sites, e.g. https://m1.example.com */
  baseUrl: string;
  provider: string;
  health: RungHealth;
  lastCheckedAt?: number;
}

export interface DeployChecklistItem {
  id: string;
  title: string;
  detail: string;
  /** shell-ish hint for operators / future agents */
  commandHint?: string;
  done: boolean;
}

/** Local till accrual — lab bookkeeping, not on-chain settlement. */
export interface TillEvent {
  id: string;
  at: number;
  /** Simulated checkout volume in PIX units */
  amountPix: number;
  /** Fee accrued (tillFeePix at record time) */
  feePix: number;
  bps: number;
  via: "mirror" | "origin" | "simulated";
  note?: string;
}

export interface ChaosDrillReport {
  storeId: string;
  originDark: boolean;
  mirrorsServe: boolean;
  tillActive: boolean;
  settlementPix: number;
  feePix: number;
  accruedPix: number;
  claim: string;
}

export interface ContinuityStore {
  id: string;
  /** Business display name */
  name: string;
  /** Public domain customers type */
  domain: string;
  /** Origin booth (their current host) */
  originUrl: string;
  /** Map fee — monthly USD while continuity is on (display / quote) */
  priceUsdPerMonth: number;
  /**
   * Till cut (basis points) on PIX volume while origin is dark.
   * Default 100 = 1%. Zero while origin healthy unless tillCutBpsWhenOriginUp > 0.
   */
  tillCutBpsWhenOriginDark: number;
  /** Optional always-on till bps (default 0 — map fee only when healthy) */
  tillCutBpsWhenOriginUp: number;
  /** Secure invite token for merchant link */
  inviteToken: string;
  step: ContinuityStep;
  /** sha512 of mirrored artifact (map of the real room) — may be attached by operator */
  digest?: Hex;
  /** Rung ids assigned to this store */
  rungIds: string[];
  /** SISO continuity record after go-live (map in the light) */
  continuity?: ContinuityRecord;
  /** Operator-only booth jobs (rsync / DNS) — never merchant-facing */
  deployPlan?: DeployChecklistItem[];
  /** Append-only local till ledger (lab) */
  tillEvents?: TillEvent[];
  /** When merchant accepted the invite */
  joinedAt?: number;
  createdAt: number;
  updatedAt: number;
  note?: string;
}

/** Default till: 1% PIX cut only during origin outage. */
export const DEFAULT_TILL_BPS_ORIGIN_DARK = 100;
export const DEFAULT_MAP_FEE_USD = 20;

export interface ContinuityOpsState {
  operatorName: string;
  rungs: MirrorRung[];
  stores: ContinuityStore[];
}

export const CONTINUITY_OPS_KEY = "pixel.continuity.ops.v1";

export function defaultRungs(): MirrorRung[] {
  return [
    {
      id: "rung-1",
      label: "Rung 1 — EU",
      baseUrl: "https://rung1.example.invalid",
      provider: "Hetzner",
      health: "unknown",
    },
    {
      id: "rung-2",
      label: "Rung 2 — US",
      baseUrl: "https://rung2.example.invalid",
      provider: "Vultr",
      health: "unknown",
    },
    {
      id: "rung-3",
      label: "Rung 3 — AI cloud",
      baseUrl: "https://rung3.example.invalid",
      provider: "Nebius",
      health: "unknown",
    },
    {
      id: "rung-4",
      label: "Rung 4 — Alt",
      baseUrl: "https://rung4.example.invalid",
      provider: "Other VPS",
      health: "unknown",
    },
    {
      id: "rung-5",
      label: "Rung 5 — Home/colo",
      baseUrl: "https://rung5.example.invalid",
      provider: "Private",
      health: "unknown",
    },
  ];
}

export function emptyOpsState(operatorName = "McFlamingo Continuity"): ContinuityOpsState {
  return {
    operatorName,
    rungs: defaultRungs(),
    stores: [],
  };
}

export const MCFLAMINGO_DEMO_DOMAIN = "mcflamingo.com";
/** Live restaurant origin — Popmenu site (Ponte Vedra Beach). */
export const MCFLAMINGO_ORIGIN_URL = "https://www.mcflamingo.com/";
/** Browse menu on the real site (not a localhost page). */
export const MCFLAMINGO_MENU_URL = "https://www.mcflamingo.com/menu";
/** Ordering deep link on the real site. */
export const MCFLAMINGO_ORDER_URL = "https://www.mcflamingo.com/popmenu-order";
/**
 * Digest-only artifact (for Continuity map hashing / CLI drills).
 * Never present this URL to humans as “the menu” — scripts are stripped; it looks dead.
 * Humans open {@link MCFLAMINGO_MENU_URL} / {@link MCFLAMINGO_ORDER_URL}.
 */
export const MCFLAMINGO_SNAPSHOT_HREF = "/mcflamingo/homepage-snapshot.html";

/** Honest lab thesis — Continuity desk ≠ hosting the restaurant. */
export function mcflamingoContinuityHonesty(): string {
  return "The McFlamingo menu lives on Popmenu at www.mcflamingo.com. This Continuity desk only keeps a digest map + till bookkeeping in your browser — it does not host or replace the restaurant site.";
}

/** Cloudflare challenge / bot interstitial — not a usable Continuity artifact. */
export function isUnusableOriginHtml(html: string): boolean {
  const t = html.toLowerCase();
  return (
    t.includes("just a moment...") ||
    t.includes("cf-mitigated") ||
    t.includes("challenge-platform") ||
    t.includes("cdn-cgi/challenge")
  );
}

/**
 * Load McFlamingo homepage bytes for Continuity digest.
 * Prefer live origin; fall back to committed snapshot of www.mcflamingo.com
 * (CORS / Cloudflare often block automated fetch from localhost).
 */
export async function fetchMcFlamingoHomepageHtml(
  fetchImpl: typeof fetch = fetch,
): Promise<{ html: string; source: "live" | "snapshot"; originUrl: string }> {
  const originUrl = MCFLAMINGO_ORIGIN_URL;
  try {
    const live = await fetchImpl(originUrl, {
      method: "GET",
      mode: "cors",
      credentials: "omit",
      redirect: "follow",
    });
    if (live.ok) {
      const html = await live.text();
      if (
        html.trim() &&
        !isUnusableOriginHtml(html) &&
        /mcflamingo/i.test(html) &&
        /ponte\s*vedra/i.test(html)
      ) {
        return { html, source: "live", originUrl };
      }
    }
  } catch {
    // Expected from many browsers (CORS) and some labs (Cloudflare).
  }

  const snap = await fetchImpl(MCFLAMINGO_SNAPSHOT_HREF);
  if (!snap.ok) {
    throw new Error(
      "McFlamingo Continuity snapshot missing — run bun run dev from this repo (public/mcflamingo/homepage-snapshot.html)",
    );
  }
  const html = await snap.text();
  if (!/mcflamingo/i.test(html) || !/ponte\s*vedra/i.test(html)) {
    throw new Error("McFlamingo snapshot corrupt — expected live-site homepage capture");
  }
  return { html, source: "snapshot", originUrl };
}

/**
 * One-click Continuity seed for the real McFlamingo website.
 * Origin is always {@link MCFLAMINGO_ORIGIN_URL}; `html` is the homepage artifact to digest
 * (live fetch or Continuity snapshot). Lab mirrors may point at local booths that serve the snapshot.
 */
export async function seedMcFlamingoDemo(
  state: ContinuityOpsState,
  html: string,
  opts?: { originUrl?: string; mirrorUrls?: string[] },
): Promise<ContinuityOpsState> {
  if (!html.trim()) throw new Error("Need McFlamingo homepage artifact");
  if (isUnusableOriginHtml(html)) {
    throw new Error(
      "Got a bot challenge page — use the Continuity snapshot or paste real homepage HTML",
    );
  }
  if (!/mcflamingo/i.test(html)) {
    throw new Error("Artifact does not look like McFlamingo — refuse fake stand-in menus");
  }
  const originUrl = opts?.originUrl ?? MCFLAMINGO_ORIGIN_URL;
  // One demo row — re-clicking must not flood the pipeline.
  const pruned: ContinuityOpsState = {
    ...state,
    stores: state.stores.filter((s) => s.domain !== MCFLAMINGO_DEMO_DOMAIN),
  };
  let next = createStoreOffer(pruned, {
    name: "McFlamingo",
    domain: MCFLAMINGO_DEMO_DOMAIN,
    originUrl,
    priceUsdPerMonth: 20,
  });
  const storeId = next.stores[0]!.id;
  const token = next.stores[0]!.inviteToken;
  next = markInviteSent(next, storeId);
  next = merchantJoin(next, token, { originUrl });
  next = attachStoreDigest(next, storeId, await digestArtifactText(html));

  // Human-facing mirrors must be LIVE restaurant URLs — never the local digest snapshot
  // (stripped Popmenu HTML looks like a dead/404 page when opened in a browser).
  const mirrors = opts?.mirrorUrls?.length
    ? opts.mirrorUrls
    : [MCFLAMINGO_ORIGIN_URL, MCFLAMINGO_MENU_URL];
  if (mirrors[0]) {
    next = updateRung(next, next.rungs[0]!.id, {
      baseUrl: mirrors[0],
      label: "Live McFlamingo — homepage",
      provider: "Popmenu",
    });
  }
  if (mirrors[1]) {
    next = updateRung(next, next.rungs[1]!.id, {
      baseUrl: mirrors[1],
      label: "Live McFlamingo — menu",
      provider: "Popmenu",
    });
  }

  next = assignRungs(next, storeId, [next.rungs[0]!.id, next.rungs[1]!.id]);
  return goLive(next, storeId, { pixelIndex: 1 });
}

/** Invite prerequisites — what operators must know before sending a link. */
export function continuityInvitePrerequisites(): string[] {
  return [
    "Create the offer on /continuity first (that mints the secure token).",
    "Lab today: invite only works in the same browser profile (ops state is localStorage).",
    "Merchant taps Turn on Continuity — no DNS / digest homework.",
    "You attach the storefront digest + booths before Go live (or use Demo: McFlamingo shines in).",
  ];
}

/**
 * Self-serve shine-in — brand owner path (no operator invite).
 * Non-tech story: name + site → optional snapshot → Shine in.
 */
export async function selfServeShineIn(
  state: ContinuityOpsState,
  input: {
    name: string;
    domain: string;
    originUrl?: string;
    /** Homepage HTML or snapshot text; if omitted, a placeholder digest is used */
    artifactHtml?: string;
    mirrorUrls?: string[];
    priceUsdPerMonth?: number;
  },
): Promise<ContinuityOpsState> {
  const name = input.name.trim();
  const domain = input.domain.trim();
  if (!name) throw new Error("Tell us your brand name");
  if (!domain) throw new Error("Tell us your website");
  const originUrl = (input.originUrl ?? `https://${domain.replace(/^https?:\/\//, "")}`).trim();
  const artifact =
    input.artifactHtml?.trim() ||
    `<!doctype html><html><head><title>${name}</title></head><body><h1>${name}</h1><p>Shone into Pixel Continuity.</p><p>${originUrl}</p></body></html>`;

  let next = createStoreOffer(state, {
    name,
    domain,
    originUrl,
    priceUsdPerMonth: input.priceUsdPerMonth ?? DEFAULT_MAP_FEE_USD,
  });
  const storeId = next.stores[0]!.id;
  const token = next.stores[0]!.inviteToken;
  next = markInviteSent(next, storeId);
  next = merchantJoin(next, token, { originUrl });
  next = attachStoreDigest(next, storeId, await digestArtifactText(artifact));

  const mirrors = input.mirrorUrls ?? [];
  if (mirrors[0]) {
    next = updateRung(next, next.rungs[0]!.id, {
      baseUrl: mirrors[0],
      label: "Your booth A",
      provider: "Lab",
    });
  }
  if (mirrors[1]) {
    next = updateRung(next, next.rungs[1]!.id, {
      baseUrl: mirrors[1],
      label: "Your booth B",
      provider: "Lab",
    });
  }

  next = assignRungs(next, storeId, [next.rungs[0]!.id, next.rungs[1]!.id]);
  return goLive(next, storeId, { pixelIndex: 1 });
}

export function shineInPlainThesis(): string {
  return "If your host goes dark, your customers can still reach you. Bring your brand. Press Shine in. No DNS homework.";
}

function randomToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(18));
  return [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function id(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

/** Step 1 — create a store offer (admin). */
export function createStoreOffer(
  state: ContinuityOpsState,
  input: {
    name: string;
    domain: string;
    originUrl: string;
    priceUsdPerMonth?: number;
    tillCutBpsWhenOriginDark?: number;
    tillCutBpsWhenOriginUp?: number;
  },
): ContinuityOpsState {
  const now = Date.now();
  const store: ContinuityStore = {
    id: id("store"),
    name: input.name.trim(),
    domain: input.domain
      .trim()
      .toLowerCase()
      .replace(/^https?:\/\//, "")
      .replace(/\/$/, ""),
    originUrl: input.originUrl.trim() || `https://${input.domain.trim()}`,
    priceUsdPerMonth: input.priceUsdPerMonth ?? DEFAULT_MAP_FEE_USD,
    tillCutBpsWhenOriginDark: input.tillCutBpsWhenOriginDark ?? DEFAULT_TILL_BPS_ORIGIN_DARK,
    tillCutBpsWhenOriginUp: input.tillCutBpsWhenOriginUp ?? 0,
    inviteToken: randomToken(),
    step: "draft",
    rungIds: [],
    createdAt: now,
    updatedAt: now,
  };
  return { ...state, stores: [store, ...state.stores] };
}

/** Step 2 — mark invite sent (admin copied secure link). */
export function markInviteSent(state: ContinuityOpsState, storeId: string): ContinuityOpsState {
  return patchStore(state, storeId, { step: "invite_sent" });
}

/**
 * Step 3 — merchant accepts invite (secure link).
 * Handshake only: confirm the shop. Digest optional (operator may attach later).
 * Never ask merchants for DNS/rsync.
 */
export function merchantJoin(
  state: ContinuityOpsState,
  inviteToken: string,
  input: { originUrl?: string; digest?: Hex; note?: string },
): ContinuityOpsState {
  const store = state.stores.find((s) => s.inviteToken === inviteToken);
  if (!store) throw new Error("Invite not found or expired");
  if (store.step === "live") throw new Error("Store already live");
  return patchStore(state, store.id, {
    originUrl: (input.originUrl ?? store.originUrl).trim(),
    digest: input.digest ?? store.digest,
    note: input.note,
    step: "merchant_joined",
    joinedAt: Date.now(),
  });
}

/** Operator attaches / replaces artifact digest after merchant handshake. */
export function attachStoreDigest(
  state: ContinuityOpsState,
  storeId: string,
  digest: Hex,
): ContinuityOpsState {
  if (!/^[0-9a-f]{128}$/i.test(digest)) throw new Error("digest must be 128-hex sha512");
  return patchStore(state, storeId, { digest });
}

/** Step 4 — assign mirror rungs (admin). */
export function assignRungs(
  state: ContinuityOpsState,
  storeId: string,
  rungIds: string[],
): ContinuityOpsState {
  if (rungIds.length < 1) throw new Error("Assign at least one rung");
  for (const rid of rungIds) {
    if (!state.rungs.some((r) => r.id === rid)) throw new Error(`Unknown rung ${rid}`);
  }
  return patchStore(state, storeId, { rungIds: [...rungIds], step: "rungs_assigned" });
}

/**
 * Operator-only booth jobs. Merchants never see this list.
 * Titles stay operational — this is the backstage, not the handshake.
 */
export function buildDeployPlan(
  store: ContinuityStore,
  rungs: MirrorRung[],
): DeployChecklistItem[] {
  const selected = rungs.filter((r) => store.rungIds.includes(r.id));
  const slug = store.domain.replace(/[^a-z0-9.-]+/gi, "-");
  const items: DeployChecklistItem[] = [
    {
      id: "snapshot",
      title: "Hold storefront snapshot",
      detail: `Artifact digest ${store.digest?.slice(0, 16) ?? "(attach digest)"}…`,
      done: Boolean(store.digest),
    },
  ];
  for (const r of selected) {
    items.push({
      id: `booth-${r.id}`,
      title: `Publish to ${r.label}`,
      detail: `Serve ${store.domain} from ${r.baseUrl}.`,
      commandHint: `rsync -avz ./snapshot/ ${r.provider.toLowerCase()}:/var/www/${slug}/`,
      done: false,
    });
  }
  items.push({
    id: "failover",
    title: "Wire origin → booth failover",
    detail: "Health-check origin; fail over to booth pool when dark.",
    commandHint: `# operator: LB / DNS failover — never merchant homework`,
    done: false,
  });
  items.push({
    id: "verify-digest",
    title: "Verify live booth digest",
    detail: "Fetched bytes must match the shone-in digest.",
    commandHint: `curl -sL <mirror-url> | shasum -a 512`,
    done: false,
  });
  return items;
}

/**
 * Step 5 — go live: SISO record into the light + deploy checklist.
 * Does not rsync by itself (operator/agent runs the plan).
 */
export async function goLive(
  state: ContinuityOpsState,
  storeId: string,
  opts?: { pixelIndex?: number },
): Promise<ContinuityOpsState> {
  const store = state.stores.find((s) => s.id === storeId);
  if (!store) throw new Error("Store not found");
  if (!store.digest) throw new Error("Need artifact digest before live");
  if (store.rungIds.length < 1) throw new Error("Assign rungs before live");

  const mirrors = state.rungs.filter((r) => store.rungIds.includes(r.id)).map((r) => r.baseUrl);

  let continuity = await comeTowardLight({
    name: store.domain,
    kind: "static_site",
    digest: store.digest,
    languages: ["html"],
    originHost: "unknown",
    originUrl: store.originUrl,
    mirrors,
  });
  continuity = acceptIntoLight(continuity, opts?.pixelIndex ?? 0);
  const deployPlan = buildDeployPlan(store, state.rungs);

  return patchStore(state, storeId, {
    step: "live",
    continuity,
    deployPlan,
  });
}

export function toggleDeployItem(
  state: ContinuityOpsState,
  storeId: string,
  itemId: string,
  done?: boolean,
): ContinuityOpsState {
  const store = state.stores.find((s) => s.id === storeId);
  if (!store?.deployPlan) throw new Error("No deploy plan — go live first");
  const deployPlan = store.deployPlan.map((item) =>
    item.id === itemId ? { ...item, done: done ?? !item.done } : item,
  );
  return patchStore(state, storeId, { deployPlan });
}

export function updateRung(
  state: ContinuityOpsState,
  rungId: string,
  patch: Partial<Pick<MirrorRung, "label" | "baseUrl" | "provider">>,
): ContinuityOpsState {
  return {
    ...state,
    rungs: state.rungs.map((r) => (r.id === rungId ? { ...r, ...patch } : r)),
  };
}

/** Health probe — fetch rung base (lab; opaque CORS may mark unknown). */
export async function probeRung(rung: MirrorRung): Promise<MirrorRung> {
  const started = Date.now();
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 4000);
    const res = await fetch(rung.baseUrl, {
      method: "GET",
      mode: "cors",
      signal: ctrl.signal,
    });
    clearTimeout(t);
    return {
      ...rung,
      health: res.ok || res.status === 404 || res.status === 403 ? "up" : "down",
      lastCheckedAt: Date.now(),
    };
  } catch {
    // Many rungs block browser CORS — treat as unknown, not down.
    const elapsed = Date.now() - started;
    return {
      ...rung,
      health: elapsed >= 3900 ? "down" : "unknown",
      lastCheckedAt: Date.now(),
    };
  }
}

export async function digestArtifactText(text: string): Promise<Hex> {
  return sha512Hex(text);
}

export async function digestArtifactFile(file: Blob): Promise<Hex> {
  const buf = new Uint8Array(await file.arrayBuffer());
  return sha512Hex(buf);
}

export function storeByInvite(
  state: ContinuityOpsState,
  token: string,
): ContinuityStore | undefined {
  return state.stores.find((s) => s.inviteToken === token);
}

export function stepIndex(step: ContinuityStep): number {
  const order: ContinuityStep[] = [
    "draft",
    "invite_sent",
    "merchant_joined",
    "rungs_assigned",
    "live",
  ];
  return order.indexOf(step);
}

export function stepLabel(step: ContinuityStep): string {
  switch (step) {
    case "draft":
      return "1 · Offer created";
    case "invite_sent":
      return "2 · Invite sent";
    case "merchant_joined":
      return "3 · Merchant joined";
    case "rungs_assigned":
      return "4 · Rungs assigned";
    case "live":
      return "5 · Live on ladder";
  }
}

function patchStore(
  state: ContinuityOpsState,
  storeId: string,
  patch: Partial<ContinuityStore>,
): ContinuityOpsState {
  return {
    ...state,
    stores: state.stores.map((s) =>
      s.id === storeId ? { ...s, ...patch, updatedAt: Date.now() } : s,
    ),
  };
}

/** Active till bps for a store given current continuity state. */
export function activeTillBps(store: ContinuityStore): number {
  if (store.continuity?.state === "origin_dark") return store.tillCutBpsWhenOriginDark;
  return store.tillCutBpsWhenOriginUp;
}

export function tillIsActive(store: ContinuityStore): boolean {
  return activeTillBps(store) > 0 && store.step === "live";
}

/** Quote PIX till fee for a settlement amount (integer PIX units). */
export function tillFeePix(store: ContinuityStore, amountPix: number): number {
  const bps = activeTillBps(store);
  if (bps <= 0 || amountPix <= 0) return 0;
  return Math.floor((amountPix * bps) / 10_000);
}

export function tillAccruedPix(store: ContinuityStore): number {
  return (store.tillEvents ?? []).reduce((s, e) => s + e.feePix, 0);
}

/**
 * Record a simulated settlement against the till.
 * Lab bookkeeping only — does not mint UTXOs or touch the chain.
 */
export function recordTillSettlement(
  state: ContinuityOpsState,
  storeId: string,
  amountPix: number,
  opts?: { via?: TillEvent["via"]; note?: string },
): ContinuityOpsState {
  const store = state.stores.find((s) => s.id === storeId);
  if (!store) throw new Error("Store not found");
  if (store.step !== "live") throw new Error("Store must be live");
  if (amountPix <= 0) throw new Error("amountPix must be positive");
  if (!tillIsActive(store)) {
    throw new Error("Till idle — mark origin dark (or set tillCutBpsWhenOriginUp) first");
  }
  const bps = activeTillBps(store);
  const feePix = tillFeePix(store, amountPix);
  if (feePix <= 0) throw new Error("Fee rounds to zero — raise amount or bps");
  const event: TillEvent = {
    id: id("till"),
    at: Date.now(),
    amountPix,
    feePix,
    bps,
    via: opts?.via ?? "simulated",
    note: opts?.note ?? "lab till — not on-chain",
  };
  return patchStore(state, storeId, {
    tillEvents: [...(store.tillEvents ?? []), event],
  });
}

/**
 * Operator marks origin dark — till switches to outage cut.
 * Does not touch booth jobs; SISO state drives the fee regime.
 */
export function markStoreOriginDark(
  state: ContinuityOpsState,
  storeId: string,
): ContinuityOpsState {
  const store = state.stores.find((s) => s.id === storeId);
  if (!store?.continuity) throw new Error("Store not live in the light");
  return patchStore(state, storeId, { continuity: markOriginDark(store.continuity) });
}

/**
 * Lab chaos drill: live store → origin dark → mirrors serve → till accrues.
 * Evidence for Continuity desk — not Gate J public-regime chaos drill.
 */
export async function runChaosDrill(
  state: ContinuityOpsState,
  storeId: string,
  opts?: { settlementPix?: number },
): Promise<{ state: ContinuityOpsState; report: ChaosDrillReport }> {
  const store = state.stores.find((s) => s.id === storeId);
  if (!store) throw new Error("Store not found");
  if (store.step !== "live" || !store.continuity) {
    throw new Error("Store must be live with SISO continuity");
  }
  if (!(store.continuity.artifact.mirrors?.length ?? 0)) {
    throw new Error("Need at least one booth/mirror for drill");
  }

  let next = state;
  if (store.continuity.state !== "origin_dark") {
    next = markStoreOriginDark(next, storeId);
  }
  const afterDark = next.stores.find((s) => s.id === storeId)!;
  const mirrorsServe = canServeWithoutOrigin(afterDark.continuity!);
  if (!mirrorsServe) throw new Error("canServeWithoutOrigin failed after origin_dark");
  if (!tillIsActive(afterDark)) throw new Error("till not active after origin_dark");

  const settlementPix = opts?.settlementPix ?? 10_000;
  next = recordTillSettlement(next, storeId, settlementPix, {
    via: "mirror",
    note: "chaos drill — simulated checkout while origin dark (lab)",
  });
  const live = next.stores.find((s) => s.id === storeId)!;
  const feePix = tillFeePix(afterDark, settlementPix);
  const report: ChaosDrillReport = {
    storeId,
    originDark: live.continuity?.state === "origin_dark",
    mirrorsServe,
    tillActive: tillIsActive(live),
    settlementPix,
    feePix,
    accruedPix: tillAccruedPix(live),
    claim:
      "Lab: origin_dark → mirrors allow serve → till bookkeeping accrues on simulated PIX volume. Not Gate J public drill.",
  };
  return { state: next, report };
}

/** Merchant-facing pricing line (no infra jargon). */
export function merchantOfferCopy(store: ContinuityStore): string {
  const tillPct = (store.tillCutBpsWhenOriginDark / 100).toFixed(
    store.tillCutBpsWhenOriginDark % 100 === 0 ? 0 : 2,
  );
  return `$${store.priceUsdPerMonth}/mo to stay online. If your host goes down and sales still clear, ${tillPct}% till on those checkouts.`;
}

export function continuityThesis(): string {
  return "Handshake: sign up the shop. Map fee keeps them on the ladder; till earns when origin is dark and money still moves. Booth jobs stay operator-side — not a second AWS monopoly.";
}
