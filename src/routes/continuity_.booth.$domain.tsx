import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useContinuityOps } from "@/hooks/use-continuity-ops";
import { useContinuityChain } from "@/hooks/use-continuity-chain";
import {
  MCFLAMINGO_MENU_URL,
  MCFLAMINGO_ORDER_URL,
  MCFLAMINGO_ORIGIN_URL,
  tillAccruedPix,
  tillIsActive,
} from "@/lib/pixel/continuity-ops";
import {
  boothHonesty,
  ensureContinuitySession,
  findStoreByDomain,
  settleBoothCheckoutOnPixel,
} from "@/lib/pixel/continuity-settlement";

/**
 * Flat route so booth UI is not wrapped by Continuity admin desk.
 * Path: /continuity/booth/$domain
 */
export const Route = createFileRoute("/continuity_/booth/$domain")({
  head: () => ({
    meta: [
      { title: "Continuity booth — Pay with Pixel" },
      {
        name: "description",
        content: "Settle checkout in PIX while Continuity holds the map. Not DNS takeover.",
      },
    ],
  }),
  component: ContinuityBooth,
});

function ContinuityBooth() {
  const { domain: domainParam } = Route.useParams();
  const domain = decodeURIComponent(domainParam);
  const { state, setState, ready: opsReady } = useContinuityOps();
  const { session, setSession, ready: chainReady } = useContinuityChain();
  const [amount, setAmount] = useState("100");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [receipt, setReceipt] = useState<{
    settlementTxid: string;
    tillTxid?: string;
    tipIndex: number;
    feePix: number;
    merchantBalance: number;
    tillBalance: number;
    originDark: boolean;
  } | null>(null);

  const store = useMemo(() => findStoreByDomain(state, domain), [state, domain]);
  const ready = opsReady && chainReady;

  async function onPay(e: React.FormEvent) {
    e.preventDefault();
    if (!store) return;
    setErr("");
    setBusy(true);
    setReceipt(null);
    try {
      const amountPix = Math.floor(Number(amount) || 0);
      if (amountPix <= 0) throw new Error("Enter a positive PIX amount");

      const ensured = await ensureContinuitySession({
        ops: state,
        storeId: store.id,
        existing: session?.storeId === store.id ? session : null,
      });
      let nextOps = ensured.ops;
      let nextSession = ensured.session;

      const settled = await settleBoothCheckoutOnPixel({
        ops: nextOps,
        session: nextSession,
        amountPix,
      });
      nextOps = settled.ops;
      nextSession = settled.session;

      setState(nextOps);
      await setSession(nextSession);
      setReceipt({
        settlementTxid: settled.settlementTxid,
        tillTxid: settled.tillTxid,
        tipIndex: settled.tipIndex,
        feePix: settled.feePix,
        merchantBalance: settled.merchantBalance,
        tillBalance: settled.tillBalance,
        originDark: settled.originDark,
      });
    } catch (ex) {
      setErr(ex instanceof Error ? ex.message : "Payment failed");
    } finally {
      setBusy(false);
    }
  }

  if (!ready) {
    return (
      <main className="continuity-desk flex min-h-screen items-center justify-center text-muted-foreground">
        Opening booth…
      </main>
    );
  }

  if (!store) {
    return (
      <main className="continuity-desk flex min-h-screen flex-col items-center justify-center px-6">
        <div className="continuity-glow" aria-hidden />
        <h1 className="font-pixel relative text-3xl font-bold">No Continuity store</h1>
        <p className="relative mt-3 max-w-md text-center text-sm text-muted-foreground">
          Shine in {domain} first (same browser). Lab ops live in localStorage.
        </p>
        <Link to="/shine" className="continuity-btn relative mt-8">
          Shine in
        </Link>
      </main>
    );
  }

  const canPay = store.step === "live" && store.anchoredOnPixel;

  return (
    <main className="continuity-desk min-h-screen text-foreground">
      <div className="continuity-glow" aria-hidden />
      <div className="relative mx-auto max-w-lg px-6 pt-16 pb-24">
        <p className="font-pixel text-xs tracking-[0.28em] text-primary uppercase">
          Continuity · booth
        </p>
        <h1 className="font-pixel mt-3 text-4xl font-bold tracking-tight">{store.name}</h1>
        <p className="mt-2 text-sm text-muted-foreground">{store.domain}</p>
        <p className="mt-4 text-sm leading-relaxed text-muted-foreground">{boothHonesty()}</p>
        <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
          Settlement and the Continuity map live on Pixel. Live menu can still open on Popmenu —
          Continuity ops, not DNS takeover.
        </p>

        <div className="mt-6 flex flex-wrap gap-2">
          <a
            className="continuity-btn-ghost inline-flex text-sm"
            href={MCFLAMINGO_MENU_URL}
            target="_blank"
            rel="noreferrer"
          >
            Live menu (Popmenu)
          </a>
          <a
            className="continuity-btn-ghost inline-flex text-sm"
            href={MCFLAMINGO_ORDER_URL}
            target="_blank"
            rel="noreferrer"
          >
            Order on Popmenu
          </a>
          <a
            className="continuity-btn-ghost inline-flex text-sm"
            href={store.originUrl || MCFLAMINGO_ORIGIN_URL}
            target="_blank"
            rel="noreferrer"
          >
            Origin site
          </a>
        </div>

        <p className="mt-6 text-xs text-muted-foreground">
          Continuity {store.continuity?.state ?? store.step}
          {store.anchoredOnPixel ? ` · map tip #${store.pixelIndex}` : " · not anchored"}
          {tillIsActive(store)
            ? ` · till ACTIVE · accrued ${tillAccruedPix(store)} PIX`
            : " · till idle"}
        </p>

        {!canPay ? (
          <p className="mt-8 text-sm text-destructive">
            Store must be live and anchored on Pixel before Pay with Pixel. Use /shine or the desk.
          </p>
        ) : (
          <form onSubmit={(e) => void onPay(e)} className="mt-10 space-y-4">
            <label className="block">
              <span className="font-pixel text-[11px] tracking-[0.18em] text-muted-foreground uppercase">
                Amount (PIX)
              </span>
              <input
                className="continuity-input mt-1.5"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                inputMode="numeric"
                required
              />
            </label>
            {err && <p className="text-sm text-destructive">{err}</p>}
            <button type="submit" className="continuity-btn w-full text-base" disabled={busy}>
              {busy ? "Settling…" : "Pay with Pixel"}
            </button>
            <p className="text-center text-xs text-muted-foreground">
              Settles real PIX UTXOs in this browser’s Continuity chain. If origin is dark, till fee
              UTXOs move to the till address.
            </p>
          </form>
        )}

        {receipt && (
          <div className="mt-10 space-y-2" role="status">
            <p className="font-pixel text-xl text-primary">Settled on Pixel</p>
            <p className="font-mono text-xs break-all text-muted-foreground">
              tip #{receipt.tipIndex} · sale {receipt.settlementTxid.slice(0, 20)}…
            </p>
            {receipt.tillTxid ? (
              <p className="text-sm text-muted-foreground">
                Till fee {receipt.feePix} PIX on-chain · {receipt.tillTxid.slice(0, 20)}…
                {receipt.originDark ? " (origin dark)" : ""}
              </p>
            ) : (
              <p className="text-sm text-muted-foreground">
                No till fee (till idle — mark origin dark on the desk to activate).
              </p>
            )}
            <p className="text-xs text-muted-foreground">
              Merchant bal {receipt.merchantBalance} · Till bal {receipt.tillBalance}
            </p>
          </div>
        )}

        <Link to="/continuity" className="continuity-btn-ghost mt-12 inline-flex">
          Continuity desk
        </Link>
      </div>
    </main>
  );
}
