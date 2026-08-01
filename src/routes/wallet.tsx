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
      {
        name: "viewport",
        content:
          "width=device-width, initial-scale=1, viewport-fit=cover, maximum-scale=1, user-scalable=no",
      },
      { name: "theme-color", content: "#0c1410" },
      { name: "apple-mobile-web-app-capable", content: "yes" },
      { name: "apple-mobile-web-app-status-bar-style", content: "black-translucent" },
      { name: "apple-mobile-web-app-title", content: "PIXEL" },
      { name: "mobile-web-app-capable", content: "yes" },
      { name: "format-detection", content: "telephone=no" },
    ],
    links: [
      { rel: "manifest", href: "/manifest.webmanifest" },
      { rel: "apple-touch-icon", href: "/icons/pixel-wallet.svg" },
    ],
  }),
  validateSearch: (s: Record<string, unknown>) => ({
    rpc: typeof s.rpc === "string" ? s.rpc : undefined,
    tab:
      s.tab === "send" || s.tab === "bridge" || s.tab === "hold" || s.tab === "concept"
        ? s.tab
        : undefined,
  }),
  component: WalletPage,
});

type Tab = "hold" | "send" | "bridge" | "concept";

/** Plain talk — phone = card, tip = bank, Bridge = deposit. */
const WALLET_CONCEPT = {
  title: "How this works",
  lines: [
    "Your phone is like a debit card.",
    "The tip is like the bank.",
    "PIX is the money in that bank account.",
  ],
  bullets: [
    { label: "Phone", text: "proves it’s you (holds your key under a PIN)." },
    {
      label: "PIN",
      text: "locks the vault — wrong PIN keeps it sealed (AES-GCM).",
    },
    {
      label: "Face ID",
      text: "optional on browsers with WebAuthn PRF — real unwrap, not a fake gate.",
    },
    { label: "Tip", text: "is where your balance actually lives." },
    { label: "Bridge", text: "deposit dollars / USDC → it shows up as PIX." },
    { label: "Send", text: "Venmo to a friend on the same bank." },
    { label: "Fund tip", text: "a free starter top-up so you can try it." },
    { label: "Backup", text: "export PIN-sealed JSON — still needs your PIN to open." },
    {
      label: "Quantum-leaning",
      text: "payments use one-time hash signatures (OTS) — not classical ECDSA.",
    },
  ],
  closer:
    "You don’t run a bank on your phone. Unlock (PIN or Face ID), see balance, pay. Auto-locks after idle. Still lab-scale — not FDIC.",
};

