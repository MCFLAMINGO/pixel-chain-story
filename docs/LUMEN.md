# Lumen — light-native language

Lumen is **not** TypeScript with poetry comments. It is a small language whose opcodes are the ledger’s verbs.

```
ghost tx = commit(...)   # superposition
veil tx private          # privacy
when light:
  shine tx via sequence  # PoLS illuminate
  collapse tx            # one truth
  paint tx               # pixel color exists
```

## Status

| Piece | State |
| --- | --- |
| Parser (`parse.ts`) | Real |
| Interpreter (`runtime.ts`) | Real — drives UTXO + optical recover |
| Example module | `TRANSFER_LUMEN` / `examples/transfer.lumen` |
| CI | Exercised in `test:pixel` (`read_key` + `send`) |
| Lab UI editor | Next (see below) |

## Why it matters for respect

Anyone can call `proposeTransfer` from TS. Lumen makes the **invention visible**: the instruction set *is* light. Evolve Lumen and the project stays distinct; abandon it and Pixel looks like “UTXO demo + metaphors.”

## Evolve plan

1. **Lab editor** — textarea + Run ray → live balances  
2. **Rays for Kindling / Worldlight** — `kindle`, `shine_in` bound to `One.*`  
3. **Better diagnostics** — parse errors with line + light vocabulary  
4. **Module store** — save `.lumen` beside datadir  
5. **No fake ops** — every builtin must touch chain/optical/custody for real

## Run today

```bash
bun run test:pixel   # executes TRANSFER_LUMEN send + read_key
```
