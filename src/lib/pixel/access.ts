/**
 * Access for everyone — Bangladesh peasant · Kansas farmer · anyone between.
 *
 * Coders use One / RPC / Lumen.
 * People use plain intents over whatever channel they have:
 *   SMS, USSD, voice, shared smartphone, paper+light, a trusted helper.
 *
 * No wallets-as-identity theater. No English-only. No always-on broadband.
 */

import type { ReadableMeta } from "./transaction";

export type AccessChannel =
  | "sms"
  | "ussd"
  | "voice"
  | "smartphone"
  | "shared_phone"
  | "helper" // shop / co-op / extension agent / family
  | "paper_optical" // print + flashlight / screen
  | "offline_queue"
  | "radio_gateway"; // high-frequency / community radio bridge (planned)

export type AccessLocale =
  | "en"
  | "bn" // Bangla
  | "hi"
  | "es"
  | "sw"
  | "und"; // undetermined — keep messages numeric-simple

export type SimpleIntentKind = "send" | "balance" | "receive" | "help" | "status";

export interface SimpleIntent {
  kind: SimpleIntentKind;
  channel: AccessChannel;
  locale: AccessLocale;
  /** Local identifier — phone number, co-op member id, not crypto address */
  fromLocalId: string;
  toLocalId?: string;
  amount?: number;
  /** Spoken/typed note in their language */
  note?: string;
  /** When offline — queue until light/gateway syncs */
  offline?: boolean;
  /** Helper / USSD confirmation PIN (optional) */
  confirmPin?: string;
}

export interface AccessReply {
  ok: boolean;
  /** Short enough for SMS (≤160 chars when possible) */
  sms: string;
  /** Slightly longer for USSD/smartphone */
  display: string;
  /** Structured for gateways */
  code: "OK" | "NEED_TO" | "NEED_AMOUNT" | "QUEUED" | "NEED_CONFIRM" | "ERR";
}

/** Map everyday people → ledger addresses via a local directory (co-op, SIM, etc.). */
export type Directory = (localId: string) => string | undefined;

/** Lived personas — design targets, not marketing. */
export interface AccessPersona {
  id: "bangladesh_peasant" | "kansas_farmer";
  name: string;
  place: string;
  locale: AccessLocale;
  /** Typical channels this person actually has */
  channels: AccessChannel[];
  /** Example local id (phone / co-op member) */
  localId: string;
  /** What “easy” means for them */
  ease: string;
  /** Sample first message they would send */
  sampleText: string;
}

export const ACCESS_PERSONAS: readonly AccessPersona[] = [
  {
    id: "bangladesh_peasant",
    name: "রহিম (Rahim)",
    place: "Rural Bangladesh",
    locale: "bn",
    channels: ["sms", "ussd", "shared_phone", "helper", "offline_queue", "paper_optical"],
    localId: "+8801711000001",
    ease: "Feature phone + Bangla SMS/USSD. Names, not hex. Helper at the hat if stuck.",
    sampleText: "পাঠাও rina 5",
  },
  {
    id: "kansas_farmer",
    name: "Dale",
    place: "Rural Kansas, USA",
    locale: "en",
    channels: ["smartphone", "ussd", "helper", "offline_queue", "sms", "voice"],
    localId: "+16205551212",
    ease: "Big buttons or co-op desk. Spotty LTE OK — queue offline. Never say ‘gas’.",
    sampleText: "SEND joe 12",
  },
] as const;

const COPY: Record<
  AccessLocale,
  {
    bal: (n: number) => string;
    sent: (n: number, to: string) => string;
    queued: (n: number, to: string) => string;
    needTo: string;
    needAmt: string;
    needConfirm: (n: number, to: string) => string;
    help: string;
    recv: (addr: string) => string;
    ussdMenu: string;
    err: string;
  }
