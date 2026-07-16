import { useMemo, useState } from "react";
import { ACCESS_FORMS, handleAccessIntent, parseAccessText, type AccessLocale } from "@/lib/pixel";

/** Demo door for SMS/USSD-style access — no hex. */
export function AccessDemo() {
  const [locale, setLocale] = useState<AccessLocale>("en");
  const [fromId, setFromId] = useState("+16205551212");
  const [text, setText] = useState("SEND joe 12");
  const [out, setOut] = useState<string>("");

  const directory = useMemo(
    () => (id: string) => {
      const map: Record<string, string> = {
        "+8801711000001": "pix1farmer_bd_aaaaaaaaaaaaaaaa",
        rina: "pix1rina_bbbbbbbbbbbbbbbbbbbbbb",
        "+16205551212": "pix1kansas_cccccccccccccccccc",
        joe: "pix1joe_dddddddddddddddddddddd",
      };
      return map[id] ?? map[id.toLowerCase()];
    },
    [],
  );

  const run = () => {
    const intent = parseAccessText(text, "sms", fromId, locale);
    const res = handleAccessIntent(intent, {
      directory,
      balanceOf: (a) => (a.includes("kansas") ? 100 : a.includes("farmer") ? 40 : 0),
    });
    setOut(
      `${res.reply.sms}\n\n(${res.reply.code}` +
        (res.ledgerSend
          ? ` · ledger ${res.ledgerSend.amount} PIX → ${res.ledgerSend.meta.recipientLabel}`
          : "") +
        ")",
    );
  };

  return (
    <section id="access" className="pixel-rise">
      <p className="font-pixel text-xs font-semibold tracking-[0.28em] text-primary uppercase">
        Access for everyone
      </p>
      <h2 className="font-pixel mt-3 text-3xl font-bold tracking-tight md:text-4xl">
        Bangladesh · Kansas · same ledger
      </h2>
      <p className="mt-3 max-w-2xl text-muted-foreground">
        Feature phone SMS, USSD menus, shared Androids, co-op helpers, paper codes, offline queue.
        People never see hex. Gateways speak Pixel.
      </p>

      <ul className="mt-6 grid gap-2 text-sm text-muted-foreground sm:grid-cols-2">
        {ACCESS_FORMS.map((f) => (
          <li key={f.id}>
            <span className="font-pixel text-foreground">{f.id}</span> — {f.who}
          </li>
        ))}
      </ul>

      <div className="mt-8 max-w-xl space-y-3">
        <label className="block text-sm text-muted-foreground">
          From (phone / local id)
          <input
            value={fromId}
            onChange={(e) => setFromId(e.target.value)}
            className="mt-1 w-full border-0 border-b border-border bg-transparent py-2 outline-none focus:border-primary"
          />
        </label>
        <label className="block text-sm text-muted-foreground">
          Message (SMS style)
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            className="mt-1 w-full border-0 border-b border-border bg-transparent py-2 font-mono outline-none focus:border-primary"
          />
        </label>
        <div className="flex flex-wrap gap-2">
          {(["en", "bn", "hi", "es", "sw"] as AccessLocale[]).map((l) => (
            <button
              key={l}
              type="button"
              onClick={() => setLocale(l)}
              className={`font-pixel rounded-md px-3 py-1 text-xs ${
                locale === l ? "bg-primary text-primary-foreground" : "border border-border"
              }`}
            >
              {l}
            </button>
          ))}
          <button
            type="button"
            onClick={run}
            className="font-pixel ml-auto rounded-md bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground"
          >
            Send intent
          </button>
        </div>
        {out && (
          <pre className="whitespace-pre-wrap border border-border bg-background/70 p-3 text-sm">
            {out}
          </pre>
        )}
      </div>
    </section>
  );
}
