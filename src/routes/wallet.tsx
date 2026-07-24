import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { usePeopleWallet } from "@/hooks/use-people-wallet";
import { peopleWalletThesis } from "@/lib/pixel/people-wallet";
import { formatCanvasId, settlementHonesty } from "@/lib/pixel";

/**
 * People wallet door — hold a Personal Source without CLI init.
 * Pay face only; vault never rendered. Balance from shared tip when ?rpc= / VITE_PIXEL_RPC.
 */
export const Route = createFileRoute("/wallet")({
  head: () => ({
    meta: [
      { title: "PIXEL — wallet" },
      {
        name: "description",
        content:
          "Your Pixel hold — address and tip balance. No CLI. Vault stays sealed; pay face is public.",
      },
    ],
  }),
  validateSearch: (s: Record<string, unknown>) => ({
    rpc: typeof s.rpc === "string" ? s.rpc : undefined,
  }),
  component: WalletPage,
});

function WalletPage() {
  const { rpc: rpcQuery } = Route.useSearch();
  const w = usePeopleWallet(rpcQuery);
  const [name, setName] = useState("you");
  const [toAddr, setToAddr] = useState("");
  const [amount, setAmount] = useState("1");
  const [note, setNote] = useState("");

  return (
    <main className="min-h-screen bg-[oklch(0.09_0.02_145)] text-foreground">
      <div className="mx-auto max-w-lg px-6 py-12">
        <div className="flex flex-wrap gap-4">
          <Link
            to="/doors"
            className="font-pixel text-xs tracking-[0.28em] text-primary uppercase underline-offset-4 hover:underline"
          >
            ← Doors
          </Link>
          <Link
            to="/"
            search={rpcQuery ? { rpc: rpcQuery } : {}}
            className="font-pixel text-xs tracking-[0.28em] text-muted-foreground uppercase underline-offset-4 hover:underline"
          >
            Live field
          </Link>
        </div>

        <p className="font-pixel mt-10 text-xs tracking-[0.32em] text-primary uppercase">PIXEL</p>
        <h1 className="font-pixel mt-3 text-4xl font-bold tracking-tight md:text-5xl">Wallet</h1>
        <p className="mt-4 text-muted-foreground">{peopleWalletThesis()}</p>

        {!w.ready ? (
          <p className="mt-12 text-sm text-muted-foreground">Loading…</p>
        ) : !w.payFace ? (
          <section className="mt-12 space-y-6">
            <p className="text-sm text-muted-foreground">
              Forge a Personal Source on this device. You will see only your{" "}
              <span className="text-foreground">pay face</span> (address). The vault stays sealed —
              never shown here.
            </p>
            <label className="block">
              <span className="font-pixel text-[11px] tracking-[0.18em] text-muted-foreground uppercase">
                Label
              </span>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="mt-2 w-full rounded-md border border-primary/20 bg-black/40 px-3 py-2 text-foreground"
                autoComplete="nickname"
              />
            </label>
            <button
              type="button"
              disabled={w.busy}
              onClick={() => void w.forge(name)}
              className="font-pixel w-full rounded-md bg-primary px-4 py-3 text-sm tracking-[0.18em] text-primary-foreground uppercase disabled:opacity-50"
            >
              {w.busy ? "Forging…" : "Forge wallet"}
            </button>
          </section>
        ) : (
          <section className="mt-12 space-y-8">
            <div>
              <p className="font-pixel text-[11px] tracking-[0.18em] text-primary uppercase">
                Pay face
              </p>
              <p className="mt-2 text-lg font-medium">{w.payFace.localId}</p>
              <p className="mt-2 break-all font-mono text-sm text-foreground/90">
                {w.payFace.address}
              </p>
            </div>

            <div>
              <p className="font-pixel text-[11px] tracking-[0.18em] text-primary uppercase">
                Balance on tip
              </p>
              {w.rpc ? (
                <p className="mt-2 text-3xl font-bold">
                  {w.balance === null ? "…" : `${w.balance} PIX`}
                  {typeof w.tipIndex === "number" ? (
                    <span className="ml-2 text-sm font-normal text-muted-foreground">
                      · tip #{w.tipIndex}
                    </span>
                  ) : null}
                </p>
              ) : (
                <p className="mt-2 text-sm text-muted-foreground">
                  No tip feed. Open with{" "}
                  <code className="text-foreground/90">?rpc=http://127.0.0.1:8545</code> or set{" "}
                  <code className="text-foreground/90">VITE_PIXEL_RPC</code> so balance reads the
                  shared picture — not a private notebook.
                </p>
              )}
            </div>

            <div className="flex flex-wrap gap-3">
              <button
                type="button"
                disabled={w.busy}
                onClick={() => void w.unlock()}
                className="font-pixel rounded-md border border-primary/30 px-4 py-2 text-xs tracking-[0.16em] text-primary uppercase"
              >
                {w.unlocked ? "Unlocked" : "Unlock (sealed)"}
              </button>
              <button
                type="button"
                disabled={w.busy || !w.rpc}
                onClick={() => void w.refresh()}
                className="font-pixel rounded-md border border-primary/30 px-4 py-2 text-xs tracking-[0.16em] text-muted-foreground uppercase"
              >
                Refresh
              </button>
              <button
                type="button"
                disabled={w.busy}
                onClick={() => w.clear()}
                className="font-pixel rounded-md border border-red-400/30 px-4 py-2 text-xs tracking-[0.16em] text-red-300/90 uppercase"
              >
                Clear device hold
              </button>
            </div>

            {w.rpc ? (
              <form
                className="space-y-4 border-t border-primary/15 pt-8"
                onSubmit={(e) => {
                  e.preventDefault();
                  void w
                    .pay(toAddr, Math.floor(Number(amount) || 0), note || undefined)
                    .catch(() => {
                      /* error surfaced on w.error */
                    });
                }}
              >
                <p className="font-pixel text-[11px] tracking-[0.18em] text-primary uppercase">
                  Pay on tip
                </p>
                <p className="text-xs text-muted-foreground">
                  Signs from your unlocked Source and posts to the tip feed. Vault is never shown.
                  Needs PIX on this tip (operator may fund your pay face).
                </p>
                <label className="block">
                  <span className="text-xs text-muted-foreground">To address</span>
                  <input
                    value={toAddr}
                    onChange={(e) => setToAddr(e.target.value)}
                    placeholder="pix…"
                    className="mt-1 w-full rounded-md border border-primary/20 bg-black/40 px-3 py-2 font-mono text-sm"
                    required
                  />
                </label>
                <label className="block">
                  <span className="text-xs text-muted-foreground">Amount (PIX)</span>
                  <input
                    type="number"
                    min={1}
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    className="mt-1 w-full rounded-md border border-primary/20 bg-black/40 px-3 py-2"
                    required
                  />
                </label>
                <label className="block">
                  <span className="text-xs text-muted-foreground">Note (optional)</span>
                  <input
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    className="mt-1 w-full rounded-md border border-primary/20 bg-black/40 px-3 py-2"
                  />
                </label>
                <button
                  type="submit"
                  disabled={w.busy || !w.unlocked}
                  className="font-pixel w-full rounded-md bg-primary px-4 py-3 text-sm tracking-[0.18em] text-primary-foreground uppercase disabled:opacity-50"
                >
                  {!w.unlocked ? "Unlock to pay" : w.busy ? "Paying…" : "Pay on shared tip"}
                </button>
                {w.lastPay ? (
                  <div className="space-y-1 text-sm" role="status">
                    <p className="text-primary">{settlementHonesty(w.lastPay.attachment)}</p>
                    <p className="font-mono text-xs text-muted-foreground break-all">
                      canvas {formatCanvasId(w.lastPay.canvasId)} · tip #{w.lastPay.tipIndex} ·{" "}
                      {w.lastPay.txid.slice(0, 20)}…
                    </p>
                  </div>
                ) : null}
              </form>
            ) : null}

            <p className="text-xs text-muted-foreground">
              Vault pattern is never drawn on this page (pay face ≠ vault). Point{" "}
              <code className="text-foreground/90">VITE_PIXEL_RPC</code> at the canonical tip so pay
              marks the public picture — see docs/CANONICAL-TIP.md.
            </p>
          </section>
        )}

        {w.error ? (
          <p className="mt-8 text-sm text-red-300" role="alert">
            {w.error}
          </p>
        ) : null}

        <p className="mt-16 text-xs text-muted-foreground">
          See the field:{" "}
          <Link
            to="/"
            search={w.rpc ? { rpc: w.rpc } : {}}
            className="text-primary underline-offset-4 hover:underline"
          >
            /
          </Link>
          {" · "}
          <Link to="/doors" className="text-primary underline-offset-4 hover:underline">
            /doors
          </Link>
        </p>
      </div>
    </main>
  );
}
