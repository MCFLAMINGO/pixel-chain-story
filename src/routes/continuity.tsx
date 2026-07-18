import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useContinuityOps } from "@/hooks/use-continuity-ops";
import {
  assignRungs,
  continuityThesis,
  createStoreOffer,
  goLive,
  markInviteSent,
  probeRung,
  stepIndex,
  stepLabel,
  toggleDeployItem,
  updateRung,
  type ContinuityStore,
} from "@/lib/pixel/continuity-ops";

export const Route = createFileRoute("/continuity")({
  head: () => ({
    meta: [
      { title: "PIXEL — Continuity admin" },
      {
        name: "description",
        content: "Sell store continuity: invite → digest → assign rungs → live ladder.",
      },
    ],
  }),
  component: ContinuityAdmin,
});

const STEPS = [
  "Create offer",
  "Send secure link",
  "Merchant joins",
  "Assign rungs",
  "Go live",
] as const;

function ContinuityAdmin() {
  const { state, setState, ready } = useContinuityOps();
  const [name, setName] = useState("");
  const [domain, setDomain] = useState("");
  const [originUrl, setOriginUrl] = useState("");
  const [price, setPrice] = useState("20");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [msg, setMsg] = useState("");
  const [probing, setProbing] = useState(false);

  const selected = useMemo(
    () => state.stores.find((s) => s.id === selectedId) ?? state.stores[0] ?? null,
    [state.stores, selectedId],
  );

  if (!ready) {
    return (
      <main className="flex min-h-screen items-center justify-center text-muted-foreground">
        Loading continuity desk…
      </main>
    );
  }

  const inviteUrl =
    typeof window !== "undefined" && selected
      ? `${window.location.origin}/continuity/join/${selected.inviteToken}`
      : "";

  function onCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || !domain.trim()) {
      setMsg("Name and domain required");
      return;
    }
    const next = createStoreOffer(state, {
      name,
      domain,
      originUrl: originUrl || `https://${domain}`,
      priceUsdPerMonth: Number(price) || 20,
    });
    setState(next);
    setSelectedId(next.stores[0].id);
    setName("");
    setDomain("");
    setOriginUrl("");
    setMsg("Offer created — copy the secure link for the merchant.");
  }

  async function onProbeAll() {
    setProbing(true);
    const rungs = [];
    for (const r of state.rungs) {
      rungs.push(await probeRung(r));
    }
    setState({ ...state, rungs });
    setProbing(false);
    setMsg("Rung probes finished (browser CORS may show unknown — that’s ok in lab).");
  }

  return (
    <main className="continuity-desk min-h-screen text-foreground">
      <div className="continuity-glow" aria-hidden />
      <div className="relative mx-auto max-w-5xl px-6 pt-10 pb-24">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <Link
              to="/lab"
              className="font-pixel text-xs tracking-[0.28em] text-primary uppercase underline-offset-4 hover:underline"
            >
              ← Lab
            </Link>
            <h1 className="font-pixel mt-4 text-4xl font-bold tracking-tight md:text-5xl">
              Continuity
            </h1>
            <p className="mt-3 max-w-xl text-sm leading-relaxed text-muted-foreground">
              {continuityThesis()} Admin desk: sell the ladder, send a secure link, load each store.
              You worry about health + sales; the merchant follows steps.
            </p>
          </div>
          <p className="font-pixel text-xs tracking-[0.2em] text-muted-foreground uppercase">
            {state.operatorName}
          </p>
        </div>

        {/* Step strip */}
        <ol className="mt-10 flex flex-wrap gap-2">
          {STEPS.map((label, i) => (
            <li
              key={label}
              className={`font-pixel px-3 py-1.5 text-[11px] tracking-wide uppercase ${
                selected && stepIndex(selected.step) >= i
                  ? "bg-primary/20 text-primary"
                  : "bg-foreground/5 text-muted-foreground"
              }`}
            >
              {i + 1}. {label}
            </li>
          ))}
        </ol>

        <div className="mt-12 grid gap-16 lg:grid-cols-[1fr_1.1fr]">
          {/* Create offer */}
          <section>
            <h2 className="font-pixel text-xs tracking-[0.28em] text-primary uppercase">
              Step 1 · New store offer
            </h2>
            <form onSubmit={onCreate} className="mt-4 space-y-4">
              <Field label="Business name">
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Ponte Vedra Grill"
                  className="continuity-input"
                />
              </Field>
              <Field label="Domain">
                <input
                  value={domain}
                  onChange={(e) => setDomain(e.target.value)}
                  placeholder="shop.example.com"
                  className="continuity-input"
                />
              </Field>
              <Field label="Origin URL (their current booth)">
                <input
                  value={originUrl}
                  onChange={(e) => setOriginUrl(e.target.value)}
                  placeholder="https://shop.example.com"
                  className="continuity-input"
                />
              </Field>
              <Field label="Price USD / month">
                <input
                  value={price}
                  onChange={(e) => setPrice(e.target.value)}
                  className="continuity-input max-w-[8rem]"
                />
              </Field>
              <button type="submit" className="continuity-btn">
                Create offer
              </button>
            </form>

            <h2 className="font-pixel mt-14 text-xs tracking-[0.28em] text-primary uppercase">
              Your 5 rungs
            </h2>
            <p className="mt-2 text-sm text-muted-foreground">
              Edit base URLs to your real VPS hosts. Probe from this browser when live.
            </p>
            <ul className="mt-4 space-y-3">
              {state.rungs.map((r) => (
                <li key={r.id} className="border-t border-foreground/10 pt-3">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="font-pixel text-sm">{r.label}</span>
                    <span className="text-xs text-muted-foreground">
                      {r.provider} · {r.health}
                    </span>
                  </div>
                  <input
                    className="continuity-input mt-2"
                    value={r.baseUrl}
                    onChange={(e) => setState(updateRung(state, r.id, { baseUrl: e.target.value }))}
                  />
                </li>
              ))}
            </ul>
            <button
              type="button"
              className="continuity-btn mt-4"
              disabled={probing}
              onClick={() => void onProbeAll()}
            >
              {probing ? "Probing…" : "Probe all rungs"}
            </button>
          </section>

          {/* Selected store pipeline */}
          <section>
            <h2 className="font-pixel text-xs tracking-[0.28em] text-primary uppercase">
              Pipeline
            </h2>
            {state.stores.length === 0 ? (
              <p className="mt-4 text-sm text-muted-foreground">No stores yet — create an offer.</p>
            ) : (
              <>
                <ul className="mt-4 flex flex-wrap gap-2">
                  {state.stores.map((s) => (
                    <li key={s.id}>
                      <button
                        type="button"
                        onClick={() => setSelectedId(s.id)}
                        className={`font-pixel px-3 py-1.5 text-xs tracking-wide ${
                          selected?.id === s.id
                            ? "bg-primary text-primary-foreground"
                            : "bg-foreground/10 hover:bg-foreground/15"
                        }`}
                      >
                        {s.name}
                      </button>
                    </li>
                  ))}
                </ul>
                {selected && (
                  <StorePanel
                    store={selected}
                    inviteUrl={inviteUrl}
                    rungIds={state.rungs.map((r) => r.id)}
                    rungLabels={Object.fromEntries(state.rungs.map((r) => [r.id, r.label]))}
                    onInviteSent={() => {
                      setState(markInviteSent(state, selected.id));
                      setMsg("Marked invite sent.");
                    }}
                    onAssign={(ids) => {
                      try {
                        setState(assignRungs(state, selected.id, ids));
                        setMsg("Rungs assigned.");
                      } catch (err) {
                        setMsg(err instanceof Error ? err.message : "Assign failed");
                      }
                    }}
                    onLive={() => {
                      void (async () => {
                        try {
                          setState(await goLive(state, selected.id));
                          setMsg("Store live — SISO in the light. Run the deploy checklist.");
                        } catch (err) {
                          setMsg(err instanceof Error ? err.message : "Go live failed");
                        }
                      })();
                    }}
                    onToggleDeploy={(itemId) => {
                      try {
                        setState(toggleDeployItem(state, selected.id, itemId));
                      } catch (err) {
                        setMsg(err instanceof Error ? err.message : "Toggle failed");
                      }
                    }}
                  />
                )}
              </>
            )}
          </section>
        </div>

        {msg && (
          <p className="font-pixel mt-10 text-sm tracking-wide text-primary" role="status">
            {msg}
          </p>
        )}

        <p className="mt-16 max-w-2xl text-xs leading-relaxed text-muted-foreground">
          Honesty: this desk books offers, digests, and rung assignment. Pushing files to VPS
          (rsync) and DNS failover still happen on your hosts — or later via an agentic link that
          runs those jobs for you. Pixel proves the room; rungs are the booths.
        </p>
      </div>
    </main>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="font-pixel text-[11px] tracking-[0.18em] text-muted-foreground uppercase">
        {label}
      </span>
      <div className="mt-1.5">{children}</div>
    </label>
  );
}

