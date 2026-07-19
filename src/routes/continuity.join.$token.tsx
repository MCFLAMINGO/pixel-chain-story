import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useContinuityOps } from "@/hooks/use-continuity-ops";
import {
  digestArtifactFile,
  digestArtifactText,
  merchantJoin,
  storeByInvite,
  type Hex,
} from "@/lib/pixel";

export const Route = createFileRoute("/continuity/join/$token")({
  head: () => ({
    meta: [
      { title: "Join Continuity — PIXEL" },
      {
        name: "description",
        content: "Secure invite: confirm your store origin and artifact digest.",
      },
    ],
  }),
  component: MerchantJoin,
});

function MerchantJoin() {
  const { token } = Route.useParams();
  const { state, setState, ready } = useContinuityOps();
  const store = useMemo(() => storeByInvite(state, token), [state, token]);
  const [originUrl, setOriginUrl] = useState("");
  const [paste, setPaste] = useState("");
  const [digest, setDigest] = useState("");
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
        <h1 className="font-pixel relative text-3xl font-bold">Invite not found</h1>
        <p className="relative mt-3 max-w-md text-center text-sm text-muted-foreground">
          This secure link is unknown on this browser. The operator must create the offer on the
          same device/profile, or sync ops state later.
        </p>
        <Link to="/continuity" className="continuity-btn relative mt-8">
          Operator desk
        </Link>
      </main>
    );
  }

  async function onFile(file: File | null) {
    if (!file) return;
    setBusy(true);
    setErr("");
    try {
      const d = await digestArtifactFile(file);
      setDigest(d);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Digest failed");
    } finally {
      setBusy(false);
    }
  }

  async function onDigestPaste() {
    if (!paste.trim()) return;
    setBusy(true);
    try {
      setDigest(await digestArtifactText(paste));
    } finally {
      setBusy(false);
    }
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErr("");
    if (!digest || digest.length !== 128) {
      setErr("Need a 128-hex sha512 digest (upload snapshot or paste HTML).");
      return;
    }
    try {
      setState(
        merchantJoin(state, token, {
          originUrl: originUrl || store!.originUrl,
          digest: digest as Hex,
        }),
      );
      setDone(true);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Join failed");
    }
  }

  return (
    <main className="continuity-desk min-h-screen text-foreground">
      <div className="continuity-glow" aria-hidden />
      <div className="relative mx-auto max-w-lg px-6 pt-16 pb-24">
        <p className="font-pixel text-xs tracking-[0.28em] text-primary uppercase">
          Secure continuity invite
        </p>
        <h1 className="font-pixel mt-3 text-4xl font-bold tracking-tight">{store.name}</h1>
        <p className="mt-3 text-sm text-muted-foreground">
          {store.domain} · ${store.priceUsdPerMonth}/mo. Confirm your origin booth and the digest of
          the storefront snapshot. Same room — spare doors when the main cloud blinks.
        </p>

        {done ||
        store.step === "merchant_joined" ||
        store.step === "rungs_assigned" ||
        store.step === "live" ? (
          <div className="mt-10">
            <p className="font-pixel text-lg text-primary">You’re on the ladder.</p>
            <p className="mt-2 text-sm text-muted-foreground">
              Operator will assign mirror rungs and mark you live. Keep a copy of your snapshot;
              they’ll sync it to the booths.
            </p>
            {store.digest && (
              <p className="mt-4 font-mono text-[11px] break-all text-muted-foreground">
                {store.digest}
              </p>
            )}
          </div>
        ) : (
          <form onSubmit={onSubmit} className="mt-10 space-y-5">
            <label className="block">
              <span className="font-pixel text-[11px] tracking-[0.18em] text-muted-foreground uppercase">
                Origin URL
              </span>
              <input
                className="continuity-input mt-1.5"
                value={originUrl}
                onChange={(e) => setOriginUrl(e.target.value)}
                placeholder={store.originUrl}
              />
            </label>

            <label className="block">
              <span className="font-pixel text-[11px] tracking-[0.18em] text-muted-foreground uppercase">
                Upload storefront snapshot (HTML/zip)
              </span>
              <input
                type="file"
                className="mt-1.5 block w-full text-sm"
                onChange={(e) => void onFile(e.target.files?.[0] ?? null)}
              />
            </label>

            <label className="block">
              <span className="font-pixel text-[11px] tracking-[0.18em] text-muted-foreground uppercase">
                Or paste homepage HTML to digest
              </span>
              <textarea
                className="continuity-input mt-1.5 min-h-[6rem] font-mono text-xs"
                value={paste}
                onChange={(e) => setPaste(e.target.value)}
                placeholder="<!doctype html>…"
              />
              <button
                type="button"
                className="continuity-btn-ghost mt-2"
                disabled={busy || !paste.trim()}
                onClick={() => void onDigestPaste()}
              >
                Compute digest
              </button>
            </label>

            {digest && (
              <p className="font-mono text-[11px] break-all text-muted-foreground">
                digest {digest}
              </p>
            )}

            {err && <p className="text-sm text-destructive">{err}</p>}

            <button type="submit" className="continuity-btn w-full" disabled={busy}>
              Confirm & join continuity
            </button>
          </form>
        )}
      </div>
    </main>
  );
}
