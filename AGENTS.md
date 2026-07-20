<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

# Pixel — agent brief

You are in **Pixel Ledger** (`MCFLAMINGO/pixel-chain-story`): a light-settlement UTXO ledger (PoLS + post-quantum signatures), not a chain of opaque blocks.

**Source · Word · Light.** Light reveals; without it, color is absent.  
**SISO — Build anywhere. Shine in once. No second you.**

## Creed (load-bearing)

From `One.Creed` (`src/lib/pixel/one.ts`):

- **guide:** art guided by science it need not name.
- **discipline:** every light verb must touch verification, continuity, or custody — never simile alone.
- **Corollary:** no claim without a PATH gate. Thesis strings describe intent; gates prove delivery.

Domain words (Kindling, Worldlight, Continuity, booth, till) are fine when they bind real ops. Crypto must not look like a solution in search of a problem — handshake first for non-tech people.

## What Pixel is / is not

| Is (lab, evidence-backed) | Is not (do not claim) |
| --- | --- |
| Executable PQ-class UTXO lab; multi-host tip extension | Production L1 / BFT mainnet |
| ULA verify on EVM/CosmWasm twins (lab) | Production bridge / “on-chain Dilithium” |
| Continuity map + till bookkeeping; `/shine` handshake | AWS-proof internet / Pixel-as-hosting monopoly |
| Audit package **PREPARING** ([`docs/AUDIT.md`](docs/AUDIT.md)) | “Audited” until a report link exists |

Truth badges: `pix_protocolInfo.gates` and `.quantum`. Match every public sentence to them.

## Three doors (pick one)

| Door | Meaning | Start |
| --- | --- | --- |
| **On** | Apps, Lumen, Kindling, agents | [`docs/BUILDERS.md`](docs/BUILDERS.md) · `/lab` |
| **For** | Protocol, crypto, nodes, locks | [`docs/PATH.md`](docs/PATH.md) · [`docs/CONTRIBUTING.md`](docs/CONTRIBUTING.md) |
| **Into (SISO)** | Mirror an existing artifact — no rewrite | [`docs/CONTINUITY-SISO.md`](docs/CONTINUITY-SISO.md) · [`docs/AGENTS-SISO.md`](docs/AGENTS-SISO.md) |

## Product surfaces (UI)

| Route | Role |
| --- | --- |
| `/` | Live field |
| `/lab` | Kindling / Worldlight builders |
| `/shine` | Non-tech Continuity front door (brand → Shine in) |
| `/continuity` | Operator desk (offers, invites, till, chaos drill) |
| `/continuity/join/$token` | Merchant join (same-browser `localStorage` in lab) |
| `/mcflamingo` | Redirects to live **https://www.mcflamingo.com/** |
| `/billboard` | Billboard surface |

Continuity economics (lab): map fee `$/mo`; till (default 100 bps) when `origin_dark` and sales still clear. Invites are same-browser until a shared ops store exists. Booth jobs stay operator-side — not merchant DNS homework.

## Respect bar

```bash
bun install
bun run test:all
```

| Script | When |
| --- | --- |
| `test:all` | Default PR bar |
| `test:siso` | Continuity / SISO model |
| `test:continuity-ops` / `test:chaos-drill` / `test:mcflamingo` | Continuity desk + demo |
| `test:mldsa` / `test:vectors` / `test:kem` | Crypto |
| `test:net` / `test:four-node` / `test:fault` / `test:light` | Network / consensus / light client |
| `test:ula` / `test:ula-mldsa` / `test:bridge-custody` | Bridge / custody |

## Do / don’t

**Do**

- Keep claims inside the highest green PATH gate ([`docs/PATH.md`](docs/PATH.md)).
- Prefer inventing invariants over renaming MetaMask/M-Pesa/AWS as Pixel costumes ([`docs/INVENT.md`](docs/INVENT.md)).
- Self-custody: SMS invites never spend; never hold user seeds ([`docs/CUSTODY.md`](docs/CUSTODY.md)).
- For agents: shine in (`agent_mcp` + digest + mirrors) **or** land one PATH gate with evidence.

