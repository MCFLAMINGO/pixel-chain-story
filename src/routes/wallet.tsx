import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { usePeopleWallet } from "@/hooks/use-people-wallet";
import { peopleWalletThesis } from "@/lib/pixel/people-wallet";
import {
  WALLET_BRIDGE_MAX_USD,
  bridgeAssetLabel,
  walletBridgeThesis,
  type WalletBridgeAsset,
} from "@/lib/pixel/wallet-bridge";
import { formatCanvasId, settlementHonesty } from "@/lib/pixel";

/**
 * Phone Personal Source — hold, pay, bridge USDC/crypto on the one tip.
 * Installable PWA. Vault never drawn. Not a node.
 */
export const Route = createFileRoute("/wallet")({
  head: () => ({
    meta: [
      { title: "PIXEL Wallet" },
      {
        name: "description",
        content:
          "Your Pixel hold on the public tip — balance, pay, bridge USDC and crypto. Add to Home Screen.",
      },
      { name: "theme-color", content: "#0c1410" },
      { name: "apple-mobile-web-app-capable", content: "yes" },
      { name: "apple-mobile-web-app-status-bar-style", content: "black-translucent" },
      { name: "apple-mobile-web-app-title", content: "PIXEL" },
      { name: "mobile-web-app-capable", content: "yes" },
    ],
    links: [
      { rel: "manifest", href: "/manifest.webmanifest" },
      { rel: "apple-touch-icon", href: "/icons/pixel-wallet.svg" },
    ],
  }),
  validateSearch: (s: Record<string, unknown>) => ({
    rpc: typeof s.rpc === "string" ? s.rpc : undefined,
    tab: s.tab === "send" || s.tab === "bridge" || s.tab === "hold" ? s.tab : undefined,
  }),
  component: WalletPage,
});

type Tab = "hold" | "send" | "bridge";

