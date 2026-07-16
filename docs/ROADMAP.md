# What earns coder respect — ordered

Engineers respect **runnable truth**, not vision decks.  
Full doctrine + gate definitions: [`PATH.md`](./PATH.md).

## Gate A — foundation (this repo)

- [x] Real UTXO settlement + verify
- [x] PoLS illuminate / acceptPixel (sequential tip)
- [x] Persist + in-process multi-node proof
- [x] One API (Source · Word · Light)
- [x] SISO continuity model
- [x] Spec + threat model drafts
- [x] CI running all selftests (crypto landmines included)
- [x] Access intents — SMS/USSD/helper/offline + BD/KS personas (`One.Access`)
- [x] Kindling Presence Seals + Energy Truth + self-custody Personal Source
- [x] Uptake ladder — signal bridges invite only; never hold keys
- [x] Worldlight ingress — $USD / domain / treasury / app → light
- [x] Lock feeder — USDC rail + bank-wire attestor + `PixelUsdcLock.sol`
- [x] Merkle-window OTS + fail-closed weak verifier + address↔pubkey bind
- [x] Diversity policy enforced when ≥7 providers registered
- [x] Honest framing (SPEC §8 / PATH Gate A claims only)

## Gate B — network that doesn’t flake

- [ ] Two-terminal / two-VPS `pixel init|node|join` demo (documented + reproducible)
- [ ] Reconnect + hole-filling catch-up (`get_pixels` / headers)
- [ ] Stall detection design (elected sequencer silent)

## Gate C — consensus that survives fault

- [ ] SPEC fork-choice / tip rules under partition
- [ ] Sequencer timeout + replacement (tested)
- [ ] Bounded reorg / tip-replace policy

## Gate D — quantum security (critical)

- [x] `signPixel` / `verifyPixel` scheme surface
- [x] NIST ML-DSA-65 (`PIX-ML-DSA-65`) on tx + PoLS — `bun run test:mldsa`
- [x] Hash-OTS window retained
- [x] [`docs/QUANTUM.md`](./QUANTUM.md)
- [ ] Frozen public vectors in CI
- [x] Persist `scheme` + ML-DSA secret in nodekey/wallets
- [ ] Default new genesis to ML-DSA when ready (`PIXEL_SIG_SCHEME=PIX-ML-DSA-65` works now)

## Gate E — bridge that verifies

- [ ] Real `ULAVerifier` (no stub accept for value)
- [ ] Foundry tests + frozen ULA fixture
- [ ] Second-chain twin (CosmWasm or Move)
- [ ] Testnet relayer: `Locked` → feed → shineIn

## Gate F — light clients & gossip

- [ ] Headers-first sync + balance merkle proofs
- [ ] Peer identity + scoring (eclipse basics)
- [ ] Published bench harness (`docs/BENCH.md`)

## Gate G — sovereignty on a live set

- [ ] Provider registry on-wire at admission
- [ ] ≥7 independent operators (pilot)
- [ ] Public / RPC live diversity report
- [ ] Cloud-majority join rejection demo

## Gate H — Kindling / optical real channel

- [ ] `getUserMedia` (or native) capture path
- [ ] Seals with `channel: "optical-capture"`
- [ ] Two-device remote-fail proof

## Gate I — external scrutiny

- [ ] Scoped audit (crypto + acceptPixel + ULA)
- [ ] `docs/AUDIT.md` + criticals fixed

## Gate J — public regime

- [ ] Named public network + genesis notes
- [ ] Subnet checkpoints / multi-committee
- [ ] SISO chaos drill (origin dark, mirrors serve)
- [ ] No required CDN for ledger use

## Never (kills respect)

- Claiming “AWS-proof” without Gate G evidence
- Claiming “production bridge” while `ULAVerifier` is a stub
- Burn theater, empty whitepapers, forced rewrites
- Hiding failing tests behind metaphors
- Asking for respect in marketing before the gate is green
