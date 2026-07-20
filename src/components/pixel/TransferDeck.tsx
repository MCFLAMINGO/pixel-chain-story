import type { Transaction } from "@/lib/pixel";

export function TransferDeck({
  aliceBal,
  bobBal,
  aliceAddress,
  bobAddress,
  amount,
  memo,
  busy,
  pending,
  revealing,
  phase,
  error,
  lastTx,
  history,
  onAmount,
  onMemo,
  onPropose,
  onReveal,
}: {
  aliceBal: number;
  bobBal: number;
  aliceAddress?: string;
  bobAddress?: string;
  amount: string;
  memo: string;
  busy: boolean;
  pending: number;
  revealing: boolean;
  phase: string;
  error: string | null;
  lastTx: Transaction | null;
  history: Transaction[];
  onAmount: (v: string) => void;
  onMemo: (v: string) => void;
  onPropose: () => void;
  onReveal: () => void;
}) {
  return (
    <section id="transfer" className="pixel-rise">
      <p className="font-pixel text-xs font-semibold tracking-[0.28em] text-primary uppercase">
        Real settlement
      </p>
      <h2 className="font-pixel mt-3 text-3xl font-bold tracking-tight md:text-4xl">
        Send value. Light makes it real.
      </h2>
      <p className="mt-3 max-w-xl text-muted-foreground">
        Propose leaves the transfer in superposition. Shine light runs Proof of Light Sequence — one
        signature, no mining farm — and balances update for real.
      </p>

      <div className="mt-10 grid gap-8 md:grid-cols-[1fr_1.1fr]">
        <div className="space-y-5">
          <BalanceRow name="Alice" balance={aliceBal} address={aliceAddress} />
          <BalanceRow name="Bob" balance={bobBal} address={bobAddress} />
        </div>

        <div className="space-y-4">
          <label className="block text-sm text-muted-foreground">
            Amount
            <input
              type="number"
              min={1}
              value={amount}
              onChange={(e) => onAmount(e.target.value)}
              className="mt-1.5 w-full border-0 border-b border-border bg-transparent px-0 py-2 text-2xl text-foreground outline-none ring-0 focus:border-primary"
            />
          </label>
          <label className="block text-sm text-muted-foreground">
            Readable memo (signed into the transaction)
            <input
              type="text"
              value={memo}
              onChange={(e) => onMemo(e.target.value)}
              className="mt-1.5 w-full border-0 border-b border-border bg-transparent px-0 py-2 text-base text-foreground outline-none focus:border-primary"
            />
          </label>

          <div className="flex flex-wrap gap-3 pt-2">
            <button
              type="button"
              disabled={busy}
              onClick={onPropose}
              className="font-pixel rounded-md bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground transition hover:opacity-90 disabled:opacity-45"
            >
              Propose
            </button>
            <button
              type="button"
              disabled={busy || pending === 0}
              onClick={onReveal}
              className="font-pixel rounded-md border border-primary/40 bg-accent px-5 py-2.5 text-sm font-semibold text-accent-foreground transition hover:bg-accent/80 disabled:opacity-45"
            >
              Shine light
            </button>
          </div>

          <p
            className={`text-sm leading-relaxed text-muted-foreground ${revealing ? "pixel-reveal text-foreground" : ""}`}
          >
            {error ?? phase}
          </p>
          {lastTx && (
            <p className="font-mono text-[11px] text-muted-foreground">
              {lastTx.state} · {lastTx.txid.slice(0, 28)}…
            </p>
          )}
        </div>
      </div>

      {history.length > 0 && (
        <div className="mt-14">
          <h3 className="font-pixel text-sm font-semibold tracking-[0.2em] uppercase">
            Revealed trail
          </h3>
          <ul className="mt-4 space-y-3">
            {[...history].reverse().map((tx) => (
              <li key={tx.txid + tx.state} className="border-b border-border/70 pb-3 text-sm">
                <span className="font-pixel font-semibold text-foreground">
                  {tx.metadata.description}
                </span>
                <span className="mt-1 block text-muted-foreground">
                  {tx.state === "final" || tx.state === "revealed"
                    ? "Light revealed"
                    : "In superposition"}{" "}
                  · {tx.outputs[0]?.amount.toLocaleString()} PIX
                  {tx.metadata.recipientLabel ? ` → ${tx.metadata.recipientLabel}` : ""}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

function BalanceRow({
  name,
  balance,
  address,
}: {
  name: string;
  balance: number;
  address?: string;
}) {
  return (
    <div>
      <div className="flex items-baseline justify-between gap-4">
        <span className="font-pixel text-sm font-semibold tracking-wide">{name}</span>
        <span className="font-pixel text-3xl font-bold tracking-tight">
          {balance.toLocaleString()}
          <span className="ml-1 text-sm font-semibold text-muted-foreground">PIX</span>
        </span>
      </div>
      <p className="mt-1 truncate font-mono text-[11px] text-muted-foreground">
        {address ?? "forging address…"}
      </p>
    </div>
  );
}
