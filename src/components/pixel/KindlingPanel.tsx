import { useEffect, useState } from "react";
import {
  SELF_CUSTODY_AXIOM,
  confluentSeal,
  createGenesis,
  energyTruthForIlluminate,
  forgePersonalSource,
  formatEnergyTruth,
  kindleAccept,
  kindleOffer,
  patternToCssGrid,
  settleKindling,
  unlockPersonalSource,
  type KindleHalf,
  type PersonalSource,
  type PresenceSeal,
  type UnlockedSource,
} from "@/lib/pixel";

/** People spend UI — self-custody Kindling. Not a wallet app. Not SMS money. */
export function KindlingPanel() {
  const [dale, setDale] = useState<{ source: PersonalSource; unlocked: UnlockedSource } | null>(
    null,
  );
  const [joe, setJoe] = useState<PersonalSource | null>(null);
  const [fromLocal, setFromLocal] = useState("dale");
  const [toLocal, setToLocal] = useState("joe");
  const [amount, setAmount] = useState("5");
  const [offer, setOffer] = useState<KindleHalf | null>(null);
  const [accept, setAccept] = useState<KindleHalf | null>(null);
  const [seal, setSeal] = useState<PresenceSeal | null>(null);
  const [log, setLog] = useState("");
  const [busy, setBusy] = useState(false);
  const energy = energyTruthForIlluminate(1);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const d = await forgePersonalSource("dale");
      const j = await forgePersonalSource("joe");
      if (cancelled) return;
      setDale(d);
      setJoe(j.source);
      setLog(`${SELF_CUSTODY_AXIOM}\nDale & Joe forged Personal Sources (optical vaults).`);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const intent = {
    fromLocal,
    toLocal,
    amount: Math.floor(Number(amount) || 0),
    note: "kindled in light",
  };

  const shineOffer = async () => {
    setBusy(true);
    try {
      const h = await kindleOffer(intent);
      setOffer(h);
      setAccept(null);
      setSeal(null);
      setLog("Offer light kindled — receiver answers with the same intent.");
    } catch (e) {
      setLog(e instanceof Error ? e.message : "offer failed");
    } finally {
      setBusy(false);
    }
  };

  const shineAccept = async () => {
    setBusy(true);
    try {
      const h = await kindleAccept(intent);
      setAccept(h);
      setLog("Accept light kindled — bring both screens together.");
    } catch (e) {
      setLog(e instanceof Error ? e.message : "accept failed");
    } finally {
      setBusy(false);
    }
  };

  const meet = async () => {
    if (!offer || !accept) return;
    setBusy(true);
    try {
      const r = await confluentSeal(offer, accept);
      if (!r.ok) {
        setLog(`Confluence failed: ${r.reason}`);
        setSeal(null);
        return;
      }
      setSeal(r.seal);
      setLog(`Presence Seal: ${r.seal.boundLabel}`);
    } finally {
      setBusy(false);
    }
  };

  const settle = async () => {
    if (!seal || !dale || !joe) return;
    setBusy(true);
    try {
      // Unlock Dale's Source from *his* vault light — pillar never holds the seed.
      const unlocked = await unlockPersonalSource(dale.source);
      const genesis = await createGenesis(unlocked.keypair);
      // Fund dale via genesis sequencer reward path: use dale as genesis sequencer
      // then kindle a small send to joe from dale's own UTXOs (genesis coinbase to dale).
      const res = await settleKindling({
        state: genesis,
        from: unlocked.keypair,
        ownerAddress: dale.source.address,
        sequencer: unlocked.keypair,
        toAddress: joe.address,
        seal,
        gatewayHeldSeed: false,
      });
      setLog(res.summary);
      setSeal(null);
      setOffer(null);
      setAccept(null);
    } catch (e) {
      setLog(e instanceof Error ? e.message : "settle failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section id="kindling" className="pixel-rise">
      <p className="font-pixel text-xs font-semibold tracking-[0.28em] text-primary uppercase">
        Kindling · self-custody
      </p>
      <h2 className="font-pixel mt-3 text-3xl font-bold tracking-tight md:text-4xl">
        Your light. Your Source.
      </h2>
      <p className="mt-3 max-w-2xl text-muted-foreground">
        {SELF_CUSTODY_AXIOM} Optical vaults — not seed theater, not telco custody. Two lights meet;
        only your unlocked Source can sign. Hyperscale racks not required.
      </p>

      <div className="mt-8 grid max-w-xl gap-4">
        <label className="block text-sm text-muted-foreground">
          From (name)
          <input
            value={fromLocal}
            onChange={(e) => setFromLocal(e.target.value)}
            className="mt-1 w-full border-0 border-b border-border bg-transparent py-2 outline-none focus:border-primary"
          />
        </label>
        <label className="block text-sm text-muted-foreground">
          To (name)
          <input
            value={toLocal}
            onChange={(e) => setToLocal(e.target.value)}
            className="mt-1 w-full border-0 border-b border-border bg-transparent py-2 outline-none focus:border-primary"
          />
        </label>
        <label className="block text-sm text-muted-foreground">
          Amount
          <input
            type="number"
            min={1}
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className="mt-1 w-full border-0 border-b border-border bg-transparent py-2 text-2xl outline-none focus:border-primary"
          />
        </label>
      </div>

      <div className="mt-8 flex flex-wrap gap-3">
        <button
          type="button"
          disabled={busy}
          onClick={() => void shineOffer()}
          className="font-pixel rounded-md bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground"
        >
          Kindle offer
        </button>
        <button
          type="button"
          disabled={busy || !offer}
          onClick={() => void shineAccept()}
          className="font-pixel rounded-md border border-border px-4 py-2 text-xs font-semibold"
        >
          Kindle accept
        </button>
        <button
          type="button"
          disabled={busy || !offer || !accept}
          onClick={() => void meet()}
          className="font-pixel rounded-md border border-primary/50 px-4 py-2 text-xs font-semibold"
        >
          Meet in light
        </button>
        <button
          type="button"
          disabled={busy || !seal || !dale}
          onClick={() => void settle()}
          className="font-pixel rounded-md bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground"
        >
          Unlock & settle
        </button>
      </div>

      <div className="mt-8 grid gap-6 sm:grid-cols-2">
        <LightGrid title="Offer" half={offer} />
        <LightGrid title="Accept" half={accept} />
      </div>

      {dale && (
        <div className="mt-8">
          <p className="font-pixel text-xs tracking-widest text-muted-foreground uppercase">
            Dale’s Personal Source vault
          </p>
          <div
            className="mt-2 grid aspect-square max-w-[160px] gap-px border border-border"
            style={{ gridTemplateColumns: "repeat(16, 1fr)" }}
          >
            {patternToCssGrid(dale.source.vault).map((c, i) => (
              <div key={i} style={{ background: c }} />
            ))}
          </div>
        </div>
      )}

      {seal && <p className="font-pixel mt-6 text-sm text-primary">Seal: {seal.boundLabel}</p>}
      {log && (
        <pre className="mt-4 max-w-2xl whitespace-pre-wrap border border-border bg-background/70 p-3 text-sm">
          {log}
        </pre>
      )}
      <p className="mt-4 max-w-xl text-xs text-muted-foreground">{formatEnergyTruth(energy)}</p>
    </section>
  );
}

function LightGrid({ title, half }: { title: string; half: KindleHalf | null }) {
  const colors = half ? patternToCssGrid(half.pattern) : [];
  return (
    <div>
      <p className="font-pixel text-xs tracking-widest text-muted-foreground uppercase">{title}</p>
      <div
        className="mt-2 grid aspect-square max-w-[220px] gap-px border border-border"
        style={{ gridTemplateColumns: "repeat(16, 1fr)" }}
      >
        {half
          ? colors.map((c, i) => <div key={i} style={{ background: c }} />)
          : Array.from({ length: 256 }, (_, i) => <div key={i} className="bg-muted/30" />)}
      </div>
    </div>
  );
}