function WalletPage() {
  const { rpc: rpcQuery, tab: tabQuery } = Route.useSearch();
  const w = usePeopleWallet(rpcQuery);
  const [tab, setTab] = useState<Tab>(tabQuery ?? "hold");
  const [name, setName] = useState("you");
  const [toAddr, setToAddr] = useState("");
  const [amount, setAmount] = useState("1");
  const [note, setNote] = useState("");
  const [bridgeAsset, setBridgeAsset] = useState<WalletBridgeAsset>("USDC");
  const [bridgeUsd, setBridgeUsd] = useState("5");
  const [installHint, setInstallHint] = useState(false);

  useEffect(() => {
    if ("serviceWorker" in navigator) {
      void navigator.serviceWorker.register("/sw-wallet.js").catch(() => {
        /* optional */
      });
    }
    const standalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      // @ts-expect-error iOS Safari
      Boolean(navigator.standalone);
    setInstallHint(!standalone);
  }, []);

  return (
    <main className="wallet-phone min-h-[100dvh] text-foreground">
      <div className="wallet-phone-glow" aria-hidden />
      <div className="relative z-10 mx-auto flex min-h-[100dvh] max-w-md flex-col px-5 pb-28 pt-8">
        <header className="flex items-start justify-between gap-3">
          <div>
            <p className="font-pixel text-[10px] tracking-[0.34em] text-emerald-300/90 uppercase">
              PIXEL
            </p>
            <h1 className="font-display mt-1 text-3xl font-bold tracking-tight">Wallet</h1>
          </div>
          <Link
            to="/"
            search={w.rpc ? { rpc: w.rpc } : {}}
            className="font-pixel mt-1 text-[10px] tracking-[0.2em] text-white/45 uppercase underline-offset-4 hover:text-emerald-300 hover:underline"
          >
            Field
          </Link>
        </header>

        {installHint ? (
          <p className="mt-4 rounded-2xl border border-emerald-400/20 bg-emerald-400/5 px-3 py-2 text-xs text-white/70">
            Add to Home Screen for a real phone hold — Safari Share → Add to Home Screen, or Chrome
            Install app.
          </p>
        ) : null}

        {!w.ready ? (
          <p className="mt-16 text-sm text-white/50">Opening…</p>
        ) : !w.payFace ? (
          <section className="mt-10 flex flex-1 flex-col justify-center space-y-6">
            <p className="text-base leading-relaxed text-white/70">{peopleWalletThesis()}</p>
            <p className="text-sm text-white/50">
              Forge once on this phone. You see your pay face only — the vault stays sealed.
            </p>
            <label className="block">
              <span className="font-pixel text-[10px] tracking-[0.18em] text-white/40 uppercase">
                Your name
              </span>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="wallet-input mt-2"
                autoComplete="nickname"
              />
            </label>
            <button
              type="button"
              disabled={w.busy}
              onClick={() => void w.forge(name)}
              className="wallet-cta"
            >
              {w.busy ? "Forging…" : "Create wallet"}
            </button>
          </section>
        ) : (
          <>
            <section className="mt-8 rounded-3xl border border-white/10 bg-black/35 px-5 py-6 backdrop-blur-md">
              <p className="font-pixel text-[10px] tracking-[0.2em] text-emerald-300/80 uppercase">
                {w.payFace.localId}
              </p>
              <p className="font-display mt-3 text-5xl font-bold tracking-tight">
                {w.rpc ? (w.balance === null ? "…" : w.balance) : "—"}
                <span className="ml-2 text-lg font-semibold text-white/45">PIX</span>
              </p>
              {w.rpc ? (
                <p className="mt-2 text-xs text-white/45">
                  On tip{typeof w.tipIndex === "number" ? ` #${w.tipIndex}` : ""}
                  {w.tipBridgeLab ? " · bridge open" : ""}
                </p>
              ) : (
                <p className="mt-2 text-xs text-amber-200/80">
                  No tip — set VITE_PIXEL_RPC or open with ?rpc=
                </p>
              )}
              <p className="mt-4 break-all font-mono text-[11px] leading-relaxed text-white/55">
                {w.payFace.address}
              </p>
              <div className="mt-5 flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={w.busy}
                  onClick={() => void w.unlock()}
                  className="wallet-chip"
                >
                  {w.unlocked ? "Unlocked" : "Unlock"}
                </button>
                <button
                  type="button"
                  disabled={w.busy || !w.rpc}
                  onClick={() => void w.refresh()}
                  className="wallet-chip"
                >
                  Refresh
                </button>
              </div>
            </section>

            <div className="mt-8 flex-1">
              {tab === "hold" ? (
                <div className="space-y-4 text-sm text-white/65">
                  <p>{walletBridgeThesis()}</p>
                  <p>
                    This phone holds your Personal Source. Pay and bridge mark the{" "}
                    <strong className="font-medium text-white/85">one public tip</strong> — you
                    never invent a private Earth.
                  </p>
                  <button
                    type="button"
                    disabled={w.busy}
                    onClick={() => w.clear()}
                    className="font-pixel text-[10px] tracking-[0.16em] text-red-300/80 uppercase underline-offset-4 hover:underline"
                  >
                    Clear device hold
                  </button>
                </div>
              ) : null}

              {tab === "send" ? (
                w.rpc ? (
                  <form
                    className="space-y-4"
                    onSubmit={(e) => {
                      e.preventDefault();
                      void w
                        .pay(toAddr, Math.floor(Number(amount) || 0), note || undefined)
                        .catch(() => undefined);
                    }}
                  >
                    <p className="text-sm text-white/55">
                      Pay PIX on the shared tip. Unlock first. Vault never appears.
                    </p>
                    <label className="block">
                      <span className="wallet-label">To</span>
                      <input
                        value={toAddr}
                        onChange={(e) => setToAddr(e.target.value)}
                        placeholder="pix1…"
                        className="wallet-input mt-1 font-mono text-sm"
                        required
                      />
                    </label>
                    <label className="block">
                      <span className="wallet-label">Amount</span>
                      <input
                        type="number"
                        min={1}
                        value={amount}
                        onChange={(e) => setAmount(e.target.value)}
                        className="wallet-input mt-1"
                        required
                      />
                    </label>
                    <label className="block">
                      <span className="wallet-label">Note</span>
                      <input
                        value={note}
                        onChange={(e) => setNote(e.target.value)}
                        className="wallet-input mt-1"
                      />
                    </label>
                    <button type="submit" disabled={w.busy || !w.unlocked} className="wallet-cta">
                      {!w.unlocked ? "Unlock to send" : w.busy ? "Sending…" : "Send PIX"}
                    </button>
                    {w.lastPay ? (
                      <div className="space-y-1 text-sm" role="status">
                        <p className="text-emerald-300">
                          {settlementHonesty(w.lastPay.attachment)}
                        </p>
                        <p className="font-mono text-[11px] break-all text-white/45">
                          canvas {formatCanvasId(w.lastPay.canvasId)} · tip #{w.lastPay.tipIndex}
                        </p>
                      </div>
                    ) : null}
                  </form>
                ) : (
                  <p className="text-sm text-amber-200/80">Connect a tip RPC to send.</p>
                )
              ) : null}

              {tab === "bridge" ? (
                <form
                  className="space-y-4"
                  onSubmit={(e) => {
                    e.preventDefault();
                    void w.bridgeIn(bridgeAsset, Number(bridgeUsd) || 0).catch(() => undefined);
                  }}
                >
                  <p className="text-sm text-white/55">
                    Bridge world value into PIX on your pay face — USDC, ETH (USD quote), or bank
                    wire. Caps at ${WALLET_BRIDGE_MAX_USD} per shine-in (lab).
                  </p>
                  <div className="grid grid-cols-3 gap-2">
                    {(["USDC", "ETH", "USD"] as WalletBridgeAsset[]).map((a) => (
                      <button
                        key={a}
                        type="button"
                        onClick={() => setBridgeAsset(a)}
                        className={bridgeAsset === a ? "wallet-chip-active" : "wallet-chip"}
                      >
                        {a === "USD" ? "Wire" : a}
                      </button>
                    ))}
                  </div>
                  <p className="text-xs text-white/40">{bridgeAssetLabel(bridgeAsset)}</p>
                  <label className="block">
                    <span className="wallet-label">Amount (USD)</span>
                    <input
                      type="number"
                      min={1}
                      max={WALLET_BRIDGE_MAX_USD}
                      step={1}
                      value={bridgeUsd}
                      onChange={(e) => setBridgeUsd(e.target.value)}
                      className="wallet-input mt-1"
                      required
                    />
                  </label>
                  <button type="submit" disabled={w.busy} className="wallet-cta">
                    {w.busy
                      ? "Bridging…"
                      : `Bridge in ${bridgeUsd} ${bridgeAsset === "USD" ? "USD" : bridgeAsset}`}
                  </button>
                  {w.rpc && w.tipBridgeLab === false ? (
                    <p className="text-xs text-white/40">
                      Tip has no open shine-in yet — this phone will use the local lab rail, then
                      you can still pay once the tip funds your face.
                    </p>
                  ) : null}
                  {w.lastBridge ? (
                    <div className="space-y-1 rounded-2xl border border-emerald-400/20 bg-emerald-400/5 px-3 py-3 text-sm">
                      <p className="text-emerald-300">
                        +{w.lastBridge.pixCredited} PIX ·{" "}
                        {w.lastBridge.plane === "shared_tip" ? "on shared tip" : "lab rail (local)"}
                      </p>
                      <p className="text-xs text-white/55">{w.lastBridge.summary}</p>
                    </div>
                  ) : null}
                </form>
              ) : null}
            </div>
          </>
        )}

        {w.error ? (
          <p className="mt-6 text-sm text-red-300" role="alert">
            {w.error}
          </p>
        ) : null}
      </div>

      {w.payFace ? (
        <nav className="wallet-tabbar" aria-label="Wallet">
          {(
            [
              ["hold", "Hold"],
              ["send", "Send"],
              ["bridge", "Bridge"],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              className={tab === id ? "wallet-tab-active" : "wallet-tab"}
              onClick={() => setTab(id)}
            >
              {label}
            </button>
          ))}
        </nav>
      ) : null}
    </main>
  );
}
