import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useContinuityOps } from "@/hooks/use-continuity-ops";
import { merchantJoin, merchantOfferCopy, storeByInvite } from "@/lib/pixel";

export const Route = createFileRoute("/continuity/join/$token")({
  head: () => ({
    meta: [
      { title: "Turn on Continuity — PIXEL" },
      {
        name: "description",
        content: "One tap to keep your shop reachable when the host blinks.",
      },
    ],
  }),
  component: MerchantJoin,
});

function MerchantJoin() {
  const { token } = Route.useParams();
  const { state, setState, ready } = useContinuityOps();
  const store = useMemo(() => storeByInvite(state, token), [state, token]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [done, setDone] = useState(false);

  if (!ready) {
    return (
      <main className="flex min-h-screen items-center justify-center text-muted-foreground">
        Opening invite…
      </main>
    );
  }

  if (!store) {
    return (
      <main className="continuity-desk flex min-h-screen flex-col items-center justify-center px-6">
        <div className="continuity-glow" aria-hidden />
        <h1 className="font-pixel relative text-3xl font-bold">Link not found</h1>
        <p className="relative mt-3 max-w-md text-center text-sm text-muted-foreground">
          Ask your Continuity partner for a fresh invite link.
        </p>
      </main>
    );
  }

  function onTurnOn(e: React.FormEvent) {
    e.preventDefault();
    setErr("");
    setBusy(true);
    try {
      setState(merchantJoin(state, token, { originUrl: store!.originUrl }));
      setDone(true);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not join");
    } finally {
      setBusy(false);
    }
  }

  const joined =
    done ||
    store.step === "merchant_joined" ||
    store.step === "rungs_assigned" ||
    store.step === "live";

  return (
    <main className="continuity-desk min-h-screen text-foreground">
      <div className="continuity-glow" aria-hidden />
      <div className="relative mx-auto max-w-lg px-6 pt-16 pb-24">
        <p className="font-pixel text-xs tracking-[0.28em] text-primary uppercase">Continuity</p>
        <h1 className="font-pixel mt-3 text-4xl font-bold tracking-tight">{store.name}</h1>
        <p className="mt-4 text-base leading-relaxed text-muted-foreground">
          {merchantOfferCopy(store)}
        </p>
        <p className="mt-2 text-sm text-muted-foreground">{store.domain}</p>

        {joined ? (
          <div className="mt-12">
            <p className="font-pixel text-xl text-primary">You’re covered.</p>
            <p className="mt-3 text-sm text-muted-foreground">
              Continuity is on for {store.name}. Keep selling — if your host goes dark, customers
              still reach you and the till only kicks in on those surviving checkouts.
            </p>
          </div>
        ) : (
          <form onSubmit={onTurnOn} className="mt-12 space-y-6">
            {err && <p className="text-sm text-destructive">{err}</p>}
            <button type="submit" className="continuity-btn w-full text-base" disabled={busy}>
              Turn on Continuity
            </button>
            <p className="text-center text-xs text-muted-foreground">
              No DNS homework. No hosting jargon. One button.
            </p>
          </form>
        )}
      </div>
    </main>
  );
}