function StorePanel({
  store,
  inviteUrl,
  rungIds,
  rungLabels,
  onInviteSent,
  onAssign,
  onLive,
  onToggleDeploy,
}: {
  store: ContinuityStore;
  inviteUrl: string;
  rungIds: string[];
  rungLabels: Record<string, string>;
  onInviteSent: () => void;
  onAssign: (ids: string[]) => void;
  onLive: () => void;
  onToggleDeploy: (itemId: string) => void;
}) {
  const [picked, setPicked] = useState<string[]>(
    store.rungIds.length ? store.rungIds : rungIds.slice(0, 2),
  );

  return (
    <div className="mt-6 space-y-8">
      <div>
        <p className="font-pixel text-2xl font-bold">{store.name}</p>
        <p className="text-sm text-muted-foreground">
          {store.domain} · ${store.priceUsdPerMonth}/mo · {stepLabel(store.step)}
        </p>
        <p className="mt-1 truncate text-xs text-muted-foreground">{store.originUrl}</p>
        {store.digest && (
          <p className="mt-2 font-mono text-[11px] break-all text-muted-foreground">
            digest {store.digest.slice(0, 48)}…
          </p>
        )}
      </div>

      <div>
        <h3 className="font-pixel text-xs tracking-[0.28em] text-primary uppercase">
          Step 2 · Secure merchant link
        </h3>
        <p className="mt-2 break-all rounded-none bg-foreground/5 px-3 py-2 font-mono text-xs">
          {inviteUrl}
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            className="continuity-btn"
            onClick={() => {
              void navigator.clipboard.writeText(inviteUrl);
              onInviteSent();
            }}
          >
            Copy link + mark sent
          </button>
          <Link
            to="/continuity/join/$token"
            params={{ token: store.inviteToken }}
            className="continuity-btn-ghost"
          >
            Open join page
          </Link>
        </div>
      </div>

      <div>
        <h3 className="font-pixel text-xs tracking-[0.28em] text-primary uppercase">
          Step 4 · Assign rungs
        </h3>
        <ul className="mt-3 space-y-2">
          {rungIds.map((id) => (
            <li key={id}>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={picked.includes(id)}
                  onChange={(e) => {
                    setPicked((prev) =>
                      e.target.checked ? [...prev, id] : prev.filter((x) => x !== id),
                    );
                  }}
                />
                {rungLabels[id] ?? id}
              </label>
            </li>
          ))}
        </ul>
        <button type="button" className="continuity-btn mt-3" onClick={() => onAssign(picked)}>
          Save rung assignment
        </button>
      </div>

      <div>
        <h3 className="font-pixel text-xs tracking-[0.28em] text-primary uppercase">
          Step 5 · Go live
        </h3>
        <p className="mt-2 text-sm text-muted-foreground">
          Shines digest into SISO and opens the deploy checklist (rsync / DNS). Agentic runners come
          next — for now you (or sales ops) tick the boxes.
        </p>
        <button
          type="button"
          className="continuity-btn mt-3"
          disabled={store.step === "live"}
          onClick={onLive}
        >
          {store.step === "live" ? "Already live" : "Mark live on ladder"}
        </button>
      </div>

      {store.continuity && (
        <div>
          <h3 className="font-pixel text-xs tracking-[0.28em] text-primary uppercase">SISO map</h3>
          <p className="mt-2 text-sm text-muted-foreground">
            state <span className="text-foreground">{store.continuity.state}</span>
            {store.continuity.commitment && (
              <> · commitment {store.continuity.commitment.slice(0, 20)}…</>
            )}
          </p>
          <ul className="mt-2 text-xs text-muted-foreground">
            {(store.continuity.artifact.mirrors ?? []).map((m) => (
              <li key={m} className="truncate">
                mirror {m}
              </li>
            ))}
          </ul>
        </div>
      )}

      {store.deployPlan && store.deployPlan.length > 0 && (
        <div>
          <h3 className="font-pixel text-xs tracking-[0.28em] text-primary uppercase">
            Deploy checklist (agentic later)
          </h3>
          <ul className="mt-3 space-y-3">
            {store.deployPlan.map((item) => (
              <li key={item.id} className="border-t border-foreground/10 pt-2">
                <label className="flex items-start gap-2 text-sm">
                  <input
                    type="checkbox"
                    className="mt-1"
                    checked={item.done}
                    onChange={() => onToggleDeploy(item.id)}
                  />
                  <span>
                    <span className="font-medium">{item.title}</span>
                    <span className="mt-0.5 block text-xs text-muted-foreground">
                      {item.detail}
                    </span>
                    {item.commandHint && (
                      <code className="mt-1 block break-all font-mono text-[11px] text-muted-foreground">
                        {item.commandHint}
                      </code>
                    )}
                  </span>
                </label>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
