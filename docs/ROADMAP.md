# What earns coder respect — ordered

Engineers respect **runnable truth**, not vision decks. Do these in order.

## Now (this repo — foundation)

- [x] Real UTXO settlement + verify
- [x] PoLS illuminate / acceptPixel
- [x] Persist + in-process multi-node proof
- [x] One API (Source · Word · Light)
- [x] SISO continuity model
- [x] Spec + threat model drafts
- [x] CI running all selftests
- [x] Access intents — SMS/USSD/helper/offline + BD/KS personas (`One.Access`)
- [x] Kindling Presence Seals + Energy Truth + self-custody Personal Source (`One.Kindling` / `One.Custody`)
- [x] Uptake ladder — signal bridges invite only; never hold keys
- [x] Worldlight ingress — $USD / domain / treasury / app → light (`One.Worldlight`)
- [x] Lock feeder — USDC rail + bank-wire attestor + `PixelUsdcLock.sol` (`One.LockFeeder`)

## Next (respect unlock)

1. **Two-terminal networked demo** — `pixel init` / `pixel node` / `pixel join` always works; publish latency numbers  
2. **Live SMS/USSD gateway pilot** — real aggregator → `One.Access.handle` → illuminate (Bangladesh + rural US)  
3. **Crypto upgrade path** — ML-DSA behind the same `sign/verify` interface; vectors checked in CI  
4. **Foreign verifier** — Solidity (and one Move/CosmWasm) that verifies a frozen ULA fixture  
5. **Headers-first sync** — light clients don’t download full history  
6. **Peer identity + scoring** — eclipse resistance basics  
7. **Bench harness** — published tx/s with N txs per pixel  

## Then (serious network)

7. Provider registry + diversity enforcement at runtime  
8. Subnet checkpoints  
9. Production mirror mesh for SISO (IPFS/HTTP peers)  
10. External audit of crypto + acceptPixel  

## Never (kills respect)

- Claiming “AWS-proof” without live diverse nodes  
- Burn theater, empty whitepapers, forced rewrites  
- Hiding failing tests behind metaphors  