> = {
  en: {
    bal: (n) => `Balance: ${n} PIX`,
    sent: (n, to) => `Sent ${n} PIX to ${to}. Light will confirm.`,
    queued: (n, to) => `Saved offline: ${n} PIX to ${to}. Will send when connected.`,
    needTo: "Who do you want to send to? Reply: SEND name amount",
    needAmt: "How much? Reply: SEND name amount",
    needConfirm: (n, to) => `Confirm send ${n} PIX to ${to}? Reply YES or PIN`,
    help: "Commands: BALANCE | SEND name amount | RECEIVE | STATUS",
    recv: (a) => `Your receive code: ${a.slice(0, 12)}… Show this or your phone number.`,
    ussdMenu: "1 Balance\n2 Send\n3 Receive\n4 Status\n0 Help",
    err: "Could not complete. Try again or ask your helper.",
  },
  bn: {
    bal: (n) => `ব্যালেন্স: ${n} PIX`,
    sent: (n, to) => `${to}-কে ${n} PIX পাঠানো হয়েছে। আলো নিশ্চিত করবে।`,
    queued: (n, to) => `অফলাইন সংরক্ষিত: ${to}-কে ${n} PIX। সংযোগে পাঠানো হবে।`,
    needTo: "কার কাছে পাঠাবেন? SEND নাম পরিমাণ",
    needAmt: "কত? SEND নাম পরিমাণ",
    needConfirm: (n, to) => `${to}-কে ${n} PIX? YES বা PIN দিয়ে নিশ্চিত করুন`,
    help: "কমান্ড: BALANCE | SEND নাম পরিমাণ | RECEIVE | STATUS",
    recv: (a) => `রিসিভ কোড: ${a.slice(0, 12)}… ফোন নম্বরও চলবে।`,
    ussdMenu: "1 ব্যালেন্স\n2 পাঠান\n3 রিসিভ\n4 স্ট্যাটাস\n0 সাহায্য",
    err: "সম্পন্ন হয়নি। আবার চেষ্টা করুন বা সহায়ককে জিজ্ঞাসা করুন।",
  },
  hi: {
    bal: (n) => `बैलेंस: ${n} PIX`,
    sent: (n, to) => `${to} को ${n} PIX भेजा। रोशनी पुष्टि करेगी।`,
    queued: (n, to) => `ऑफ़लाइन सेव: ${to} को ${n} PIX। जुड़ने पर भेजा जाएगा।`,
    needTo: "किसे भेजें? SEND नाम राशि",
    needAmt: "कितना? SEND नाम राशि",
    needConfirm: (n, to) => `${to} को ${n} PIX? YES या PIN से पुष्टि करें`,
    help: "कमांड: BALANCE | SEND नाम राशि | RECEIVE | STATUS",
    recv: (a) => `रिसीव कोड: ${a.slice(0, 12)}… या अपना फ़ोन नंबर।`,
    ussdMenu: "1 बैलेंस\n2 भेजें\n3 रिसीव\n4 स्थिति\n0 मदद",
    err: "पूरा नहीं हुआ। फिर कोशिश करें या सहायक से पूछें।",
  },
  es: {
    bal: (n) => `Saldo: ${n} PIX`,
    sent: (n, to) => `Enviado ${n} PIX a ${to}. La luz confirmará.`,
    queued: (n, to) => `Guardado sin red: ${n} PIX a ${to}.`,
    needTo: "¿A quién? SEND nombre cantidad",
    needAmt: "¿Cuánto? SEND nombre cantidad",
    needConfirm: (n, to) => `¿Enviar ${n} PIX a ${to}? Responda YES o PIN`,
    help: "Comandos: BALANCE | SEND nombre cantidad | RECEIVE | STATUS",
    recv: (a) => `Código: ${a.slice(0, 12)}… o tu teléfono.`,
    ussdMenu: "1 Saldo\n2 Enviar\n3 Recibir\n4 Estado\n0 Ayuda",
    err: "No se pudo. Intente de nuevo o pregunte al ayudante.",
  },
  sw: {
    bal: (n) => `Salio: ${n} PIX`,
    sent: (n, to) => `Umetuma ${n} PIX kwa ${to}. Mwanga utathibitisha.`,
    queued: (n, to) => `Imehifadhiwa nje ya mtandao: ${n} PIX kwa ${to}.`,
    needTo: "Kwenda kwa nani? SEND jina kiasi",
    needAmt: "Kiasi gani? SEND jina kiasi",
    needConfirm: (n, to) => `Thibitisha ${n} PIX kwa ${to}? YES au PIN`,
    help: "Amri: BALANCE | SEND jina kiasi | RECEIVE | STATUS",
    recv: (a) => `Nambari: ${a.slice(0, 12)}… au simu yako.`,
    ussdMenu: "1 Salio\n2 Tuma\n3 Pokea\n4 Hali\n0 Msaada",
    err: "Imeshindikana. Jaribu tena au muulize msaidizi.",
  },
  und: {
    bal: (n) => `BAL ${n}`,
    sent: (n, to) => `OK SEND ${n} -> ${to}`,
    queued: (n, to) => `QUEUE ${n} -> ${to}`,
    needTo: "SEND name amount",
    needAmt: "SEND name amount",
    needConfirm: (n, to) => `CONFIRM ${n} -> ${to} YES|PIN`,
    help: "BALANCE | SEND name amount | RECEIVE",
    recv: (a) => `RECV ${a.slice(0, 12)}`,
    ussdMenu: "1 BAL\n2 SEND\n3 RECV\n4 STAT\n0 HELP",
    err: "ERR",
  },
};

