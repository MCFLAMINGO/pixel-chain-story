import { useMemo, useState } from "react";
import {
  balanceOf,
  handlePixelRpc,
  runPixelBenchmarks,
  type BenchRow,
  type PixelChainState,
} from "@/lib/pixel";
import { TRANSFER_LUMEN, createHost, runLumenSource } from "@/lumen";
import type { LightKeypair } from "@/lib/pixel";

export function ExecutionConsole({
  chain,
  setChain,
  alice,
  bob,
}: {
  chain: PixelChainState;
  setChain: (c: PixelChainState) => void;
  alice: LightKeypair;
  bob: LightKeypair;
}) {
  const [source, setSource] = useState(TRANSFER_LUMEN);
  const [logs, setLogs] = useState<string[]>([]);
  const [rpcOut, setRpcOut] = useState<string>("// run a method →");
  const [busy, setBusy] = useState(false);
  const [benches, setBenches] = useState<BenchRow[] | null>(null);
  const [diff, setDiff] = useState<string | null>(null);

  const ctx = useMemo(
    () => ({
      chain,
      networkId: 0x5049,
      clientVersion: "Pixel/0.1.0-lumen",
    }),
    [chain],
  );

  const runLumen = async () => {
    setBusy(true);
    try {
      const host = createHost(chain, { alice, bob });
      const before = {
        alice: balanceOf(host.chain, alice.address),
        bob: balanceOf(host.chain, bob.address),
      };
      const result = await runLumenSource(
        source,
        "send",
        {
          from: { kind: "string", value: "alice" },
          to: { kind: "string", value: "bob" },
          amount: { kind: "number", value: 420 },
          memo: { kind: "string", value: "Executable settlement for ETH reviewers" },
        },
        host,
      );
      setChain(result.host.chain);
      setLogs(result.logs);
      const after = {
        alice: balanceOf(result.host.chain, alice.address),
        bob: balanceOf(result.host.chain, bob.address),
      };
      setDiff(
        `Alice ${before.alice} → ${after.alice} (−${before.alice - after.alice})\n` +
          `Bob   ${before.bob} → ${after.bob} (+${after.bob - before.bob})\n` +
          `return ${JSON.stringify(result.value)}`,
      );
    } catch (err) {
      setLogs([err instanceof Error ? err.message : "Lumen execution reverted"]);
      setDiff(null);
    } finally {
      setBusy(false);
    }
  };

  const callRpc = async (method: string, params: unknown[] = []) => {
    setBusy(true);
    try {
      const res = await handlePixelRpc(ctx, {
        jsonrpc: "2.0",
        id: Date.now(),
        method,
        params,
      });
      setRpcOut(JSON.stringify(res, null, 2));
    } finally {
      setBusy(false);
    }
  };

  const runBench = async () => {
    setBusy(true);
    try {
      setBenches(await runPixelBenchmarks());
    } finally {
      setBusy(false);
    }
  };

  return (
    <section id="console" className="pixel-rise">
      <p className="font-pixel text-xs font-semibold tracking-[0.28em] text-primary uppercase">
        Execution layer
      </p>
      <h2 className="font-pixel mt-3 text-3xl font-bold tracking-tight md:text-4xl">
        Run it. Measure it. Verify it.
      </h2>
      <p className="mt-3 max-w-2xl text-muted-foreground">
        Lumen programs compile to real UTXO state transitions. JSON-RPC mirrors the mental model
        Ethereum tooling already uses. Benchmarks are timed in this browser — not marketing copy.
      </p>

      <div className="mt-10 grid gap-8 lg:grid-cols-2">
        <div>
          <div className="mb-2 flex items-center justify-between gap-3">
            <h3 className="font-pixel text-sm font-semibold tracking-wide">Lumen source</h3>
            <button
              type="button"
              disabled={busy}
              onClick={runLumen}
              className="font-pixel rounded-md bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground disabled:opacity-45"
            >
              Execute send(420)
            </button>
          </div>
          <textarea
            value={source}
            onChange={(e) => setSource(e.target.value)}
            spellCheck={false}
            className="h-72 w-full resize-y border border-border bg-[oklch(0.18_0.03_145)] p-4 font-mono text-xs leading-relaxed text-[oklch(0.92_0.02_95)] outline-none focus:ring-2 focus:ring-primary"
          />
          {diff && (
            <pre className="mt-3 whitespace-pre-wrap border border-border bg-background/70 p-3 font-mono text-xs text-foreground">
              {diff}
            </pre>
          )}
          {logs.length > 0 && (
            <ul className="mt-3 space-y-1 font-mono text-[11px] text-muted-foreground">
              {logs.map((l, i) => (
                <li key={i}>› {l}</li>
              ))}
            </ul>
          )}
        </div>

        <div>
          <h3 className="font-pixel mb-2 text-sm font-semibold tracking-wide">JSON-RPC</h3>
          <div className="flex flex-wrap gap-2">
            {[
              "pix_protocolInfo",
              "pix_verifyChain",
              "pix_getEnergyProfile",
              "pix_blockNumber",
              "pix_getLedgerPixels",
            ].map((m) => (
              <button
                key={m}
                type="button"
                disabled={busy}
                onClick={() => callRpc(m)}
                className="font-mono rounded-md border border-border bg-background/60 px-2.5 py-1.5 text-[11px] hover:bg-accent disabled:opacity-45"
              >
                {m}
              </button>
            ))}
            <button
              type="button"
              disabled={busy}
              onClick={() => callRpc("pix_getBalance", [bob.address])}
              className="font-mono rounded-md border border-border bg-background/60 px-2.5 py-1.5 text-[11px] hover:bg-accent disabled:opacity-45"
            >
              pix_getBalance(bob)
            </button>
          </div>
          <pre className="mt-3 max-h-72 overflow-auto border border-border bg-[oklch(0.18_0.03_145)] p-4 font-mono text-[11px] leading-relaxed text-[oklch(0.92_0.02_95)]">
            {rpcOut}
          </pre>

          <div className="mt-6 flex items-center justify-between">
            <h3 className="font-pixel text-sm font-semibold tracking-wide">Benchmarks</h3>
            <button
              type="button"
              disabled={busy}
              onClick={runBench}
              className="font-pixel rounded-md border border-primary/40 bg-accent px-4 py-2 text-xs font-semibold disabled:opacity-45"
            >
              Run suite
            </button>
          </div>
          {benches && (
            <div className="mt-3 overflow-x-auto border border-border">
              <table className="w-full text-left font-mono text-[11px]">
                <thead className="bg-secondary/80 text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2">op</th>
                    <th className="px-3 py-2">avg ms</th>
                    <th className="px-3 py-2">p95 ms</th>
                  </tr>
                </thead>
                <tbody>
                  {benches.map((row) => (
                    <tr key={row.op} className="border-t border-border/70">
                      <td className="px-3 py-2">{row.op}</td>
                      <td className="px-3 py-2">{row.avgMs}</td>
                      <td className="px-3 py-2">{row.p95Ms}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
