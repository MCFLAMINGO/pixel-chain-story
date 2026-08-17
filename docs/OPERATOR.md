# Adding a second operator — the runbook

Two people, two machines, and **neither ever holds the other's key**. That constraint is the
whole design: possession and authorization are separate signatures precisely so that inviting
someone does not require trusting them with anything, or them trusting you.

Read [`DURABILITY.md`](./DURABILITY.md) for what Tier 1 vs sequencing actually buys (readable
vs extendable), then [`FINALITY.md`](./FINALITY.md) and [`STATE-2026-08-17.md`](./STATE-2026-08-17.md)
if you want the reasoning. This file is just the steps.

**Today sequencing is invitation-only.** A PIX-bond door for phone light-verifiers is designed
in `DURABILITY.md` (hybrid) and not shipped — do not tell a joiner they can stake their way in.

---

## Tier 1 — they hold a verified copy (do this first, on its own)

**This is the single highest-value thing available**, and it needs nothing from you but a
message. It takes your worst case from _the chain is gone_ to _someone else presses go_.
`STATE-2026-08-13.md` has had it as priority #1 for days.

### Send them this

```bash
git clone https://github.com/MCFLAMINGO/pixel-chain-story
cd pixel-chain-story && bun install

# Pull the real chain, and refuse anything that is not it
bun run pixel -- join --peer https://pixel-tip-production.up.railway.app \
  --datadir ./pixel-data --require-crowned

# Check it themselves — replays every pixel, recomputes the supply independently,
# then reads the anchor contract on Sepolia directly
bun run verify:crowned

# Seal the key before ever running a node with it
PIXEL_KEY_PASSPHRASE='<a real passphrase they choose>' \
  bun run pixel -- key seal --datadir ./pixel-data
```

### Then confirm the genesis out loud

`join --require-crowned` prints the genesis hash. Have them read the first sixteen characters
back to you **over a different channel** than the one they got the link from:

```
f1d193f62d54e982…
```

That is the whole point of `--require-crowned`: they cannot be handed a different Earth by
accident, and the read-back closes the case where they were handed a different _link_.

### What they are now

A verifying holder. They have all 47 pixels, they have checked them without trusting you, and
they can restore from that datadir if yours is lost. **They are not yet producing pixels**, and
that is fine — this tier is worth doing even if you stop here.

> **Do not send them a copy of your datadir.** It contains your key. They forge their own
> identity by joining, which is why the steps above never move a secret.

---

## Tier 2 — your side: make gossip reachable

Right now your node advertises `gossipUrl: ws://127.0.0.1:9001/gossip` and reports `peers: 0`.
That is localhost. A second node can sync over HTTP `/sync`, but it cannot join the mesh.

```bash
# On the machine running the tip
bun run pixel -- node --datadir ./pixel-data \
  --rpc 8545 --gossip 9001 --advertise <your-public-host>
```

…and open port 9001 to them.

**Do this deliberately, and only now.** That closed port is the only reason the takeover found
on 16 August was never remotely exploitable. Opening it is safe _because_ Phase 1 landed:
membership is a fold over chain history, so a stranger reaching the gossip port can no longer
produce anything. Sequencing the soundness work before this was the entire point of the gate.

---

## Tier 3 — make them a producing operator

Three commands, two machines, one file passed between them.

### Step 1 — you: tell them your address

```bash
bun run pixel -- membership status --peer http://<your-host>:8545
```

Prints who may currently produce and what the next pixel number is. Send them the address
listed under `electable now` — that is the authorizer they must name.

### Step 2 — them: prove they hold their address

```bash
bun run pixel -- membership request \
  --datadir ./pixel-data \
  --peer http://<your-host>:8545 \
  --authorizer <your pix1… address> \
  --out join-request.json
```

They send you `join-request.json`. **It contains no secret** — an address, a public key, and
signatures. Email it, paste it in a chat, whatever. The selftest asserts that none of their
seed or secret key appears anywhere in that file.

