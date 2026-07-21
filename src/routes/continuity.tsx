import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useContinuityOps } from "@/hooks/use-continuity-ops";
import {
  activeTillBps,
  assignRungs,
  attachStoreDigest,
  continuityThesis,
  createStoreOffer,
  digestArtifactText,
  fetchMcFlamingoHomepageHtml,
  goLive,
  markInviteSent,
  markStoreOriginDark,
  MCFLAMINGO_MENU_URL,
  MCFLAMINGO_ORDER_URL,
  MCFLAMINGO_ORIGIN_URL,
  mcflamingoContinuityHonesty,
  continuityInvitePrerequisites,
  merchantOfferCopy,
  checkOriginAndFailover,
  probeRung,
  recordTillSettlement,
  runChaosDrill,
  seedMcFlamingoDemo,
  stepIndex,
  stepLabel,
  tillAccruedPix,
  tillIsActive,
  toggleDeployItem,
  updateRung,
  type ContinuityStore,
} from "@/lib/pixel/continuity-ops";
import {
  buildInvitePack,
  continuityDisciplineLine,
  continuityPitchPair,
  encodeInvitePack,
} from "@/lib/pixel/continuity-invite-pack";

export const Route = createFileRoute("/continuity")({
  head: () => ({
    meta: [
      { title: "PIXEL — Continuity admin" },
      {
        name: "description",
        content: "Sell store continuity: secure link → merchant turns on → assign booths → live.",
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
  const [demoBusy, setDemoBusy] = useState(false);

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
            <div className="flex flex-wrap gap-4">
              <Link
                to="/shine"
                className="font-pixel text-xs tracking-[0.28em] text-primary uppercase underline-offset-4 hover:underline"
              >
                ← Shine in
              </Link>
              <Link
                to="/lab"
                className="font-pixel text-xs tracking-[0.28em] text-muted-foreground uppercase underline-offset-4 hover:underline"
              >
                Lab
              </Link>
            </div>
            <h1 className="font-pixel mt-4 text-4xl font-bold tracking-tight md:text-5xl">
              Continuity
            </h1>
            <p className="mt-3 max-w-xl text-sm leading-relaxed text-muted-foreground">
              {continuityThesis()} Admin desk: sell the ladder, send a secure link, load each store.
              You worry about health + sales; the merchant follows steps.
            </p>
            <button
              type="button"
              className="continuity-btn mt-4"
              disabled={demoBusy}
              onClick={() => {
                void (async () => {
                  setDemoBusy(true);
                  setMsg("");
                  try {
                    const { html, source, originUrl } = await fetchMcFlamingoHomepageHtml();
                    const next = await seedMcFlamingoDemo(state, html, {
                      originUrl,
                      mirrorUrls: [MCFLAMINGO_ORIGIN_URL, MCFLAMINGO_MENU_URL],
                    });
                    setState(next);
                    setSelectedId(next.stores[0]?.id ?? null);
                    setMsg(
                      source === "live"
                        ? "McFlamingo Continuity map updated from live site. Open the LIVE menu/order links — not localhost."
                        : "McFlamingo Continuity map updated (digest from snapshot; live fetch blocked). Open www.mcflamingo.com/menu for the real menu.",
                    );
                  } catch (err) {
                    setMsg(err instanceof Error ? err.message : "McFlamingo demo failed");
                  } finally {
                    setDemoBusy(false);
                  }
                })();
              }}
            >
              {demoBusy ? "Shining in…" : "Demo: map real McFlamingo (www.mcflamingo.com)"}
            </button>
            <div className="mt-3 flex flex-wrap gap-2">
              <a
                className="continuity-btn"
                href={MCFLAMINGO_MENU_URL}
                target="_blank"
                rel="noreferrer"
              >
                Open live menu
              </a>
              <a
                className="continuity-btn-ghost"
                href={MCFLAMINGO_ORDER_URL}
                target="_blank"
                rel="noreferrer"
              >
                Order on Popmenu
              </a>
              <a
                className="continuity-btn-ghost"
                href={MCFLAMINGO_ORIGIN_URL}
                target="_blank"
                rel="noreferrer"
              >
                Homepage
              </a>
            </div>
            <p className="mt-2 text-xs text-muted-foreground">{mcflamingoContinuityHonesty()}</p>
          </div>
          <p className="font-pixel text-xs tracking-[0.2em] text-muted-foreground uppercase">
            {state.operatorName}
          </p>
        </div>

        <div className="mt-8 max-w-xl rounded-none border border-foreground/10 bg-foreground/[0.03] px-4 py-3 text-xs leading-relaxed text-muted-foreground">
          <p className="font-pixel text-[11px] tracking-[0.18em] text-primary uppercase">
            Before you send invites
          </p>
          <ul className="mt-2 list-disc space-y-1 pl-4">
            {continuityInvitePrerequisites().map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </div>

        <div className="mt-4 max-w-2xl rounded-none border border-foreground/10 bg-foreground/[0.03] px-4 py-3 text-xs leading-relaxed text-muted-foreground">
          <p className="font-pixel text-[11px] tracking-[0.18em] text-primary uppercase">
            What the buttons do (lab)
          </p>
          <ul className="mt-2 list-disc space-y-1 pl-4">
            <li>
              <span className="text-foreground">Demo: map real McFlamingo</span> — writes a
              Continuity digest for www.mcflamingo.com. It does <em>not</em> put the restaurant
              inside localhost.
            </li>
            <li>
              <span className="text-foreground">Open live menu / Order on Popmenu</span> — the real
              McFlamingo site (this is where the food menu is).
            </li>
            <li>
              <span className="text-foreground">Open join page</span> — merchant Continuity toggle
              in this same browser (localStorage lab).
            </li>
            <li>
              <span className="text-foreground">Probe / chaos drill / booth jobs</span> — lab
              bookkeeping and checklists. Checking a box does not run rsync or change Popmenu.
            </li>
            <li>
              Never open <code>/mcflamingo/homepage-snapshot.html</code> expecting a menu — that
              file is digest-only (broken without Popmenu scripts).
            </li>
          </ul>
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
                          setMsg("Store live — SISO in the light. Finish operator booth jobs.");
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
                    onAttachDigest={(digest) => {
                      try {
                        setState(attachStoreDigest(state, selected.id, digest));
                        setMsg("Digest attached.");
                      } catch (err) {
                        setMsg(err instanceof Error ? err.message : "Digest failed");
                      }
                    }}
                    onOriginDark={() => {
                      try {
                        setState(markStoreOriginDark(state, selected.id));
                        setMsg("Origin dark — till cut active on surviving checkouts.");
                      } catch (err) {
                        setMsg(err instanceof Error ? err.message : "Failover mark failed");
                      }
                    }}
                    onRecordTill={(amountPix) => {
                      try {
                        setState(
                          recordTillSettlement(state, selected.id, amountPix, {
                            via: "simulated",
                          }),
                        );
                        setMsg(`Till recorded ${amountPix} PIX volume (lab bookkeeping).`);
                      } catch (err) {
                        setMsg(err instanceof Error ? err.message : "Till record failed");
                      }
                    }}
                    onChaosDrill={() => {
                      void (async () => {
                        try {
                          const { state: next, report } = await runChaosDrill(state, selected.id);
                          setState(next);
                          setMsg(
                            `Chaos drill: originDark=${report.originDark} mirrorsServe=${report.mirrorsServe} fee=${report.feePix} accrued=${report.accruedPix}`,
                          );
                        } catch (err) {
                          setMsg(err instanceof Error ? err.message : "Drill failed");
                        }
                      })();
                    }}
                    onCheckOrigin={() => {
                      void (async () => {
                        try {
                          const {
                            state: next,
                            probe,
                            flipped,
                          } = await checkOriginAndFailover(state, selected.id);
                          setState(next);
                          setMsg(
                            probe.ok
                              ? `Origin reachable (${probe.status ?? "ok"} · ${probe.ms}ms) — till stays idle.`
                              : `Origin probe failed (${probe.error ?? "down"} · ${probe.ms}ms)${flipped ? " — marked origin dark (ops flip, not DNS)." : " — already dark."}`,
                          );
                        } catch (err) {
                          setMsg(err instanceof Error ? err.message : "Origin check failed");
                        }
                      })();
                    }}
                    onExportPack={() => {
                      try {
                        const pack = buildInvitePack(state, selected.id);
                        const encoded = encodeInvitePack(pack);
                        void navigator.clipboard.writeText(encoded);
                        setState(markInviteSent(state, selected.id));
                        setMsg(
                          "Invite pack copied — send to merchant’s phone. They paste it on the join page if the link alone isn’t enough.",
                        );
                      } catch (err) {
                        setMsg(err instanceof Error ? err.message : "Export failed");
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
          {continuityPitchPair(
            "Merchants only see the secure link / pack and “Turn on Continuity.” Booth jobs (publish / failover) stay Continuity ops — operator backstage.",
          )}
        </p>

        <section className="mt-12 max-w-2xl border-t border-foreground/10 pt-8">
          <h2 className="font-pixel text-xs tracking-[0.28em] text-primary uppercase">
            Continuity ops · DNS / mirrors (honest)
          </h2>
          <p className="mt-3 text-sm text-muted-foreground">{continuityDisciplineLine()}</p>
          <ul className="mt-4 list-inside list-disc space-y-2 text-xs text-muted-foreground">
            <li>Public domain stays with the merchant registrar — Continuity does not flip DNS.</li>
            <li>
              Mirror / rung URLs are Continuity ops checklist items — probe health here; publish
              with your own tools.
            </li>
            <li>
              Order webhook: Pixel node <span className="font-mono">POST /continuity/order</span>{" "}
              with <span className="font-mono">CONTINUITY_WEBHOOK_SECRET</span> — point
              Popmenu/Toast there when ready.
            </li>
            <li>
              Cross-phone: invite pack (desk button) or node{" "}
              <span className="font-mono">GET /continuity/invite/:token</span> after PUT ops.
            </li>
          </ul>
        </section>
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
  onAttachDigest,
  onOriginDark,
  onRecordTill,
  onChaosDrill,
  onCheckOrigin,
  onExportPack,
}: {
  store: ContinuityStore;
  inviteUrl: string;
  rungIds: string[];
  rungLabels: Record<string, string>;
  onInviteSent: () => void;
  onAssign: (ids: string[]) => void;
  onLive: () => void;
  onToggleDeploy: (itemId: string) => void;
  onAttachDigest: (digest: string) => void;
  onOriginDark: () => void;
  onRecordTill: (amountPix: number) => void;
  onChaosDrill: () => void;
  onCheckOrigin: () => void;
  onExportPack: () => void;
}) {
  const [picked, setPicked] = useState<string[]>(
    store.rungIds.length ? store.rungIds : rungIds.slice(0, 2),
  );
  const [digestPaste, setDigestPaste] = useState("");
  const [tillAmount, setTillAmount] = useState("10000");

  return (
    <div className="mt-6 space-y-8">
      <div>
        <p className="font-pixel text-2xl font-bold">{store.name}</p>
        <p className="text-sm text-muted-foreground">
          {store.domain} · ${store.priceUsdPerMonth}/mo · till{" "}
          {(store.tillCutBpsWhenOriginDark / 100).toFixed(0)}% on outage · {stepLabel(store.step)}
        </p>
        {store.anchoredOnPixel ? (
          <p className="mt-2 text-xs text-primary">
            On Pixel · tip #{store.pixelIndex} · {store.registerRef}
            {store.tipHash ? ` · ${store.tipHash.slice(0, 16)}…` : ""}
          </p>
        ) : store.step === "live" ? (
          <p className="mt-2 text-xs text-destructive">
            Live without Pixel tip — invalid; re-run demo / go live.
          </p>
        ) : null}
        <p className="mt-2 text-xs text-muted-foreground">{merchantOfferCopy(store)}</p>
        <p className="mt-1 truncate text-xs text-muted-foreground">{store.originUrl}</p>
        {store.digest && (
          <p className="mt-2 font-mono text-[11px] break-all text-muted-foreground">
            digest {store.digest.slice(0, 48)}…
          </p>
        )}
        {store.step === "live" && (
          <p className="mt-2 text-xs">
            Till {tillIsActive(store) ? "ACTIVE" : "idle"} · {activeTillBps(store)} bps
            {store.continuity?.state === "origin_dark" ? " (origin dark)" : ""}
            {" · "}accrued {tillAccruedPix(store)} PIX
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
          <button type="button" className="continuity-btn" onClick={onExportPack}>
            Copy invite pack (cross-phone)
          </button>
          <Link
            to="/continuity/join/$token"
            params={{ token: store.inviteToken }}
            className="continuity-btn-ghost"
          >
            Open join page
          </Link>
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          Pack = Continuity invite for another phone. Link alone only works when ops are already on
          that device or on a Pixel node.
        </p>
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
          Operator · Attach digest (if merchant skipped upload)
        </h3>
        <textarea
          className="continuity-input mt-2 min-h-[4rem] font-mono text-xs"
          placeholder="Paste homepage HTML — we digest it here (merchant never sees this)."
          value={digestPaste}
          onChange={(e) => setDigestPaste(e.target.value)}
        />
        <button
          type="button"
          className="continuity-btn-ghost mt-2"
          disabled={!digestPaste.trim()}
          onClick={() => {
            void digestArtifactText(digestPaste).then(onAttachDigest);
          }}
        >
          Digest & attach
        </button>
      </div>

      <div>
        <h3 className="font-pixel text-xs tracking-[0.28em] text-primary uppercase">
          Step 5 · Go live
        </h3>
        <p className="mt-2 text-sm text-muted-foreground">
          Shines digest into SISO and opens operator booth jobs. Merchants already turned Continuity
          on via the secure link.
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
                booth{" "}
                {m.includes("localhost") || m.includes("homepage-snapshot") ? (
                  <span className="text-destructive">{m} (lab digest URL — not the live menu)</span>
                ) : (
                  <a className="underline" href={m} target="_blank" rel="noreferrer">
                    {m}
                  </a>
                )}
              </li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-muted-foreground">
            Live restaurant:{" "}
            <a className="underline" href={MCFLAMINGO_MENU_URL} target="_blank" rel="noreferrer">
              menu
            </a>
            {" · "}
            <a className="underline" href={MCFLAMINGO_ORDER_URL} target="_blank" rel="noreferrer">
              order
            </a>
          </p>
          {store.step === "live" && (
            <div className="mt-4 space-y-2">
              <Link
                to="/continuity/booth/$domain"
                params={{ domain: store.domain }}
                className="continuity-btn inline-flex"
              >
                Open Continuity booth (Pay with Pixel)
              </Link>
              <p className="text-xs text-muted-foreground">
                Customer booth settles real PIX UTXOs. Till fee UTXOs only while origin dark.
              </p>
              {store.merchantAddress && (
                <p className="font-mono text-[11px] break-all text-muted-foreground">
                  merchant {store.merchantAddress.slice(0, 24)}…
                  {store.tillAddress ? ` · till ${store.tillAddress.slice(0, 16)}…` : ""}
                </p>
              )}
            </div>
          )}
          {store.continuity.state === "in_the_light" && (
            <button type="button" className="continuity-btn mt-3" onClick={onOriginDark}>
              Mark origin dark (activate till)
            </button>
          )}
          {store.step === "live" && (
            <div className="mt-4 space-y-2">
              <button type="button" className="continuity-btn" onClick={onCheckOrigin}>
                Check origin health
              </button>
              <p className="text-xs text-muted-foreground">
                Probe {store.originUrl}. If down → mark origin dark (ops flip, not DNS takeover).
                {store.lastOriginProbe
                  ? ` Last: ${store.lastOriginProbe.ok ? "ok" : "fail"} · ${store.lastOriginProbe.ms}ms`
                  : ""}
              </p>
              <button type="button" className="continuity-btn-ghost" onClick={onChaosDrill}>
                Run lab chaos drill
              </button>
              <p className="text-xs text-muted-foreground">
                origin dark → mirrors serve → till journal (use booth for on-chain; not Gate J)
              </p>
            </div>
          )}
          {tillIsActive(store) && (
            <div className="mt-4 space-y-2">
              <h4 className="font-pixel text-[11px] tracking-[0.18em] text-muted-foreground uppercase">
                Record till (journal only — prefer booth for UTXOs)
              </h4>
              <div className="flex flex-wrap items-center gap-2">
                <input
                  className="continuity-input w-32"
                  value={tillAmount}
                  onChange={(e) => setTillAmount(e.target.value)}
                />
                <button
                  type="button"
                  className="continuity-btn-ghost"
                  onClick={() => onRecordTill(Number(tillAmount) || 0)}
                >
                  Accrue till
                </button>
              </div>
              {(store.tillEvents?.length ?? 0) > 0 && (
                <ul className="mt-2 space-y-1 text-xs text-muted-foreground">
                  {[...(store.tillEvents ?? [])]
                    .reverse()
                    .slice(0, 5)
                    .map((e) => (
                      <li key={e.id}>
                        +{e.feePix} PIX fee on {e.amountPix} · {e.via} · {e.bps} bps
                        {e.onChain ? ` · on-chain tip #${e.pixelIndex}` : " · journal"}
                      </li>
                    ))}
                </ul>
              )}
            </div>
          )}
        </div>
      )}

      {store.deployPlan && store.deployPlan.length > 0 && (
        <div>
          <h3 className="font-pixel text-xs tracking-[0.28em] text-primary uppercase">
            Operator booth jobs (not merchant-facing)
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