function WalletPage() {
  const { rpc: rpcQuery, tab: tabQuery } = Route.useSearch();
  const w = usePeopleWallet(rpcQuery);
  const [tab, setTab] = useState<Tab>(tabQuery ?? "hold");
  const [name, setName] = useState("you");
  const [pin, setPin] = useState("");
  const [pinConfirm, setPinConfirm] = useState("");
  const [unlockPin, setUnlockPin] = useState("");
  const [toAddr, setToAddr] = useState("");
  const [amount, setAmount] = useState("1");
  const [note, setNote] = useState("");
  const [bridgeAsset, setBridgeAsset] = useState<WalletBridgeAsset>("USDC");
  const [bridgeUsd, setBridgeUsd] = useState("5");
  const [lockTxHash, setLockTxHash] = useState("");
  const [ethLockNote, setEthLockNote] = useState("");
  const [installHint, setInstallHint] = useState(false);

  useEffect(() => {
    document.documentElement.classList.add("wallet-route");
    document.body.classList.add("wallet-route");
    const scrubLovable = () => {
      document
        .querySelectorAll("#lovable-badge, [id='lovable-badge']")
        .forEach((el) => el.remove());
    };
    scrubLovable();
    const mo = new MutationObserver(scrubLovable);
    mo.observe(document.documentElement, { childList: true, subtree: true });
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
    return () => {
      mo.disconnect();
      document.documentElement.classList.remove("wallet-route");
      document.body.classList.remove("wallet-route");
    };
  }, []);

  return (
    <main className="wallet-phone text-foreground">
      <div className="wallet-phone-glow" aria-hidden />
      <div className="wallet-phone-shell">
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
          <p className="mt-4 rounded-2xl border border-emerald-400/20 bg-emerald-400/5 px-3 py-2 text-xs leading-relaxed text-white/70">
            <span className="font-medium text-emerald-200/90">Install like a real wallet:</span>{" "}
            iPhone Safari → Share → Add to Home Screen. Android Chrome → Install app. Then Fund tip
            → Bridge / Send.
          </p>
        ) : (
          <p className="mt-4 text-xs text-emerald-300/70">
            Installed · Personal Source on this phone
          </p>
        )}

        {!w.ready ? (
          <p className="mt-16 text-sm text-white/50">Opening…</p>
        ) : !w.payFace ? (
          <section className="mt-10 flex flex-1 flex-col justify-center space-y-6">
            <p className="text-base leading-relaxed text-white/70">{peopleWalletThesis()}</p>
            <p className="text-sm text-white/50">
              Forge once on this phone. Choose a PIN — your key is sealed with it. Pay face only;
              vault never shown.
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
            <label className="block">
              <span className="font-pixel text-[10px] tracking-[0.18em] text-white/40 uppercase">
                PIN (6+ characters)
              </span>
              <input
                type="password"
                inputMode="numeric"
                autoComplete="new-password"
                value={pin}
                onChange={(e) => setPin(e.target.value)}
                className="wallet-input mt-2"
                placeholder="••••••"
              />
            </label>
            <label className="block">
              <span className="font-pixel text-[10px] tracking-[0.18em] text-white/40 uppercase">
                Confirm PIN
              </span>
              <input
                type="password"
                inputMode="numeric"
                autoComplete="new-password"
                value={pinConfirm}
                onChange={(e) => setPinConfirm(e.target.value)}
                className="wallet-input mt-2"
                placeholder="••••••"
              />
            </label>
            <button
              type="button"
              disabled={w.busy || pin.length < 6 || pin !== pinConfirm}
              onClick={() => void w.forge(name, pin)}
              className="wallet-cta"
            >
              {w.busy ? "Forging…" : "Create wallet"}
            </button>
            {pin.length > 0 && pin !== pinConfirm ? (
              <p className="text-xs text-amber-200/80">PINs must match</p>
            ) : null}
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
                  {w.crownedTip ? ` · Earth ${w.crownedPrefix}…` : " · check genesis"}
                  {w.tipBridgeLab ? " · bridge open" : ""}
                  {w.tipFaucet ? " · faucet open" : ""}
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
                {w.unlocked ? (
                  <button
                    type="button"
                    disabled={w.busy}
                    onClick={() => w.lock()}
                    className="wallet-chip-active"
                  >
                    Lock
                  </button>
                ) : (
                  <>
                    <input
                      type="password"
                      inputMode="numeric"
                      autoComplete="current-password"
                      value={unlockPin}
                      onChange={(e) => setUnlockPin(e.target.value)}
                      placeholder="PIN"
                      className="wallet-input max-w-[7.5rem] py-2 text-sm"
                      aria-label="PIN to unlock"
                    />
                    <button
                      type="button"
                      disabled={w.busy || unlockPin.length < 6 || w.needsPinUpgrade}
                      onClick={() => void w.unlock(unlockPin).then(() => setUnlockPin(""))}
                      className="wallet-chip"
                    >
                      Unlock
                    </button>
                    {w.deviceUnlockOn ? (
                      <button
                        type="button"
                        disabled={w.busy || w.needsPinUpgrade}
                        onClick={() => void w.unlockDevice()}
                        className="wallet-chip"
                      >
                        Face ID
                      </button>
                    ) : null}
                  </>
                )}
                <button
                  type="button"
                  disabled={w.busy || !w.rpc || w.tipFaucet === false}
                  onClick={() => void w.faucet().catch(() => undefined)}
                  className="wallet-chip-active"
                >
                  Fund tip
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
              {w.needsPinUpgrade ? (
                <p className="mt-3 text-xs text-amber-200/90">
                  Old wallet (no PIN). Clear device hold, then create again with a PIN.
                </p>
              ) : w.pinSealed && !w.unlocked ? (
                <p className="mt-3 text-xs text-white/45">PIN-sealed · enter PIN to send</p>
              ) : null}
              {w.faucetNote ? (
                <p className="mt-3 text-xs text-emerald-300/90">{w.faucetNote}</p>
              ) : null}
            </section>

            <div className="mt-8 pb-4">
              {tab === "concept" ? (
                <div className="space-y-5 text-sm leading-relaxed text-white/70">
                  <h2 className="font-display text-2xl font-bold tracking-tight text-white">
                    {WALLET_CONCEPT.title}
                  </h2>
                  <ul className="space-y-2">
                    {WALLET_CONCEPT.lines.map((line) => (
                      <li key={line} className="text-base text-white/85">
                        {line}
                      </li>
                    ))}
                  </ul>
                  <ul className="space-y-3 border-t border-white/10 pt-4">
                    {WALLET_CONCEPT.bullets.map((b) => (
                      <li key={b.label}>
                        <span className="font-medium text-emerald-200/90">{b.label}</span>
                        <span className="text-white/55"> — {b.text}</span>
                      </li>
                    ))}
                  </ul>
                  <p className="text-white/55">{WALLET_CONCEPT.closer}</p>
                </div>
              ) : null}

              {tab === "hold" ? (
                <div className="space-y-4 text-sm text-white/65">
                  <p>{walletBridgeThesis()}</p>
                  <p>
                    This phone holds your Personal Source under a{" "}
                    <strong className="text-white/85">PIN</strong> (IndexedDB). Pay marks the{" "}
                    <strong className="font-medium text-white/85">one public tip</strong>. Session
                    auto-locks after a few idle minutes.
                  </p>
                  {w.unlocked ? (
                    <div className="flex flex-wrap gap-2">
                      {w.webAuthnAvailable && !w.deviceUnlockOn ? (
                        <button
                          type="button"
                          disabled={w.busy}
                          onClick={() => void w.enableBiometric().catch(() => undefined)}
                          className="wallet-chip-active"
                        >
                          Enable Face ID / Touch ID
                        </button>
                      ) : null}
                      {w.deviceUnlockOn ? (
                        <span className="wallet-chip text-emerald-200/80">Device unlock on</span>
                      ) : null}
                      <button
                        type="button"
                        disabled={w.busy}
                        onClick={() => {
                          try {
                            w.exportBackup();
                          } catch (e) {
                            console.error(e);
                          }
                        }}
                        className="wallet-chip"
                      >
                        Export backup
                      </button>
                    </div>
                  ) : null}
                  <label className="block">
                    <span className="wallet-label">Import backup (PIN)</span>
                    <input
                      type="file"
                      accept="application/json,.json"
                      className="mt-2 block w-full text-xs text-white/50"
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (!f) return;
                        const pinAsk = window.prompt("PIN for this backup");
                        if (!pinAsk) return;
                        void f.text().then((t) => w.importBackup(t, pinAsk).catch(() => undefined));
                      }}
                    />
                  </label>
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
                      Pay PIX on the shared tip. Unlock with PIN first. Vault never appears.
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
                      {!w.unlocked ? "Unlock with PIN to send" : w.busy ? "Sending…" : "Send PIX"}
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
                <div className="space-y-6">
                  {w.tipBridgeEvm ? (
                    <form
                      className="space-y-4"
                      onSubmit={(e) => {
                        e.preventDefault();
                        void w.bridgeFromLockTx(lockTxHash.trim()).catch(() => undefined);
                      }}
                    >
                      <p className="text-sm text-white/55">
                        Shine in from{" "}
                        <span className="text-white/85">{w.tipBridgeEvm.chainName}</span>: lock
                        MockUSDC into{" "}
                        <span className="font-mono text-[11px] text-white/70">
                          {w.tipBridgeEvm.lock.slice(0, 10)}…
                        </span>
                        → native PIX on this tip (foreign chain is receipt-only). Caps at $
                        {WALLET_BRIDGE_MAX_USD}.
                      </p>
                      <button
                        type="button"
                        disabled={w.busy || !w.payFace}
                        className="wallet-cta"
                        onClick={() => {
                          void (async () => {
                            try {
                              setEthLockNote("");
                              if (!w.unlocked) {
                                throw new Error("Unlock with PIN first, then lock on Sepolia");
                              }
                              const { getInjectedEthereum, lockUsdcWithInjectedWallet } =
                                await import("@/lib/pixel/browser-eth-lock");
                              const eth = getInjectedEthereum();
                              if (!eth) {
                                throw new Error(
                                  `No Rabby / MetaMask — lock on ${w.tipBridgeEvm!.chainName}, then paste the tx hash below`,
                                );
                              }
                              if (!w.payFace || !w.tipBridgeEvm) return;
                              const { txHash } = await lockUsdcWithInjectedWallet({
                                ethereum: eth,
                                cfg: {
                                  enabled: true,
                                  chainKey: w.tipBridgeEvm.chainKey,
                                  chainName: w.tipBridgeEvm.chainName,
                                  chainId: w.tipBridgeEvm.chainId,
                                  ethRpcUrl: "",
                                  lockContract: w.tipBridgeEvm.lock,
                                  usdcContract: w.tipBridgeEvm.usdc ?? "",
                                  explorerTxBase: w.tipBridgeEvm.explorerTxBase,
                                  nativeSymbol: w.tipBridgeEvm.nativeSymbol,
                                },
                                humanUsd: Number(bridgeUsd) || 0,
                                pixelRecipient: w.payFace.address,
                                mintIfMock: true,
                              });
                              setLockTxHash(txHash);
                              await w.bridgeFromLockTx(txHash);
                            } catch (err) {
                              const { ethProviderErrorMessage } =
                                await import("@/lib/pixel/browser-eth-lock");
                              setEthLockNote(ethProviderErrorMessage(err));
                            }
                          })();
                        }}
                      >
                        {w.busy
                          ? "Locking…"
                          : `Lock ${bridgeUsd} USDC on ${w.tipBridgeEvm.chainName}`}
                      </button>
                      {ethLockNote ? (
                        <p className="text-xs text-amber-200/90" role="status">
                          {ethLockNote}
                        </p>
                      ) : null}
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
                        />
                      </label>
                      <label className="block">
                        <span className="wallet-label">Or paste lock tx hash</span>
                        <input
                          value={lockTxHash}
                          onChange={(e) => setLockTxHash(e.target.value)}
                          placeholder="0x…"
                          className="wallet-input mt-1 font-mono text-sm"
                          required
                        />
                      </label>
                      <button
                        type="submit"
                        disabled={w.busy || !lockTxHash.trim()}
                        className="wallet-cta"
                      >
                        {w.busy ? "Verifying…" : "Shine lock → PIX"}
                      </button>
                      <p className="text-xs text-white/40">
                        Pixel is not this L2 — the foreign lock is only a receipt. No Rabby /
                        MetaMask: lock elsewhere, paste tx.
                      </p>
                    </form>
                  ) : null}

                  <form
                    className="space-y-4"
                    onSubmit={(e) => {
                      e.preventDefault();
                      void w.bridgeIn(bridgeAsset, Number(bridgeUsd) || 0).catch(() => undefined);
                    }}
                  >
                    <p className="text-sm text-white/55">
                      {w.tipBridgeEvm
                        ? "Lab demo rail (theater — no foreign lock):"
                        : "Bridge world value into PIX — USDC, ETH (USD quote), or bank wire. Caps at $"}
                      {!w.tipBridgeEvm ? `${WALLET_BRIDGE_MAX_USD} per shine-in (lab).` : null}
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
                        : `Lab bridge ${bridgeUsd} ${bridgeAsset === "USD" ? "USD" : bridgeAsset}`}
                    </button>
                    {w.rpc && w.tipBridgeLab === false && !w.tipBridgeEvm ? (
                      <p className="text-xs text-white/40">
                        Tip has no open shine-in yet — this phone will use the local lab rail.
                      </p>
                    ) : null}
                    {w.tipBridgeLab ? (
                      <p className="text-xs text-amber-200/70">
                        Lab bridge is tip faucet theater — not a verified foreign lock.
                      </p>
                    ) : null}
                  </form>

                  {w.lastBridge ? (
                    <div className="space-y-1 rounded-2xl border border-emerald-400/20 bg-emerald-400/5 px-3 py-3 text-sm">
                      <p className="text-emerald-300">
                        +{w.lastBridge.pixCredited} PIX ·{" "}
                        {w.lastBridge.plane === "shared_tip"
                          ? w.lastBridge.lab
                            ? "shared tip (lab)"
                            : "shared tip (lock verified)"
                          : "lab rail (local)"}
                      </p>
                      <p className="text-xs text-white/55">{w.lastBridge.summary}</p>
                      {w.lastBridge.lockTx && w.tipBridgeEvm ? (
                        <a
                          className="block text-xs text-emerald-200/80 underline"
                          href={`${w.tipBridgeEvm.explorerTxBase}${w.lastBridge.lockTx}`}
                          target="_blank"
                          rel="noreferrer"
                        >
                          View lock tx on {w.tipBridgeEvm.chainName}
                        </a>
                      ) : null}
                    </div>
                  ) : null}
                </div>
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
        <nav className="wallet-tabbar wallet-tabbar-4" aria-label="Wallet">
          {(
            [
              ["hold", "Hold"],
              ["send", "Send"],
              ["bridge", "Bridge"],
              ["concept", "Concept"],
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