/** Normalize phone / local ids so +880… and 880… match. */
export function normalizeLocalId(id: string): string {
  const t = id.trim().toLowerCase();
  if (/^\+?\d[\d\s-]{6,}$/.test(t)) {
    return "+" + t.replace(/\D/g, "").replace(/^\+/, "");
  }
  return t;
}

/** Parse SMS / USSD-style text into an intent. */
export function parseAccessText(
  raw: string,
  channel: AccessChannel,
  fromLocalId: string,
  locale: AccessLocale = "en",
): SimpleIntent {
  const t = raw.trim().replace(/\s+/g, " ");
  const u = t.toUpperCase();
  const from = normalizeLocalId(fromLocalId);

  // Bangla / Hindi / Spanish / Swahili balance synonyms
  if (
    u === "BAL" ||
    u === "BALANCE" ||
    u === "BALANS" ||
    u.startsWith("BAL ") ||
    /^ব্যালেন্স|^ব্যালান্স/i.test(t) ||
    /^बैलेंस/i.test(t) ||
    /^SALDO\b/i.test(t) ||
    /^SALIO\b/i.test(t)
  ) {
    return { kind: "balance", channel, locale, fromLocalId: from };
  }
  if (u === "HELP" || u === "?" || u === "H" || u === "সাহায্য" || u === "मदद") {
    return { kind: "help", channel, locale, fromLocalId: from };
  }
  if (u === "RECEIVE" || u === "RECV" || u === "RCV" || u === "রিসিভ" || u === "रिसीव") {
    return { kind: "receive", channel, locale, fromLocalId: from };
  }
  if (u === "STATUS" || u === "STAT" || u === "স্ট্যাটাস") {
    return { kind: "status", channel, locale, fromLocalId: from };
  }

  const send = t.match(
    /^(?:SEND|পাঠাও|পাঠান|भेजो|भेजें|ENVIAR|TUMA)\s+(\S+)\s+(\d+(?:\.\d+)?)\s*(.*)?$/i,
  );
  if (send) {
    return {
      kind: "send",
      channel,
      locale,
      fromLocalId: from,
      toLocalId: normalizeLocalId(send[1]),
      amount: Math.floor(Number(send[2])),
      note: send[3]?.trim() || undefined,
      offline: channel === "offline_queue",
    };
  }

  // Compact: "*123*2*rina*5#" style stripped to digits+names by gateway beforehand —
  // also accept "2 rina 5" after USSD menu choice 2
  const compact = t.match(/^2\s+(\S+)\s+(\d+(?:\.\d+)?)\s*(.*)?$/i);
  if (compact) {
    return {
      kind: "send",
      channel,
      locale,
      fromLocalId: from,
      toLocalId: normalizeLocalId(compact[1]),
      amount: Math.floor(Number(compact[2])),
      note: compact[3]?.trim() || undefined,
      offline: channel === "offline_queue",
    };
  }

  return { kind: "help", channel, locale, fromLocalId: from };
}

