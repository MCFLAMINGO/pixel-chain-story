/**
 * What the running bundle can actually do, stated by the bundle itself.
 *
 * "Is the deploy current?" has come up repeatedly and has been answered by guessing every
 * time — greping minified bundles for strings that minification had already mangled, and
 * reading class names out of HTML. The deployed asset filenames carry content hashes, so it
 * is possible to tell *that* a build changed, and impossible to tell *what is in it*.
 *
 * A commit SHA would need build-tooling cooperation and would still only be a label. What
 * actually matters is narrower and more useful: **can the people using this bundle export
 * their wallets, and does the field poll incrementally?** So this reports capabilities, and
 * derives each one by touching the real thing rather than by asserting a constant.
 *
 * That last part is the point. A hand-maintained version string drifts, and a drifted
 * version string is worse than none because it is believed. Every flag here is computed from
 * a symbol actually being present and callable, so it cannot claim a capability the bundle
 * does not have.
 */

import { PUBLIC_TIP_RPC_DEFAULT } from "./crowned-genesis";

export interface BuildCapabilities {
  /** Wallets can be exported and re-imported — the recovery path. */
  walletExport: boolean;
  /** The field fetches only new pixels (`?since=N`) instead of all of history. */
  incrementalPixels: boolean;
  /** Wallets keep a local copy of the chain. */
  chainMirror: boolean;
  /** The picture twinkles from the tip's wave. */
  fireflies: boolean;
  /** The gift/record rules exist in the bundle (enforcement is a separate policy flag). */
  giftAndRecord: boolean;
  /** Which tip this bundle points at when nothing overrides it. */
  defaultTip: string;
}

/**
 * Compute what this bundle can do.
 *
 * Async because the checks are real imports. Failures are caught per-capability, so one
 * missing module reports one false flag instead of an exception that reports nothing.
 */
export async function buildCapabilities(): Promise<BuildCapabilities> {
  const has = async (probe: () => Promise<boolean>): Promise<boolean> => {
    try {
      return await probe();
    } catch {
      return false;
    }
  };

  return {
    walletExport: await has(async () => {
      const m = await import("./people-wallet");
      return (
        typeof m.exportPeopleWallet === "function" && typeof m.importPeopleWallet === "function"
      );
    }),
    incrementalPixels: await has(async () => {
      const m = await import("./chain-mirror");
      return typeof m.syncMirror === "function";
    }),
    chainMirror: await has(async () => {
      const m = await import("./chain-mirror");
      return typeof m.exportMirrorHtml === "function";
    }),
    fireflies: await has(async () => {
      const m = await import("./firefly");
      return (
        typeof m.twinkleAmplitude === "function" && typeof m.waveAmplitudeByCell === "function"
      );
    }),
    giftAndRecord: await has(async () => {
      const m = await import("./gift-and-record");
      return typeof m.giftMintsBack === "function" && typeof m.assertMomentAllowed === "function";
    }),
    defaultTip: PUBLIC_TIP_RPC_DEFAULT,
  };
}

/** One short line for a `<meta>` tag, so `curl | grep` answers the question. */
export function buildMarker(caps: BuildCapabilities): string {
  const flags: Array<[string, boolean]> = [
    ["walletExport", caps.walletExport],
    ["incrementalPixels", caps.incrementalPixels],
    ["chainMirror", caps.chainMirror],
    ["fireflies", caps.fireflies],
    ["giftAndRecord", caps.giftAndRecord],
  ];
  const on = flags.filter(([, v]) => v).map(([k]) => k);
  const off = flags.filter(([, v]) => !v).map(([k]) => k);
  return `has=${on.join(",") || "none"} missing=${off.join(",") || "none"} tip=${caps.defaultTip}`;
}

export function buildMarkerThesis(): Record<string, string> {
  return {
    problem:
      "'Is the deploy current?' kept being answered by guessing — greping minified bundles " +
      "for strings minification had mangled. Asset hashes reveal that a build changed, never " +
      "what is in it.",
    capabilitiesNotVersions:
      "A SHA is a label. The useful question is narrower: can these people export their " +
      "wallets, does the field poll incrementally. So this reports capabilities.",
    cannotLie:
      "Every flag is computed by importing the real symbol, not by asserting a constant. A " +
      "hand-maintained version string drifts, and a drifted one is worse than none because " +
      "it gets believed.",
  };
}
