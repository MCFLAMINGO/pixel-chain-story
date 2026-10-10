import { createFileRoute, Link } from "@tanstack/react-router";
import { CROWNED_GENESIS_PREFIX, CROWNED_NETWORK_ID } from "@/lib/pixel/crowned-genesis";

/**
 * Ask helpers to hold a verifying copy of the one crowned tip.
 * Not a wallet. Not tip:host. Not a new Earth.
 */
export const Route = createFileRoute("/mirror")({
  head: () => ({
    meta: [
      { title: "PIXEL — hold the one tip" },
      {
        name: "description",
        content:
          "Download a verifying mirror pack for the crowned Earth only (network 20553, genesis f1d193…). Not a wallet. Not a new chain.",
      },
    ],
  }),
  component: MirrorHostPage,
});

function MirrorHostPage() {
  return (
    <main className="continuity-desk shine-in-page min-h-screen text-foreground">
      <div className="continuity-glow" aria-hidden />
      <div className="relative mx-auto flex min-h-screen max-w-xl flex-col justify-center px-6 py-16">
        <p
          className="font-pixel shine-fade text-xs tracking-[0.32em] text-primary uppercase"
          style={{ animationDelay: "0ms" }}
        >
          Pixel · one Earth
        </p>
        <p className="shine-fade mt-3" style={{ animationDelay: "40ms" }}>
          <Link
            to="/doors"
            className="font-pixel text-[11px] tracking-[0.24em] text-muted-foreground uppercase underline-offset-4 hover:text-primary hover:underline"
          >
            All doors
          </Link>
        </p>

        <h1
          className="font-pixel shine-fade mt-5 text-5xl font-bold tracking-tight md:text-6xl"
          style={{ animationDelay: "80ms" }}
        >
          Hold the tip
        </h1>
        <p
          className="shine-fade mt-4 text-lg text-muted-foreground"
          style={{ animationDelay: "140ms" }}
        >
          Help keep the crowned picture reachable. Download the pack, open it, run the starter — you
          join <em>this</em> Earth only.
        </p>

        <div
          className="shine-fade mt-8 border-l-2 border-primary/70 bg-primary/5 px-4 py-3 font-mono text-sm leading-relaxed"
          style={{ animationDelay: "200ms" }}
        >
          Confirm out loud:
          <br />
          network <span className="text-foreground">{CROWNED_NETWORK_ID}</span>
          {" · "}
          genesis <span className="text-foreground">{CROWNED_GENESIS_PREFIX}…</span>
        </div>

        <div className="shine-fade mt-10 flex flex-wrap gap-3" style={{ animationDelay: "260ms" }}>
          <a className="continuity-btn" href="/mirror-host.zip" download>
            Download pack
          </a>
          <a className="continuity-btn-ghost" href="/mirror-host/OPEN-ME.html">
            Open guide
          </a>
        </div>

        <p
          className="shine-fade mt-10 text-sm leading-relaxed text-muted-foreground"
          style={{ animationDelay: "320ms" }}
        >
          Verifying mirror only — not a wallet (<Link to="/wallet">/wallet</Link>), not a sequencer
          invite, not <code className="text-foreground">pixel init</code>, not a new Earth. Leave
          the machine awake; put HTTPS in front; send your{" "}
          <code className="text-foreground">/health</code> URL to be listed.
        </p>
      </div>
    </main>
  );
}
