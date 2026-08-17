import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { usePeopleWallet } from "@/hooks/use-people-wallet";
import { peopleWalletThesis } from "@/lib/pixel/people-wallet";
import {
  WALLET_BRIDGE_MAX_USD,
  bridgeAssetLabel,
  walletBridgeThesis,
  type WalletBridgeAsset,
} from "@/lib/pixel/wallet-bridge";
import { formatCanvasId, settlementHonesty } from "@/lib/pixel";
import { extractPayAddress, payFaceShareUrl, payLinkThesis } from "@/lib/pixel/pay-link";
import { canScanPayQr, pollPayQrFrame, startPayQrScan } from "@/lib/pixel/pay-qr-scan";
import {
  canScanPayMatrix,
  pollPayMatrixFrame,
  startPayMatrixScan,
} from "@/lib/pixel/pay-matrix-scan";
import { payFaceOpticalThesis } from "@/lib/pixel/pay-face-optical";
import { PayFaceQr } from "@/components/pixel/PayFaceShare";
import { PayFaceMatrix } from "@/components/pixel/PayFaceMatrix";
import { isPixelAddress } from "@/lib/pixel/crypto";
import { fetchTipBalance } from "@/lib/pixel/people-wallet";
import type { TipMarkReceipt } from "@/lib/pixel/tip-mark";
import { useChainMirror } from "@/hooks/use-chain-mirror";
import { CROWNED_GENESIS_HASH } from "@/lib/pixel/crowned-genesis";

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
  validateSearch: (s: Record<string, unknown>): { rpc?: string; tab?: Tab; to?: string } => {
    const toRaw = typeof s.to === "string" ? s.to.trim().toLowerCase() : undefined;
    const to = toRaw && isPixelAddress(toRaw) ? toRaw : undefined;
    // Annotated as `Tab` rather than inferred: the inferred type widened to `string`,
    // so `useState<Tab>(tabQuery ?? …)` could not accept it even though every value
    // this function can produce is a valid tab.
    const tab: Tab | undefined =
      s.tab === "send" || s.tab === "bridge" || s.tab === "hold" || s.tab === "concept"
        ? s.tab
        : to
          ? "send"
          : undefined;
    return { rpc: typeof s.rpc === "string" ? s.rpc : undefined, tab, to };
  },
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
  const { rpc: rpcQuery, tab: tabQuery, to: toQuery } = Route.useSearch();
  const [exportText, setExportText] = useState<string | null>(null);
  const [exportErr, setExportErr] = useState<string | null>(null);
  const [importText, setImportText] = useState("");
  const [importErr, setImportErr] = useState<string | null>(null);
  const w = usePeopleWallet(rpcQuery);
  const mirror = useChainMirror(w.rpc ?? undefined, CROWNED_GENESIS_HASH);
  const [tab, setTab] = useState<Tab>(tabQuery ?? (toQuery ? "send" : "hold"));
  const [name, setName] = useState("you");
  const [pin, setPin] = useState("");
  const [pinConfirm, setPinConfirm] = useState("");
  const [unlockPin, setUnlockPin] = useState("");
  const [toAddr, setToAddr] = useState(toQuery ?? "");
  const [amount, setAmount] = useState("1");
  const [note, setNote] = useState("");
  const [bridgeAsset, setBridgeAsset] = useState<WalletBridgeAsset>("USDC");
  const [bridgeUsd, setBridgeUsd] = useState("5");
  const [lockTxHash, setLockTxHash] = useState("");
  const [ethLockNote, setEthLockNote] = useState("");
  const [installHint, setInstallHint] = useState(false);
  const [showPayQr, setShowPayQr] = useState(false);
  const [showPayMatrix, setShowPayMatrix] = useState(false);
  const [shareNote, setShareNote] = useState("");
  const [scanNote, setScanNote] = useState("");
  const [scanning, setScanning] = useState(false);
  const [scanMode, setScanMode] = useState<"qr" | "matrix" | null>(null);
  const [opticalPresence, setOpticalPresence] = useState(false);
  const [readHeat, setReadHeat] = useState(0);
  const [showBlaze, setShowBlaze] = useState(false);
  const scanVideoRef = useRef<HTMLVideoElement | null>(null);
  const scanStopRef = useRef<(() => void) | null>(null);
  const readerRef = useRef<HTMLDivElement | null>(null);
  const [payReceipt, setPayReceipt] = useState<{
    mark: TipMarkReceipt;
    amount: number;
    to: string;
    theirBalance: number | null;
    myBalance: number | null;
    kindling?: boolean;
  } | null>(null);
  const [sendArmed, setSendArmed] = useState(true);

  useEffect(() => {
    if (toQuery) {
      setToAddr(toQuery);
      setTab("send");
    }
  }, [toQuery]);

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
      scanStopRef.current?.();
      scanStopRef.current = null;
    };
  }, []);

  async function copyPayFace() {
    if (!w.payFace) return;
    try {
      await navigator.clipboard.writeText(w.payFace.address);
      setShareNote("Pay face copied");
    } catch {
      setShareNote("Copy failed — long-press the address");
    }
  }

  async function sharePayFace() {
    if (!w.payFace) return;
    const url = payFaceShareUrl(w.payFace.address);
    try {
      if (navigator.share) {
        await navigator.share({
          title: "Pay me on Pixel",
          text: w.payFace.address,
          url,
        });
        setShareNote("Shared");
      } else {
        await navigator.clipboard.writeText(url);
        setShareNote("Pay link copied");
      }
    } catch (e) {
      if ((e as { name?: string })?.name === "AbortError") return;
      setShareNote("Share failed — try Copy");
    }
  }

  async function pastePayTo() {
    try {
      const text = await navigator.clipboard.readText();
      const addr = extractPayAddress(text);
      if (!addr) {
        setScanNote("Clipboard has no pix1… address");
        return;
      }
      setToAddr(addr);
      setSendArmed(true);
      setPayReceipt(null);
      setOpticalPresence(false);
      setScanNote("Pasted pay face");
    } catch {
      setScanNote("Clipboard blocked — paste into To");
    }
  }

  async function startScan(mode: "qr" | "matrix") {
    setScanNote("");
    setOpticalPresence(false);
    setReadHeat(0);
    setShowBlaze(false);
    if (mode === "qr" && !canScanPayQr()) {
      setScanNote("QR scan needs Chrome — try Scan matrix, Paste, or pay link");
      return;
    }
    if (mode === "matrix" && !canScanPayMatrix()) {
      setScanNote("Camera not available — try Scan QR or Paste");
      return;
    }
    setScanMode(mode);
    setScanning(true);
    await new Promise<void>((r) => requestAnimationFrame(() => r()));
    const el = scanVideoRef.current;
    if (!el) {
      setScanning(false);
      setScanMode(null);
      setScanNote("Camera view failed to open");
      return;
    }
    try {
      scanStopRef.current?.();
      const session = mode === "qr" ? await startPayQrScan(el) : await startPayMatrixScan(el);
      scanStopRef.current = session.stop;
      let frames = 0;
      let heat = 0;
      const tick = async () => {
        if (!scanStopRef.current) return;
        try {
          if (mode === "qr") {
            const addr = await pollPayQrFrame(el);
            if (addr) {
              setToAddr(addr);
              setSendArmed(true);
              setPayReceipt(null);
              setOpticalPresence(false);
              setScanNote("Scanned QR pay face");
              stopScan();
              return;
            }
          } else {
            frames++;
            if (frames > 2) {
              const hit = await pollPayMatrixFrame(el);
              // Climb toward lock; never drop hard — reading should feel like a rising shine.
              heat = Math.min(
                1,
                Math.max(heat * 0.96, hit.score, heat + (hit.score > heat ? 0.04 : 0)),
              );
              setReadHeat(heat);
              if (readerRef.current) {
                readerRef.current.style.setProperty("--kindling-heat", String(heat));
              }
              if (hit.locked) {
                setToAddr(hit.address);
                setSendArmed(true);
                setPayReceipt(null);
                setOpticalPresence(hit.physical);
                setReadHeat(1);
                setShowBlaze(true);
                setScanNote(
                  hit.physical
                    ? "Shine peaked — Kindling locked from light. Send PIX."
                    : "Shine peaked — matrix locked. Send PIX.",
                );
                stopScan({ keepBlaze: true });
                window.setTimeout(() => setShowBlaze(false), 1100);
                return;
              }
              if (frames % 40 === 0 && heat < 0.35) {
                setScanNote("Fill the frame with their bright square — steady");
              } else if (heat >= 0.5) {
                setScanNote("Getting bright — hold steady…");
              } else if (heat >= 0.3) {
                setScanNote("Seeing the face — move closer");
              }
            }
          }
        } catch (e) {
          setScanNote(e instanceof Error ? e.message : "Scan failed");
          stopScan();
          return;
        }
        requestAnimationFrame(() => void tick());
      };
      void tick();
    } catch (e) {
      setScanning(false);
      setScanMode(null);
      setScanNote(e instanceof Error ? e.message : "Camera failed");
    }
  }

  function stopScan(opts?: { keepBlaze?: boolean }) {
    scanStopRef.current?.();
    scanStopRef.current = null;
    setScanning(false);
    setScanMode(null);
    if (!opts?.keepBlaze) {
      setReadHeat(0);
      setShowBlaze(false);
    }
  }

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
        ) : w.storageError ? (
          // Offering "create wallet" here would invite forging a second identity
          // over a first this browser merely failed to read.
          <section className="mt-10 space-y-4 rounded-3xl border border-amber-300/40 bg-amber-300/10 px-5 py-6">
            <p className="font-pixel text-[10px] tracking-[0.2em] text-amber-200 uppercase">
              Could not read this device
            </p>
            <p className="text-sm leading-relaxed text-amber-100/85">
              Your wallet may still be here — the browser could not open its storage, which is not
              the same as having no wallet. Do not create a new one yet: that would be a different
              person with a different address.
            </p>
            <p className="text-xs leading-relaxed text-amber-100/60">{w.storageError}</p>
            <button type="button" className="wallet-cta" onClick={() => window.location.reload()}>
              Try again
            </button>
            <p className="text-xs leading-relaxed text-amber-100/60">
              If it keeps failing, quit the browser completely and reopen it. Avoid clearing site
              data for this site — that would remove the wallet for real.
            </p>
          </section>
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
            <div className="mt-8 space-y-3 rounded-2xl border border-white/10 bg-black/30 px-4 py-4">
              <p className="font-pixel text-[10px] tracking-[0.2em] text-white/45 uppercase">
                Already have a wallet?
              </p>
              <p className="text-xs leading-relaxed text-white/55">
                Creating one here makes a <em>different</em> person with a different address. To use
                the wallet from another device, export it there and paste it here.
              </p>
              <textarea
                value={importText}
                onChange={(e) => setImportText(e.target.value)}
                placeholder="PIXELWALLET1:…"
                rows={3}
                className="w-full rounded-xl border border-white/15 bg-black/50 px-3 py-2 font-mono text-[11px] text-white/80"
              />
              <button
                type="button"
                disabled={w.busy || importText.trim() === ""}
                className="wallet-cta"
                onClick={() => {
                  setImportErr(null);
                  void w
                    .importWallet(importText.trim())
                    .then(() => setImportText(""))
                    .catch((e: unknown) =>
                      setImportErr(e instanceof Error ? e.message : "Import failed"),
                    );
                }}
              >
                Bring my wallet here
              </button>
              {importErr ? <p className="text-xs text-amber-200/85">{importErr}</p> : null}
            </div>
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
                {w.canTransact ? (w.balance === null ? "…" : w.balance) : "—"}
                <span className="ml-2 text-lg font-semibold text-white/45">PIX</span>
              </p>
              {w.tipStatus === "crowned" ? (
                <p className="mt-2 text-xs text-white/45">
                  On tip{typeof w.tipIndex === "number" ? ` #${w.tipIndex}` : ""}
                  {` · Earth ${w.crownedPrefix}…`}
                  {w.tipBridgeLab ? " · bridge open" : ""}
                  {w.tipFaucet ? " · faucet open" : ""}
                </p>
              ) : w.tipStatus === "checking" ? (
                <p className="mt-2 text-xs text-white/45">Reaching the tip…</p>
              ) : (
                // A wallet that cannot confirm the Earth must not look usable.
                // Showing a balance beside "check genesis" invited paying onto a
                // look-alike chain, which is unrecoverable.
                <div className="mt-3 rounded-2xl border border-amber-300/40 bg-amber-300/10 px-4 py-3">
                  <p className="font-pixel text-[10px] tracking-[0.2em] text-amber-200 uppercase">
                    {w.tipStatus === "wrong-earth"
                      ? "Not the crowned Earth"
                      : w.tipStatus === "unreachable"
                        ? "Tip unreachable"
                        : "No tip configured"}
                  </p>
                  <p className="mt-2 text-xs leading-relaxed text-amber-100/80">
                    {w.tipStatus === "wrong-earth"
                      ? `This tip answers, but its genesis is not ${w.crownedPrefix}… — it is a different picture. Paying here cannot be undone, so sending is disabled.`
                      : w.tipStatus === "unreachable"
                        ? "Cannot read the tip right now. Balances and sending stay disabled rather than showing a number that may be wrong."
                        : "No tip — set VITE_PIXEL_RPC or open with ?rpc="}
                  </p>
                </div>
              )}
              <p className="mt-4 break-all font-mono text-[11px] leading-relaxed text-white/55">
                {w.payFace.address}
              </p>
              {exportErr ? <p className="mt-3 text-xs text-amber-200/85">{exportErr}</p> : null}
              {exportText ? (
                <div className="mt-4 space-y-3 rounded-2xl border border-emerald-400/30 bg-emerald-400/5 px-4 py-4">
                  <p className="font-pixel text-[10px] tracking-[0.2em] text-emerald-200/85 uppercase">
                    Your backup
                  </p>
                  <p className="text-sm leading-relaxed text-white/75">
                    Your wallet lives only in this browser. If you lose this phone, or clear its
                    data, it is gone and nobody can bring it back — there is no company holding a
                    copy.
                  </p>
                  <p className="text-sm leading-relaxed text-white/75">
                    The code below is that copy. Email it to yourself, or save it in your notes,
                    then paste it into another phone to open the same wallet there.
                  </p>
                  <p className="text-xs leading-relaxed text-white/55">
                    It is locked with your PIN, so it is useless to anyone who does not know it —
                    and useless to you if you forget it. The PIN is not saved anywhere.
                  </p>
                  <p className="text-xs leading-relaxed text-amber-200/75">
                    Anyone with both this code and your PIN can spend your PIX. Keep them apart — do
                    not put the PIN in the same email or note.
                  </p>
                  <textarea
                    readOnly
                    rows={4}
                    value={exportText}
                    onFocus={(e) => e.currentTarget.select()}
                    className="w-full rounded-xl border border-white/15 bg-black/50 px-3 py-2 font-mono text-[10px] break-all text-white/75"
                  />
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      className="wallet-ghost"
                      onClick={() => void navigator.clipboard?.writeText(exportText)}
                    >
                      Copy
                    </button>
                    <button type="button" className="wallet-ghost" onClick={() => w.exportBackup()}>
                      Save as file
                    </button>
                    <button
                      type="button"
                      className="wallet-ghost"
                      onClick={() => setExportText(null)}
                    >
                      Hide
                    </button>
                  </div>
                  <p className="text-[11px] leading-relaxed text-white/45">
                    A short PIN can be guessed offline by anyone holding this text. Treat it as
                    valuable, and use a PIN you have not used elsewhere.
                  </p>
                </div>
              ) : null}
              <div className="mt-3 flex flex-wrap gap-2">
                <button type="button" className="wallet-chip" onClick={() => void copyPayFace()}>
                  Copy
                </button>
                <button type="button" className="wallet-chip" onClick={() => void sharePayFace()}>
                  Share
                </button>
                <button
                  type="button"
                  className={showPayQr ? "wallet-chip-active" : "wallet-chip"}
                  onClick={() => {
                    setShowPayQr((v) => !v);
                    if (!showPayQr) setShowPayMatrix(false);
                  }}
                >
                  {showPayQr ? "Hide QR" : "Show QR"}
                </button>
                <button
                  type="button"
                  className={showPayMatrix ? "wallet-chip-active" : "wallet-chip"}
                  onClick={() => {
                    setShowPayMatrix((v) => !v);
                    if (!showPayMatrix) setShowPayQr(false);
                  }}
                >
                  {showPayMatrix ? "Hide face" : "Show face"}
                </button>
              </div>
              {shareNote ? (
                <p className="mt-2 text-xs text-emerald-300/90" role="status">
                  {shareNote}
                </p>
              ) : null}

              {/* One volume holds the only copy of this history. This device can
                  hold another, and it does so without being asked. */}
              <div className="mt-4 rounded-2xl border border-white/10 bg-black/25 px-4 py-3">
                {mirror.status === "diverged" ? (
                  <>
                    <p className="font-pixel text-[10px] tracking-[0.2em] text-amber-200 uppercase">
                      This tip does not match your copy
                    </p>
                    <p className="mt-2 text-xs leading-relaxed text-amber-100/80">
                      The history you hold and the one being served disagree. Your copy has not been
                      changed. {mirror.note}
                    </p>
                  </>
                ) : mirror.status === "unavailable" ? (
                  <p className="text-xs leading-relaxed text-white/55">
                    This browser will not let the picture be stored here, so this device is not
                    keeping a copy.
                  </p>
                ) : mirror.state && mirror.state.pixels.length > 0 ? (
                  <>
                    <p className="font-pixel text-[10px] tracking-[0.2em] text-emerald-300/80 uppercase">
                      You hold the picture
                    </p>
                    <p className="mt-2 text-xs leading-relaxed text-white/65">
                      {mirror.state.height + 1} pixels · {Math.round(mirror.state.bytes / 1024)} KB
                      on this device. If every server went away, the record would still exist here.
                    </p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <button type="button" className="wallet-chip" onClick={mirror.download}>
                        Save the picture
                      </button>
                    </div>
                    <p className="mt-2 text-[11px] leading-relaxed text-white/40">
                      Saves one file that draws itself — no server, no internet, opens in any
                      browser.
                    </p>
                  </>
                ) : (
                  <p className="text-xs text-white/45">
                    {mirror.status === "syncing" ? "Taking a copy of the picture…" : "No copy yet."}
                  </p>
                )}
              </div>
              {showPayQr ? (
                <div className="mt-4 flex flex-col items-center gap-2">
                  <PayFaceQr address={w.payFace.address} className="pay-face-qr rounded-lg" />
                  <p className="max-w-[16rem] text-center text-[11px] leading-relaxed text-white/45">
                    Friend scans QR → Send fills in. Vault never in the QR.
                  </p>
                </div>
              ) : null}
              {showPayMatrix ? (
                <PayFaceMatrix
                  address={w.payFace.address}
                  projector
                  onClose={() => setShowPayMatrix(false)}
                />
              ) : null}
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
                  disabled={w.busy || !w.canTransact || w.tipFaucet === false}
                  onClick={() => void w.faucet().catch(() => undefined)}
                  className="wallet-chip-active"
                >
                  Fund tip
                </button>
                <button
                  type="button"
                  disabled={w.busy || !w.canTransact}
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
                        <button
                          type="button"
                          className="wallet-ghost"
                          disabled={w.busy}
                          onClick={() => void w.turnOffDeviceUnlock()}
                        >
                          Turn off Face ID
                        </button>
                      ) : null}
                      <button
                        type="button"
                        className="wallet-ghost"
                        disabled={w.busy || !w.unlocked}
                        onClick={() => {
                          setExportErr(null);
                          void w
                            .exportWallet()
                            .then(setExportText)
                            .catch((e: unknown) =>
                              setExportErr(e instanceof Error ? e.message : "Export failed"),
                            );
                        }}
                      >
                        {w.unlocked ? "Save a backup" : "Unlock to save a backup"}
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
                      if (!sendArmed || w.busy || !w.unlocked) return;
                      const amt = Math.floor(Number(amount) || 0);
                      const to = toAddr.trim().toLowerCase();
                      if (!isPixelAddress(to) || amt < 1) return;
                      setSendArmed(false);
                      void (async () => {
                        try {
                          const mark = await w.pay(to, amt, note || undefined);
                          await w.refresh();
                          const [theirs, mine] = await Promise.all([
                            fetchTipBalance(w.rpc!, to),
                            w.payFace
                              ? fetchTipBalance(w.rpc!, w.payFace.address)
                              : Promise.resolve(null),
                          ]);
                          setPayReceipt({
                            mark,
                            amount: amt,
                            to,
                            theirBalance: theirs?.amount ?? null,
                            myBalance: mine?.amount ?? w.balance,
                            kindling: opticalPresence,
                          });
                        } catch {
                          setSendArmed(true);
                        }
                      })();
                    }}
                  >
                    <p className="text-sm text-white/55">
                      Pay PIX on the shared tip. Unlock with PIN first. Scan their Kindling face or
                      QR — don&apos;t type pix1….
                    </p>
                    <p className="text-xs text-white/40">{payFaceOpticalThesis()}</p>
                    <p className="text-xs text-white/35">{payLinkThesis()}</p>
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        className="wallet-chip-active"
                        disabled={scanning}
                        onClick={() => void startScan("matrix")}
                      >
                        {scanning && scanMode === "matrix" ? "Reading face…" : "Scan matrix"}
                      </button>
                      <button
                        type="button"
                        className="wallet-chip"
                        disabled={scanning}
                        onClick={() => void startScan("qr")}
                      >
                        {scanning && scanMode === "qr" ? "Scanning…" : "Scan QR"}
                      </button>
                      <button
                        type="button"
                        className="wallet-chip"
                        disabled={scanning}
                        onClick={() => void pastePayTo()}
                      >
                        Paste
                      </button>
                      {scanning ? (
                        // `stopScan(opts?: { keepBlaze?: boolean })` — React hands onClick a MouseEvent,
                        // which would arrive as `opts` and be read for `.keepBlaze`. It happens to
                        // be undefined today, so this worked by luck rather than by design.
                        <button type="button" className="wallet-chip" onClick={() => stopScan()}>
                          Stop
                        </button>
                      ) : null}
                    </div>
                    {scanning && scanMode === "matrix" ? (
                      <div
                        ref={readerRef}
                        className="kindling-reader mt-2 w-full max-w-[18rem]"
                        style={{ ["--kindling-heat" as string]: String(readHeat) }}
                      >
                        <video ref={scanVideoRef} muted playsInline autoPlay />
                        <div className="kindling-reader-meter" aria-hidden>
                          <span />
                        </div>
                      </div>
                    ) : null}
                    {scanning && scanMode === "qr" ? (
                      <video
                        ref={scanVideoRef}
                        className="mt-2 aspect-square w-full max-w-[16rem] rounded-lg object-cover"
                        muted
                        playsInline
                        autoPlay
                      />
                    ) : null}
                    {showBlaze ? <div className="kindling-reader-blaze" aria-hidden /> : null}
                    {opticalPresence ? (
                      <p className="text-xs text-emerald-200/90" role="status">
                        Optical presence — matrix from camera. Shine peaked — Send PIX.
                      </p>
                    ) : null}
                    {scanNote ? (
                      <p className="text-xs text-emerald-300/90" role="status">
                        {scanNote}
                      </p>
                    ) : null}
                    <label className="block">
                      <span className="wallet-label">To</span>
                      <input
                        value={toAddr}
                        onChange={(e) => {
                          setToAddr(e.target.value);
                          setSendArmed(true);
                          setPayReceipt(null);
                          setOpticalPresence(false);
                        }}
                        placeholder="pix1… or scan matrix / QR"
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
                        onChange={(e) => {
                          setAmount(e.target.value);
                          setSendArmed(true);
                        }}
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
                    <button
                      type="submit"
                      disabled={w.busy || !w.unlocked || !sendArmed || !w.canTransact}
                      className={
                        opticalPresence && sendArmed && !w.busy
                          ? "wallet-cta kindling-send-hot"
                          : "wallet-cta"
                      }
                    >
                      {!w.canTransact
                        ? w.tipStatus === "wrong-earth"
                          ? "Wrong Earth — sending refused"
                          : "Tip unreachable — sending refused"
                        : !w.unlocked
                          ? "Unlock with PIN to send"
                          : w.busy
                            ? "Sending…"
                            : !sendArmed
                              ? "Sent — change amount to send again"
                              : opticalPresence
                                ? "Send PIX — shine ready"
                                : "Send PIX"}
                    </button>
                    {payReceipt ? (
                      <div
                        className="space-y-2 rounded-2xl border border-emerald-400/30 bg-emerald-400/10 px-4 py-3 text-sm"
                        role="status"
                      >
                        <p className="font-display text-lg font-bold text-emerald-200">
                          Sent {payReceipt.amount} PIX
                        </p>
                        <p className="text-emerald-300/90">
                          {settlementHonesty(payReceipt.mark.attachment)}
                        </p>
                        <p className="font-mono text-[11px] break-all text-white/55">
                          → {payReceipt.to}
                        </p>
                        <p className="text-xs text-white/70">
                          Tip #{payReceipt.mark.tipIndex}
                          {payReceipt.theirBalance !== null
                            ? ` · they now hold ${payReceipt.theirBalance} PIX`
                            : ""}
                          {payReceipt.myBalance !== null
                            ? ` · you hold ${payReceipt.myBalance} PIX`
                            : ""}
                        </p>
                        {payReceipt.kindling ? (
                          <p className="text-xs text-emerald-200/90">
                            Kindling — address from optical matrix (camera)
                          </p>
                        ) : null}
                        <p className="font-mono text-[11px] break-all text-white/40">
                          canvas {formatCanvasId(payReceipt.mark.canvasId)}
                        </p>
                        <button
                          type="button"
                          className="wallet-chip-active"
                          onClick={() => {
                            setPayReceipt(null);
                            setSendArmed(true);
                          }}
                        >
                          Send another
                        </button>
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