export interface AccessContext {
  directory: Directory;
  /** Resolve PIX balance for a ledger address */
  balanceOf: (address: string) => number;
  /** Optional pending count for status */
  pendingCount?: () => number;
  /**
   * When set, helper/voice/shared_phone sends require YES or matching PIN
   * before returning ledgerSend.
   */
  requireConfirm?: boolean;
  /** Expected PIN for helper confirmation (demo / gateway config) */
  expectedPin?: string;
  /** User replied YES / PIN on a pending confirm */
  confirmation?: string;
}

export interface AccessResult {
  reply: AccessReply;
  /** If set, gateway should call propose+shine (or queue) */
  ledgerSend?: {
    fromAddress: string;
    toAddress: string;
    amount: number;
    meta: ReadableMeta;
    offline: boolean;
  };
}

/**
 * Turn a human intent into a reply + optional ledger action request.
 * Gateways (SMS aggregator, USSD, helper app) call this — never expose hex to users.
 */
export function handleAccessIntent(intent: SimpleIntent, ctx: AccessContext): AccessResult {
  const c = COPY[intent.locale] ?? COPY.en;
  const fromKey = normalizeLocalId(intent.fromLocalId);
  const fromAddr = ctx.directory(fromKey) ?? ctx.directory(intent.fromLocalId);

  if (intent.kind === "help") {
    return { reply: { ok: true, sms: c.help.slice(0, 160), display: c.help, code: "OK" } };
  }

  if (!fromAddr) {
    return {
      reply: {
        ok: false,
        sms: c.err.slice(0, 160),
        display: `${c.err} (unknown user ${intent.fromLocalId})`,
        code: "ERR",
      },
    };
  }

  if (intent.kind === "balance") {
    const n = ctx.balanceOf(fromAddr);
    const sms = c.bal(n);
    return { reply: { ok: true, sms: sms.slice(0, 160), display: sms, code: "OK" } };
  }

  if (intent.kind === "receive") {
    // Prefer phone/local id in the message — never force full address on SMS
    const label = intent.fromLocalId;
    const sms =
      intent.locale === "und"
        ? `RECV ${label}`
        : intent.locale === "bn"
          ? `আপনার নম্বর দিয়ে পাঠান: ${label}`
          : `Receive via your number: ${label}`;
    const display = `${sms}\n${c.recv(fromAddr)}`;
    return { reply: { ok: true, sms: sms.slice(0, 160), display, code: "OK" } };
  }

  if (intent.kind === "status") {
    const p = ctx.pendingCount?.() ?? 0;
    const sms = p > 0 ? `PENDING ${p}` : "OK CLEAR";
    return { reply: { ok: true, sms, display: sms, code: "OK" } };
  }

  if (intent.kind === "send") {
    if (!intent.toLocalId) {
      return {
        reply: { ok: false, sms: c.needTo.slice(0, 160), display: c.needTo, code: "NEED_TO" },
      };
    }
    if (!intent.amount || intent.amount <= 0) {
      return {
        reply: { ok: false, sms: c.needAmt.slice(0, 160), display: c.needAmt, code: "NEED_AMOUNT" },
      };
    }
    const toKey = normalizeLocalId(intent.toLocalId);
    const toAddr = ctx.directory(toKey) ?? ctx.directory(intent.toLocalId);
    if (!toAddr) {
      return { reply: { ok: false, sms: c.err.slice(0, 160), display: c.err, code: "ERR" } };
    }

    const needsConfirm =
      Boolean(ctx.requireConfirm) ||
      intent.channel === "helper" ||
      intent.channel === "voice" ||
      intent.channel === "shared_phone";

    if (needsConfirm) {
      const conf = (ctx.confirmation ?? intent.confirmPin ?? "").trim().toUpperCase();
      const pinOk = ctx.expectedPin ? conf === ctx.expectedPin.toUpperCase() : false;
      const yesOk = conf === "YES" || conf === "Y" || conf === "হ্যাঁ" || conf === "हां";
      if (!pinOk && !yesOk) {
        const msg = c.needConfirm(intent.amount, intent.toLocalId);
        return {
          reply: { ok: false, sms: msg.slice(0, 160), display: msg, code: "NEED_CONFIRM" },
        };
      }
    }

    const offline = Boolean(intent.offline) || intent.channel === "offline_queue";
    const msg = offline
      ? c.queued(intent.amount, intent.toLocalId)
      : c.sent(intent.amount, intent.toLocalId);
    return {
      reply: {
        ok: true,
        sms: msg.slice(0, 160),
        display: msg,
        code: offline ? "QUEUED" : "OK",
      },
      ledgerSend: {
        fromAddress: fromAddr,
        toAddress: toAddr,
        amount: intent.amount,
        offline,
        meta: {
          description: intent.note || `Send via ${intent.channel}`,
          recipientLabel: intent.toLocalId,
          reference: `ACCESS-${intent.channel}-${Date.now()}`,
        },
      },
    };
  }

  return { reply: { ok: false, sms: c.err.slice(0, 160), display: c.err, code: "ERR" } };
}

