import { createFileRoute, Link } from "@tanstack/react-router";

/**
 * Illuminate every door — purpose, on/for/into, people use, seed ideas.
 * Normative copy: docs/DOORS.md
 */
export const Route = createFileRoute("/doors")({
  head: () => ({
    meta: [
      { title: "PIXEL — doors" },
      {
        name: "description",
        content:
          "How to build on, for, or into Pixel Ledger — and how people use the light-settlement picture.",
      },
      { property: "og:title", content: "PIXEL — doors" },
      {
        property: "og:description",
        content: "Build on · for · into Pixel. Shine existence and value onto one shared picture.",
      },
    ],
  }),
  component: DoorsPage,
});

const BUILDER_DOORS = [
  {
    id: "on",
    label: "On",
    title: "Build on Pixel",
    line: "Apps, Kindling, Worldlight, Lumen — settlement without rewriting the world.",
    href: "/lab" as const,
    cta: "Open lab",
  },
  {
    id: "for",
    label: "For",
    title: "Build for Pixel",
    line: "Nodes, PoLS, PQ crypto, PATH gates — make the network real.",
    href: "/lab" as const,
    cta: "Protocol lab",
    external: "https://github.com/MCFLAMINGO/pixel-chain-story/blob/main/docs/PATH.md",
  },
  {
    id: "into",
    label: "Into",
    title: "Shine into Pixel",
    line: "Keep your site or app. Register the digest. No second Facebook.",
    href: "/shine" as const,
    cta: "Shine in",
  },
] as const;

const PEOPLE_DOORS = [
  {
    title: "Hold a wallet",
    line: "Personal Source on your device — pay face only, no CLI init.",
    to: "/wallet" as const,
    cta: "Wallet",
  },
  {
    title: "See the picture",
    line: "Live field — public tip when rpc is set; else honest lab light.",
    to: "/" as const,
    cta: "Live field",
  },
  {
    title: "Shine a brand in",
    line: "Continuity map — reachable when the host blinks.",
    to: "/shine" as const,
    cta: "Shine in",
  },
  {
    title: "Pay with Pixel",
    line: "Booth settlement when Continuity is live (lab).",
    to: "/continuity" as const,
    cta: "Continuity desk",
  },
  {
    title: "Kindle & world lock",
    line: "Presence spend and shine-in rails in the lab.",
    to: "/lab" as const,
    cta: "Lab",
  },
] as const;

const SEEDS = [
  "Continuity for any origin — clinic, village site, menu — mirrors when host blinks.",
  "Booth till — origin dark, Pay with Pixel still settles.",
  "Presence spend — two lights meet; SMS never spends.",
  "Agnostic shine-in — world locks in; Pixel stays the settlement picture.",
  "Agents shine in — MCP and tools as LightArtifacts; no rewrite VM.",
  "Energy Truth — labeled cost of illumination vs datacenter thirst.",
  "Field custody — tip bound to the scene, not a lonely hash.",
  "Lumen — light programs that move real UTXOs.",
] as const;