It prints something like `valid for pixels #47..#70`. That window matters — see
[why a window](#why-the-request-expires) below.

### Step 3 — you: authorize it

```bash
bun run pixel -- membership authorize \
  --datadir ./pixel-data \
  --request join-request.json \
  --peer http://<your-host>:8545
```

Output:

```
authorised pix1…
  committing at pixel #47, electable from #55
  the delay is deliberate: a producer must not be elected by a set it just wrote.
```

### Step 4 — wait out the delay, then confirm

Eight pixels after the record is committed, they become electable. Confirm on **both** nodes:

```bash
bun run pixel -- membership status --peer http://<your-host>:8545
bun run pixel -- membership status --peer http://<their-host>:8545
```

Both must list both addresses. They will, if both hold the same history — membership is a fold
over committed records, not a local setting, so two nodes with the same pixels cannot disagree
about who may produce.

---

## Why the request expires

`includedAt` — the height the record is committed at — is **inside the signed claim**. Both
signatures cover it. So the joiner has to commit to a height before you have authorized
anything, and they cannot know when you will get round to it.

So `membership request` pre-signs a window of upcoming heights (24 by default) and
`membership authorize` picks whichever one is current. If the window has passed, it refuses and
asks for a fresh request rather than guessing. A signature means what it signed.

Two notes:

- A **hash-OTS** key gets a window of **1**, because each signature burns a one-time leaf.
  Those operators need prompt authorization. ML-DSA is multi-use, so the window is free.
- This is solved in the CLI, not in the record format. The format is committed on-chain,
  specified in [`SPEC.md`](./SPEC.md) §4.2, and pinned in the frozen vectors — a scheduling
  inconvenience is not a reason to change consensus.

---

## What can go wrong, and what it means

| Message                                                                    | What happened                                                                                                                  |
| -------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `this request names <addr> as authorizer, but this datadir holds <other>`  | They named the wrong address. The authorizer is signed, so it cannot be substituted — ask for a fresh request.                 |
| `the tip is at pixel #N, outside this request's window`                    | The window elapsed. Ask for a fresh request.                                                                                   |
| `membership record is stamped for pixel #N but the next pixel is #M`       | Same cause, caught one layer deeper.                                                                                           |
| `membership record authorised by <addr>, which is not an active sequencer` | You are not currently electable on the chain they synced from. Check `membership status`.                                      |
| `Wrong PIXEL_KEY_PASSPHRASE`                                               | The key is sealed and the passphrase is wrong. **Nothing is damaged** — the datadir is fine and the right passphrase opens it. |
| `This datadir holds a sealed node key but PIXEL_KEY_PASSPHRASE is not set` | The variable is missing from the node's environment. It must be present at every start, not only when sealing.                 |

---

## What this buys, and what it does not

**Buys:** liveness and censorship resistance. Proven by `bun run test:two-operator`, which
invites a second operator by signed record, waits the delay, kills whichever operator the
lottery elected, shows the survivor carry the tip forward on the skip path, restarts the dead
one, and asserts both converge on the identical tip hash.

Until that test existed, the honest summary of this project was _"what a single sequencer lacks
is liveness and censorship resistance, which is a succession problem, not a consensus one."_
That sentence is now false.

**Does not buy:** BFT, finality by default, or an unpredictable leader.

- Finality exists but ships **off** — see [`FINALITY.md`](./FINALITY.md). Enable it only once
  both anchor venues are reliably reachable, or it finalises nothing.
- The leader is still **publicly predictable** from `prevHash` and `sequence`, so the next
  producer can be targeted for denial of service. It did not matter with one operator. With
  two it starts to. See [`LEADER-UNPREDICTABILITY.md`](./LEADER-UNPREDICTABILITY.md) — the fix
  is a hard fork and belongs on a fresh devnet id first.
- Two operators is two, not seven. Losing one leaves one, and one is where you started.

---

## Order of operations, in one line

Tier 1 today (it costs a message and removes the worst outcome), Tier 2 when you are ready to
open a port, Tier 3 when there is a person on the other end who wants to run a node — and
Tier 1 is worth doing even if Tier 3 never happens.