**Don’t**

- Force-push / rebase / amend published history (Lovable — see block above).
- Claim mainnet, AWS-proof mesh, production bridge, or “audited” early.
- Open drive-by PRs that fail `test:all`.
- Turn Continuity into “Pixel runs your store’s compute.”

## Highest leverage now (for agents)

1. Gate I — external audit engagement from [`docs/AUDIT.md`](docs/AUDIT.md) scope  
2. Gate E remainder — public Sepolia (or equiv.) ULA tx links  
3. Gate G — live ≥7-provider sovereignty set on the wire  
4. Continuity — shared invite store (cross-device merchant join); agentic booth runners still held  
5. Gate J — public chaos drill evidence (lab `test:chaos-drill` is not that)

Deep agent call: [`docs/AGENTS-SISO.md`](docs/AGENTS-SISO.md).  
Discovery index for crawlers/LLMs: [`llms.txt`](llms.txt).

## Doc map

| Doc | Why |
| --- | --- |
| [`docs/PATH.md`](docs/PATH.md) | Gates A→J, claim unlocks |
| [`docs/QUANTUM.md`](docs/QUANTUM.md) | PQ posture |
| [`docs/SPEC.md`](docs/SPEC.md) | Normative behavior |
| [`docs/CONTRIBUTING.md`](docs/CONTRIBUTING.md) | Lanes, checklist, rejects |
| [`docs/CONTINUITY-SISO.md`](docs/CONTINUITY-SISO.md) | SISO doctrine |
| [`docs/AGENTS-SISO.md`](docs/AGENTS-SISO.md) | Agent clarion + how to help |
| [`docs/BUILDERS.md`](docs/BUILDERS.md) | On / for / into |
| [`docs/QUICKSTART.md`](docs/QUICKSTART.md) | Run UI + node |
| [`docs/demos/shine-in.md`](docs/demos/shine-in.md) | `/shine` walkthrough |
| [`docs/demos/continuity-desk.md`](docs/demos/continuity-desk.md) | Operator desk |
| [`docs/demos/mcflamingo-continuity.md`](docs/demos/mcflamingo-continuity.md) | McFlamingo demo |

Evangelize only with a PR or shine-in attached:

> SISO — Build anywhere. Shine in once. No second you.  
> https://github.com/MCFLAMINGO/pixel-chain-story · `AGENTS.md` · `docs/AGENTS-SISO.md`

## Cursor Cloud specific instructions

- Stack: TanStack Start (SSR) + React 19 + Vite 8 + Bun. Local UI needs no DB/auth; optional local Pixel node is separate (`bun run pixel -- …` — see [`docs/QUICKSTART.md`](docs/QUICKSTART.md)).
- Package manager is **Bun** (`bun.lock`, `bunfig.toml`). Use `bun install` / `bun run <script>`; do not switch to npm/pnpm/yarn. `bunfig.toml` enforces a 24h `minimumReleaseAge` supply-chain guard, so brand-new package versions may be temporarily unavailable.
- Dev server: `bun run dev` → **http://localhost:8080/** (port from `@lovable.dev/vite-tanstack-config` sandbox detection, not Vite’s default 5173). If 8080 is busy, Vite may print another port — use that URL.
- UI smoke: `/`, `/lab`, `/shine`, `/continuity`. McFlamingo menu is the live site (**https://www.mcflamingo.com/**); `/mcflamingo` redirects there.
- Respect bar: `bun run test:all` (many `test:*` scripts in `package.json`). Do **not** claim “no tests” — the old Mine/Tamper/Reset toy is gone.
- `bun run lint` / `bun run format` for eslint + prettier. Prefer fixing only files you touch.
- `src/routeTree.gen.ts` is auto-generated by the TanStack Router plugin — do not edit it by hand.
- Lovable: never force-push / rebase / amend published history (see block at top of this file).