function DoorsPage() {
  return (
    <main className="doors-page min-h-screen text-foreground">
      <section className="doors-hero relative flex min-h-[100svh] flex-col justify-end overflow-hidden px-6 pb-16 pt-24 md:px-14 md:pb-24">
        <div className="doors-hero-glow pointer-events-none absolute inset-0" aria-hidden />
        <div className="relative z-10 max-w-3xl">
          <p className="font-pixel text-xs font-semibold tracking-[0.4em] text-primary uppercase">
            PIXEL
          </p>
          <h1 className="font-pixel mt-4 text-[clamp(2.75rem,10vw,5.5rem)] leading-[0.95] font-extrabold tracking-tight">
            Doors
          </h1>
          <p className="mt-6 max-w-lg text-lg leading-relaxed text-foreground/85 md:text-xl">
            Light-settlement picture. Build on, for, or into Pixel — or shine what you already are
            onto the field.
          </p>
          <div className="mt-10 flex flex-wrap items-center gap-6">
            <a
              href="#on"
              className="font-pixel text-sm tracking-[0.2em] text-primary uppercase underline decoration-primary/50 underline-offset-8"
            >
              Pick a door
            </a>
            <Link
              to="/"
              className="font-pixel text-sm tracking-[0.2em] text-muted-foreground uppercase underline-offset-8 hover:text-foreground hover:underline"
            >
              Live field
            </Link>
          </div>
        </div>
      </section>

      <section className="doors-purpose border-t border-primary/15 px-6 py-20 md:px-14">
        <p className="font-pixel text-xs tracking-[0.28em] text-primary uppercase">Purpose</p>
        <h2 className="font-pixel mt-4 max-w-2xl text-3xl font-bold tracking-tight md:text-4xl">
          Shine existence and value onto one shared picture.
        </h2>
        <p className="mt-5 max-w-xl text-muted-foreground">
          Scarce PIX. Proof of Light Sequence. Color absent without light. Not hosting, not cards,
          not a second you — settlement and continuity under verification.
        </p>
      </section>

      <section
        className="border-t border-primary/15 px-6 py-20 md:px-14"
        aria-labelledby="north-star"
      >
        <p className="font-pixel text-xs tracking-[0.28em] text-primary uppercase">North star</p>
        <h2
          id="north-star"
          className="font-pixel mt-4 max-w-2xl text-3xl font-bold tracking-tight md:text-4xl"
        >
          Light signatures in a dark universe.
        </h2>
        <p className="mt-5 max-w-xl text-lg leading-relaxed text-foreground/90">
          Build to meet the claim. Think big. Solve big problems. Make Pixel a world-class model for
          a future species — then prove each step with a PATH gate.
        </p>
        <p className="mt-4 max-w-xl text-muted-foreground">
          Dream names the destination. Evidence earns the public sentence. We do not overclaim — and
          we do not shrink the dream to fit yesterday’s CI.
        </p>
      </section>

      <section className="border-t border-primary/15 px-6 py-20 md:px-14" aria-labelledby="invite">
        <p className="font-pixel text-xs tracking-[0.28em] text-primary uppercase">Invite</p>
        <h2
          id="invite"
          className="font-pixel mt-4 max-w-2xl text-3xl font-bold tracking-tight md:text-4xl"
        >
          Direct the light
        </h2>
        <p className="mt-5 max-w-xl text-muted-foreground">
          Help us build — or bring a tangential mind. Optics, villages, agents, art, energy,
          markets: aim the future. You do not need permission to think.
        </p>
        <ul className="mt-10 max-w-xl space-y-6">
          <li>
            <p className="font-pixel text-sm tracking-[0.18em] text-primary uppercase">
              Build with us
            </p>
            <p className="mt-2 text-muted-foreground">
              Pick on / for / into. Land tests. Raise a gate.
            </p>
          </li>
          <li>
            <p className="font-pixel text-sm tracking-[0.18em] text-primary uppercase">
              Aim your own light
            </p>
            <p className="mt-2 text-muted-foreground">
              Seed an idea we have not named. Prototype. Issue. Pull the camera back with us.
            </p>
          </li>
        </ul>
      </section>

      <section
        className="border-t border-primary/15 px-6 py-20 md:px-14"
        aria-labelledby="builder-doors"
      >
        <p className="font-pixel text-xs tracking-[0.28em] text-primary uppercase">Builder doors</p>
        <h2
          id="builder-doors"
          className="font-pixel mt-4 text-3xl font-bold tracking-tight md:text-4xl"
        >
          On · For · Into
        </h2>
        <p className="mt-4 max-w-xl text-muted-foreground">Same ledger. Three ways in.</p>
        <ul className="mt-14 space-y-16">
          {BUILDER_DOORS.map((d) => (
            <li key={d.id} id={d.id} className="doors-door max-w-2xl">
              <p className="font-pixel text-xs tracking-[0.32em] text-primary uppercase">
                {d.label}
              </p>
              <h3 className="font-pixel mt-3 text-2xl font-bold md:text-3xl">{d.title}</h3>
              <p className="mt-3 text-muted-foreground">{d.line}</p>
              <div className="mt-6 flex flex-wrap gap-5">
                <Link
                  to={d.href}
                  className="font-pixel text-sm tracking-[0.18em] text-primary uppercase underline decoration-primary/40 underline-offset-6"
                >
                  {d.cta} →
                </Link>
                {"external" in d && d.external ? (
                  <a
                    href={d.external}
                    className="font-pixel text-sm tracking-[0.18em] text-muted-foreground uppercase underline-offset-6 hover:underline"
                    rel="noreferrer"
                    target="_blank"
                  >
                    PATH docs
                  </a>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      </section>

      <section
        className="border-t border-primary/15 px-6 py-20 md:px-14"
        aria-labelledby="people-doors"
      >
        <p className="font-pixel text-xs tracking-[0.28em] text-primary uppercase">People doors</p>
        <h2
          id="people-doors"
          className="font-pixel mt-4 text-3xl font-bold tracking-tight md:text-4xl"
        >
          Use the picture
        </h2>
        <ul className="mt-14 grid gap-12 md:grid-cols-2">
          {PEOPLE_DOORS.map((d) => (
            <li key={d.title} className="max-w-md">
              <h3 className="font-pixel text-xl font-bold">{d.title}</h3>
              <p className="mt-2 text-sm text-muted-foreground">{d.line}</p>
              <Link
                to={d.to}
                className="font-pixel mt-4 inline-block text-xs tracking-[0.2em] text-primary uppercase underline decoration-primary/40 underline-offset-6"
              >
                {d.cta} →
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <section className="border-t border-primary/15 px-6 py-20 md:px-14" aria-labelledby="seeds">
        <p className="font-pixel text-xs tracking-[0.28em] text-primary uppercase">Seed the mind</p>
        <h2
          id="seeds"
          className="font-pixel mt-4 max-w-2xl text-3xl font-bold tracking-tight md:text-4xl"
        >
          Where Pixel can be advantageous
        </h2>
        <p className="mt-4 max-w-xl text-muted-foreground">
          Directions to invent and prove — not claims until a PATH gate is green.
        </p>
        <ol className="mt-12 max-w-2xl list-decimal space-y-5 pl-5 text-foreground/90">
          {SEEDS.map((s) => (
            <li key={s} className="pl-2 leading-relaxed">
              {s}
            </li>
          ))}
        </ol>
        <p className="mt-12 max-w-xl text-sm text-muted-foreground">
          We do not claim AWS-proof hosting, flashlight cryptography, screenshot custody, or a live
          production bridge without evidence.
        </p>
      </section>

      <footer className="border-t border-primary/15 px-6 py-14 md:px-14">
        <p className="font-pixel text-xs tracking-[0.28em] text-primary uppercase">Start</p>
        <p className="mt-4 max-w-xl text-muted-foreground">
          <code className="text-foreground/90">bun install && bun run test:all</code> — then pick a
          door. Full map in{" "}
          <a
            href="https://github.com/MCFLAMINGO/pixel-chain-story/blob/main/docs/DOORS.md"
            className="text-primary underline-offset-4 hover:underline"
            rel="noreferrer"
            target="_blank"
          >
            docs/DOORS.md
          </a>
          .
        </p>
        <div className="mt-8 flex flex-wrap gap-6">
          <Link
            to="/shine"
            className="font-pixel text-sm tracking-[0.2em] text-primary uppercase underline decoration-primary/40 underline-offset-6"
          >
            Shine in
          </Link>
          <Link
            to="/lab"
            className="font-pixel text-sm tracking-[0.2em] text-primary uppercase underline decoration-primary/40 underline-offset-6"
          >
            Lab
          </Link>
          <Link
            to="/"
            className="font-pixel text-sm tracking-[0.2em] text-muted-foreground uppercase underline-offset-6 hover:underline"
          >
            Field
          </Link>
        </div>
      </footer>
    </main>
  );
}
