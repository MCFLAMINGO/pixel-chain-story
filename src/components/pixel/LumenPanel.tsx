import { useState } from "react";
import type { LightKeypair, PixelChainState } from "@/lib/pixel";
import { createHost, runLumenSource } from "@/lumen";
import { useLumenModules } from "@/hooks/use-lumen-modules";

/** Edit & run Lumen rays against live chain state — invention surface, not a toy. */
export function LumenPanel({
  chain,
  alice,
  bob,
  onChain,
}: {
  chain: PixelChainState | null;
  alice: (LightKeypair & { label: string }) | null;
  bob: (LightKeypair & { label: string }) | null;
  onChain: (next: PixelChainState, note?: string) => void | Promise<void>;
}) {
  const modules = useLumenModules();
  const [ray, setRay] = useState("send");
  const [log, setLog] = useState("");
  const [busy, setBusy] = useState(false);

  const run = async () => {
    if (!chain || !alice || !bob) return;
    setBusy(true);
    try {
      modules.persistNow();
      const host = createHost(chain, { alice, bob }, alice, { bridgeVault: alice });
      const payArgs = {
        from: { kind: "string" as const, value: "alice" },
        to: { kind: "string" as const, value: "bob" },
        amount: { kind: "number" as const, value: 1 },
        memo: { kind: "string" as const, value: "lumen lab" },
      };
      const args =
        ray === "send" || ray === "kindle" || ray === "funded_kindle" || ray === "pay_composed"
          ? payArgs
          : ray === "shine_in"
            ? {
                owner: { kind: "string" as const, value: "bob" },
                usd: { kind: "number" as const, value: 3 },
              }
            : ray === "holdings"
              ? { who: { kind: "string" as const, value: "alice" } }
              : ray === "tip_sense" || ray === "tip_wave"
                ? {}
                : ray === "exist"
                  ? {
                      what: {
                        kind: "string" as const,
                        value: `creation:${alice.address.slice(0, 20)}`,
                      },
                    }
                  : { secret: { kind: "string" as const, value: alice.seed.slice(0, 64) } };
      const result = await runLumenSource(modules.source, ray, args as never, host);
      await onChain(result.host.chain, `Lumen ray \`${ray}\` settled`);
      setLog([...result.logs, `result: ${JSON.stringify(result.value)}`].join("\n"));
    } catch (e) {
      setLog(e instanceof Error ? e.message : "lumen failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section id="lumen" className="pixel-rise">
      <p className="font-pixel text-xs font-semibold tracking-[0.28em] text-primary uppercase">
        Lumen DSL
      </p>
      <h2 className="font-pixel mt-3 text-3xl font-bold tracking-tight md:text-4xl">
        Guided by light it never names
      </h2>
      <p className="mt-3 max-w-2xl text-muted-foreground">
        Typed rays + modules persisted beside chain state.{" "}
        <code className="text-foreground/80">ensure</code> /{" "}
        <code className="text-foreground/80">match</code> /{" "}
        <code className="text-foreground/80">when aperture</code> stay host-bound — not costume.
      </p>

      <div className="mt-6 flex flex-wrap gap-3">
        <label className="text-sm text-muted-foreground">
          Ray{" "}
          <select
            value={ray}
            onChange={(e) => setRay(e.target.value)}
            className="ml-2 border-b border-border bg-transparent py-1 outline-none"
          >
            <option value="send">send</option>
            <option value="funded_kindle">funded_kindle</option>
            <option value="pay_composed">pay_composed</option>
            <option value="kindle">kindle</option>
            <option value="shine_in">shine_in</option>
            <option value="tip_sense">tip_sense</option>
            <option value="tip_wave">tip_wave</option>
            <option value="holdings">holdings</option>
            <option value="exist">exist</option>
            <option value="read_key">read_key</option>
            <option value="open_key">open_key</option>
          </select>
        </label>
        <button
          type="button"
          disabled={busy || !chain}
          onClick={() => void run()}
          className="font-pixel rounded-md bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground disabled:opacity-45"
        >
          Run ray
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => modules.persistNow()}
          className="font-pixel rounded-md border border-border px-4 py-2 text-xs font-semibold disabled:opacity-45"
        >
          Persist module
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => modules.reset()}
          className="font-pixel rounded-md border border-border px-4 py-2 text-xs font-semibold disabled:opacity-45"
        >
          Reset
        </button>
      </div>

      <textarea
        value={modules.source}
        onChange={(e) => modules.setSource(e.target.value)}
        spellCheck={false}
        className="mt-4 h-56 w-full max-w-3xl resize-y rounded-md border border-border bg-background/50 p-3 font-mono text-xs leading-relaxed outline-none focus:border-primary"
      />
      {modules.typeErrors.length > 0 && (
        <pre className="mt-2 max-w-3xl whitespace-pre-wrap text-xs text-destructive">
          {modules.typeErrors.join("\n")}
        </pre>
      )}
      {log && (
        <pre className="mt-4 max-w-3xl overflow-x-auto whitespace-pre-wrap text-xs text-muted-foreground">
          {log}
        </pre>
      )}
    </section>
  );
}