/** USSD session — digit menus for phones with no data plan. */
export interface UssdSession {
  step: "menu" | "send_to" | "send_amt" | "done";
  locale: AccessLocale;
  fromLocalId: string;
  toLocalId?: string;
  amount?: number;
}

export function ussdMenuText(locale: AccessLocale = "en"): string {
  return (COPY[locale] ?? COPY.en).ussdMenu;
}

/**
 * Advance a USSD session from dialed digits / text.
 * Entry: empty or "0" → menu. "1" balance, "2" send flow, "3" receive, "4" status.
 */
export function handleUssdInput(
  session: UssdSession,
  input: string,
  ctx: AccessContext,
): { session: UssdSession; result?: AccessResult; prompt: string } {
  const locale = session.locale;
  const c = COPY[locale] ?? COPY.en;
  const raw = input.trim();

  if (session.step === "menu" || raw === "" || raw === "*") {
    if (raw === "1") {
      const intent: SimpleIntent = {
        kind: "balance",
        channel: "ussd",
        locale,
        fromLocalId: session.fromLocalId,
      };
      const result = handleAccessIntent(intent, ctx);
      return { session: { ...session, step: "done" }, result, prompt: result.reply.display };
    }
    if (raw === "3") {
      const intent: SimpleIntent = {
        kind: "receive",
        channel: "ussd",
        locale,
        fromLocalId: session.fromLocalId,
      };
      const result = handleAccessIntent(intent, ctx);
      return { session: { ...session, step: "done" }, result, prompt: result.reply.display };
    }
    if (raw === "4") {
      const intent: SimpleIntent = {
        kind: "status",
        channel: "ussd",
        locale,
        fromLocalId: session.fromLocalId,
      };
      const result = handleAccessIntent(intent, ctx);
      return { session: { ...session, step: "done" }, result, prompt: result.reply.display };
    }
    if (raw === "2") {
      return {
        session: { ...session, step: "send_to" },
        prompt: locale === "bn" ? "নাম বা নম্বর:" : "Name or number:",
      };
    }
    if (raw === "0" || raw === "HELP") {
      return { session, prompt: c.help };
    }
    // free-text SEND on USSD also works
    if (/^(?:SEND|পাঠাও|পাঠান)\b/i.test(raw) || /^2\s+\S+\s+\d+/i.test(raw)) {
      const intent = parseAccessText(raw, "ussd", session.fromLocalId, locale);
      const result = handleAccessIntent(intent, ctx);
      return { session: { ...session, step: "done" }, result, prompt: result.reply.display };
    }
    return { session: { ...session, step: "menu" }, prompt: ussdMenuText(locale) };
  }

  if (session.step === "send_to") {
    return {
      session: { ...session, step: "send_amt", toLocalId: normalizeLocalId(raw) },
      prompt: locale === "bn" ? "পরিমাণ:" : "Amount:",
    };
  }

  if (session.step === "send_amt") {
    const amount = Math.floor(Number(raw));
    const intent: SimpleIntent = {
      kind: "send",
      channel: "ussd",
      locale,
      fromLocalId: session.fromLocalId,
      toLocalId: session.toLocalId,
      amount,
    };
    const result = handleAccessIntent(intent, ctx);
    return { session: { ...session, step: "done", amount }, result, prompt: result.reply.display };
  }

  return { session, prompt: ussdMenuText(locale) };
}

