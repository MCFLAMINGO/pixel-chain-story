/**
 * Adversarial suite harness — Gate I.
 *
 * Inverted assertions: a scenario passes only when the attack is REJECTED.
 * `exploited()` marks the attack as having completed, which fails the suite.
 */

export class ExploitSucceeded extends Error {
  constructor(detail: string) {
    super(detail);
    this.name = "ExploitSucceeded";
  }
}

/** Call when an attack completed — the defence is missing. */
export function exploited(detail: string): never {
  throw new ExploitSucceeded(detail);
}

type Result = { id: string; title: string; blocked: boolean; detail: string };

const queue: Array<{ id: string; title: string; attack: () => Promise<void> }> = [];

export function scenario(id: string, title: string, attack: () => Promise<void>): void {
  queue.push({ id, title, attack });
}

export async function runSuite(label: string): Promise<void> {
  const results: Result[] = [];
  for (const { id, title, attack } of queue) {
    try {
      await attack();
      results.push({ id, title, blocked: false, detail: "attack ran to completion" });
    } catch (err) {
      if (err instanceof ExploitSucceeded) {
        results.push({ id, title, blocked: false, detail: err.message });
      } else {
        const msg = err instanceof Error ? err.message : String(err);
        results.push({ id, title, blocked: true, detail: msg.split("\n")[0]!.slice(0, 100) });
      }
    }
  }

  console.log(`\n═══ ${label} ═══\n`);
  for (const r of results) {
    console.log(`${r.blocked ? "✓ BLOCKED " : "✗ EXPLOITED"}  ${r.id}  ${r.title}`);
    console.log(`             ${r.detail}`);
  }
  const exploitedCount = results.filter((r) => !r.blocked).length;
  console.log(
    `\n${results.length - exploitedCount}/${results.length} blocked` +
      (exploitedCount ? ` — ${exploitedCount} STILL EXPLOITABLE` : " — all attacks rejected"),
  );
  if (exploitedCount > 0) {
    console.log("\n═══ FAIL — adversarial scenarios succeeded ═══\n");
    process.exit(1);
  }
  console.log("\n═══ PASS — every attack rejected ═══\n");
}
