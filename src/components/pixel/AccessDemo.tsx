import { useMemo, useState } from "react";
import {
  ACCESS_FORMS,
  ACCESS_PERSONAS,
  handleAccessIntent,
  handleUssdInput,
  helperAssistedSend,
  parseAccessText,
  ussdMenuText,
  type AccessChannel,
  type AccessLocale,
  type UssdSession,
} from "@/lib/pixel";

/** Demo door for SMS/USSD/helper access — no hex. */
export function AccessDemo() {
  const [personaId, setPersonaId] =
    useState<(typeof ACCESS_PERSONAS)[number]["id"]>("kansas_farmer");
  const persona = ACCESS_PERSONAS.find((p) => p.id === personaId)!;
  const [locale, setLocale] = useState<AccessLocale>(persona.locale);
  const [channel, setChannel] = useState<AccessChannel>("sms");
  const [fromId, setFromId] = useState(persona.localId);
  const [text, setText] = useState(persona.sampleText);
  const [confirm, setConfirm] = useState("");
  const [out, setOut] = useState<string>("");
  const [ussd, setUssd] = useState<UssdSession | null>(null);

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

  const ctx = useMemo(
    () => ({
      directory,
      balanceOf: (a: string) => (a.includes("kansas") ? 100 : a.includes("farmer") ? 40 : 0),
      expectedPin: "1234",
    }),
    [directory],
  );

  const pickPersona = (id: (typeof ACCESS_PERSONAS)[number]["id"]) => {
    const p = ACCESS_PERSONAS.find((x) => x.id === id)!;
    setPersonaId(id);
    setLocale(p.locale);
    setFromId(p.localId);
    setText(p.sampleText);
    setChannel(p.channels[0] ?? "sms");
    setConfirm("");
    setOut("");
    setUssd(null);
  };

  const run = () => {
    if (channel === "ussd") {
      const session: UssdSession = ussd ?? {
        step: "menu",
        locale,
        fromLocalId: fromId,
      };
      const step = handleUssdInput(session, text, ctx);
      setUssd(step.session.step === "done" ? null : step.session);
      const extra = step.result?.ledgerSend
        ? `\n· ledger ${step.result.ledgerSend.amount} PIX → ${step.result.ledgerSend.meta.recipientLabel}`
        : "";
      setOut(`${step.prompt}${extra}`);
      return;
    }

    if (channel === "helper") {
      const parsed = parseAccessText(text, "helper", fromId, locale);
      const res = helperAssistedSend(
        fromId,
        parsed.toLocalId ?? "joe",
        parsed.amount ?? 0,
        locale,
        ctx,
        confirm || undefined,
      );
      setOut(
        `${res.reply.sms}\n\n(${res.reply.code}` +
          (res.ledgerSend
            ? ` · ledger ${res.ledgerSend.amount} PIX → ${res.ledgerSend.meta.recipientLabel}`
            : "") +
          ")",
      );
      return;
    }

    const intent = parseAccessText(text, channel, fromId, locale);
    const res = handleAccessIntent(intent, ctx);
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
        A peasant in Bangladesh. A farmer in Kansas.
      </h2>
      <p className="mt-3 max-w-2xl text-muted-foreground">
        Same ledger. Different doors. Feature-phone SMS, USSD menus, co-op helpers, shared phones,
        paper codes, offline queue. People never see hex — gateways speak Pixel.
      </p>

      <div className="mt-8 flex flex-wrap gap-3">
        {ACCESS_PERSONAS.map((p) => (
          <button
            key={p.id}
            type="button"
            onClick={() => pickPersona(p.id)}
            className={`font-pixel max-w-xs rounded-md px-4 py-3 text-left text-sm transition ${
              personaId === p.id
                ? "bg-primary text-primary-foreground"
                : "border border-border hover:border-primary/50"
            }`}
          >
            <span className="block font-semibold">{p.name}</span>
            <span className="mt-1 block text-xs opacity-80">{p.place}</span>
          </button>
        ))}
      </div>
      <p className="mt-3 max-w-xl text-sm text-muted-foreground">{persona.ease}</p>

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
          {channel === "ussd"
            ? "USSD input (try empty for menu, then 1 / 2 / name / amount)"
            : "Message (SMS style)"}
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            className="mt-1 w-full border-0 border-b border-border bg-transparent py-2 font-mono outline-none focus:border-primary"
          />
        </label>
        {channel === "helper" && (
          <label className="block text-sm text-muted-foreground">
            Confirm (YES or PIN 1234)
            <input
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              className="mt-1 w-full border-0 border-b border-border bg-transparent py-2 outline-none focus:border-primary"
            />
          </label>
        )}
        <div className="flex flex-wrap gap-2">
          {(["sms", "ussd", "helper", "offline_queue"] as AccessChannel[]).map((ch) => (
            <button
              key={ch}
              type="button"
              onClick={() => {
                setChannel(ch);
                setUssd(null);
                if (ch === "ussd") setText("");
              }}
              className={`font-pixel rounded-md px-3 py-1 text-xs ${
                channel === ch ? "bg-primary text-primary-foreground" : "border border-border"
              }`}
            >
              {ch}
            </button>
          ))}
        </div>
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
        {channel === "ussd" && (
          <p className="whitespace-pre-wrap text-xs text-muted-foreground">
            {ussdMenuText(locale)}
          </p>
        )}
        {out && (
          <pre className="whitespace-pre-wrap border border-border bg-background/70 p-3 text-sm">
            {out}
          </pre>
        )}
      </div>
    </section>
  );
}