/** In-memory offline queue for spotty coverage (gateway / shared phone). */
export interface QueuedIntent {
  id: string;
  intent: SimpleIntent;
  createdAt: number;
}

export function enqueueOffline(queue: QueuedIntent[], intent: SimpleIntent): QueuedIntent[] {
  const q: QueuedIntent = {
    id: `q-${Date.now()}-${queue.length}`,
    intent: { ...intent, offline: true, channel: "offline_queue" },
    createdAt: Date.now(),
  };
  return [...queue, q];
}

/** Drain queue when radio/data returns — returns ledger actions + replies. */
export function flushOfflineQueue(
  queue: QueuedIntent[],
  ctx: AccessContext,
): { remaining: QueuedIntent[]; results: AccessResult[] } {
  const results: AccessResult[] = [];
  const remaining: QueuedIntent[] = [];
  for (const item of queue) {
    const onlineIntent: SimpleIntent = {
      ...item.intent,
      offline: false,
      channel: "sms",
    };
    const result = handleAccessIntent(onlineIntent, { ...ctx, requireConfirm: false });
    if (result.reply.code === "ERR" || (onlineIntent.kind === "send" && !result.ledgerSend)) {
      remaining.push(item);
    } else {
      results.push(result);
    }
  }
  return { remaining, results };
}

/**
 * Helper desk flow: agent enters intent; farmer confirms with YES/PIN.
 * Returns NEED_CONFIRM until confirmation supplied.
 */
export function helperAssistedSend(
  fromLocalId: string,
  toLocalId: string,
  amount: number,
  locale: AccessLocale,
  ctx: AccessContext,
  confirmation?: string,
): AccessResult {
  return handleAccessIntent(
    {
      kind: "send",
      channel: "helper",
      locale,
      fromLocalId,
      toLocalId,
      amount,
    },
    { ...ctx, requireConfirm: true, confirmation },
  );
}

/** Forms of access we commit to supporting. */
export const ACCESS_FORMS = [
  {
    id: "sms",
    who: "Feature phone users (e.g. rural Bangladesh)",
    how: "Text BALANCE / SEND name amount — gateway signs & shines",
  },
  {
    id: "ussd",
    who: "Any GSM phone without data",
    how: "Menu: 1 Balance 2 Send — same intents",
  },
  {
    id: "shared_phone",
    who: "Family / village shared Android",
    how: "Simple big-button UI; local accounts by name/PIN",
  },
  {
    id: "helper",
    who: "Kansas co-op desk / village agent",
    how: "Trusted helper operates gateway; farmer confirms with PIN/voice",
  },
  {
    id: "paper_optical",
    who: "Offline / low literacy",
    how: "Printed receive codes + screen/flashlight light ceremony",
  },
  {
    id: "offline_queue",
    who: "Intermittent connectivity",
    how: "Intent saved on phone; syncs when radio/data returns",
  },
  {
    id: "smartphone",
    who: "Anyone with a basic app",
    how: "One screen: Send / Receive / Balance — no hex, no gas words",
  },
  {
    id: "voice",
    who: "IVR / missed-call menus",
    how: "Dial, hear menu in local language, speak or press amounts",
  },
] as const;

/** Public access surface for One / gateways. */
export const Access = {
  personas: ACCESS_PERSONAS,
  forms: ACCESS_FORMS,
  parse: parseAccessText,
  handle: handleAccessIntent,
  ussd: handleUssdInput,
  ussdMenu: ussdMenuText,
  helperSend: helperAssistedSend,
  enqueue: enqueueOffline,
  flush: flushOfflineQueue,
  normalizeId: normalizeLocalId,
} as const;
