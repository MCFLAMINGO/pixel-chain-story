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
}

export interface AccessReply {
  ok: boolean;
  /** Short enough for SMS (≤160 chars when possible) */
  sms: string;
  /** Slightly longer for USSD/smartphone */
  display: string;
  /** Structured for gateways */
  code: "OK" | "NEED_TO" | "NEED_AMOUNT" | "QUEUED" | "ERR";
}

/** Map everyday people → ledger addresses via a local directory (co-op, SIM, etc.). */
export type Directory = (localId: string) => string | undefined;

const COPY: Record<
  AccessLocale,
  {
    bal: (n: number) => string;
    sent: (n: number, to: string) => string;
    queued: (n: number, to: string) => string;
    needTo: string;
    needAmt: string;
    help: string;
    recv: (addr: string) => string;
    err: string;
  }
> = {
  en: {
    bal: (n) => `Balance: ${n} PIX`,
    sent: (n, to) => `Sent ${n} PIX to ${to}. Light will confirm.`,
    queued: (n, to) => `Saved offline: ${n} PIX to ${to}. Will send when connected.`,
    needTo: "Who do you want to send to? Reply: SEND name amount",
    needAmt: "How much? Reply: SEND name amount",
    help: "Commands: BALANCE | SEND name amount | RECEIVE | STATUS",
    recv: (a) => `Your receive code: ${a.slice(0, 12)}… Show this or your phone number.`,
    err: "Could not complete. Try again or ask your helper.",
  },
  bn: {
    bal: (n) => `ব্যালেন্স: ${n} PIX`,
    sent: (n, to) => `${to}-কে ${n} PIX পাঠানো হয়েছে। আলো নিশ্চিত করবে।`,
    queued: (n, to) => `অফলাইন সংরক্ষিত: ${to}-কে ${n} PIX। সংযোগে পাঠানো হবে।`,
    needTo: "কার কাছে পাঠাবেন? SEND নাম পরিমাণ",
    needAmt: "কত? SEND নাম পরিমাণ",
    help: "কমান্ড: BALANCE | SEND নাম পরিমাণ | RECEIVE | STATUS",
    recv: (a) => `রিসিভ কোড: ${a.slice(0, 12)}… ফোন নম্বরও চলবে।`,
    err: "সম্পন্ন হয়নি। আবার চেষ্টা করুন বা সহায়ককে জিজ্ঞাসা করুন।",
  },
  hi: {
    bal: (n) => `बैलेंस: ${n} PIX`,
    sent: (n, to) => `${to} को ${n} PIX भेजा। रोशनी पुष्टि करेगी।`,
    queued: (n, to) => `ऑफ़लाइन सेव: ${to} को ${n} PIX। जुड़ने पर भेजा जाएगा।`,
    needTo: "किसे भेजें? SEND नाम राशि",
    needAmt: "कितना? SEND नाम राशि",
    help: "कमांड: BALANCE | SEND नाम राशि | RECEIVE | STATUS",
    recv: (a) => `रिसीव कोड: ${a.slice(0, 12)}… या अपना फ़ोन नंबर।`,
    err: "पूरा नहीं हुआ। फिर कोशिश करें या सहायक से पूछें।",
  },
  es: {
    bal: (n) => `Saldo: ${n} PIX`,
    sent: (n, to) => `Enviado ${n} PIX a ${to}. La luz confirmará.`,
    queued: (n, to) => `Guardado sin red: ${n} PIX a ${to}.`,
    needTo: "¿A quién? SEND nombre cantidad",
    needAmt: "¿Cuánto? SEND nombre cantidad",
    help: "Comandos: BALANCE | SEND nombre cantidad | RECEIVE | STATUS",
    recv: (a) => `Código: ${a.slice(0, 12)}… o tu teléfono.`,
    err: "No se pudo. Intente de nuevo o pregunte al ayudante.",
  },
  sw: {
    bal: (n) => `Salio: ${n} PIX`,
    sent: (n, to) => `Umetuma ${n} PIX kwa ${to}. Mwanga utathibitisha.`,
    queued: (n, to) => `Imehifadhiwa nje ya mtandao: ${n} PIX kwa ${to}.`,
    needTo: "Kwenda kwa nani? SEND jina kiasi",
    needAmt: "Kiasi gani? SEND jina kiasi",
    help: "Amri: BALANCE | SEND jina kiasi | RECEIVE | STATUS",
    recv: (a) => `Nambari: ${a.slice(0, 12)}… au simu yako.`,
    err: "Imeshindikana. Jaribu tena au muulize msaidizi.",
  },
  und: {
    bal: (n) => `BAL ${n}`,
    sent: (n, to) => `OK SEND ${n} -> ${to}`,
    queued: (n, to) => `QUEUE ${n} -> ${to}`,
    needTo: "SEND name amount",
    needAmt: "SEND name amount",
    help: "BALANCE | SEND name amount | RECEIVE",
    recv: (a) => `RECV ${a.slice(0, 12)}`,
    err: "ERR",
  },
};

/** Parse SMS / USSD-style text into an intent. */
export function parseAccessText(
  raw: string,
  channel: AccessChannel,
  fromLocalId: string,
  locale: AccessLocale = "en",
): SimpleIntent {
  const t = raw.trim().replace(/\s+/g, " ");
  const u = t.toUpperCase();
  if (u === "BAL" || u === "BALANCE" || u === "BALANS" || u.startsWith("BAL ")) {
    return { kind: "balance", channel, locale, fromLocalId };
  }
  if (u === "HELP" || u === "?" || u === "H") {
    return { kind: "help", channel, locale, fromLocalId };
  }
  if (u === "RECEIVE" || u === "RECV" || u === "RCV") {
    return { kind: "receive", channel, locale, fromLocalId };
  }
  if (u === "STATUS" || u === "STAT") {
    return { kind: "status", channel, locale, fromLocalId };
  }
  const send = t.match(/^(?:SEND|পাঠাও|भेजो|ENVIAR|TUMA)\s+(\S+)\s+(\d+(?:\.\d+)?)\s*(.*)?$/i);
  if (send) {
    return {
      kind: "send",
      channel,
      locale,
      fromLocalId,
      toLocalId: send[1],
      amount: Math.floor(Number(send[2])),
      note: send[3]?.trim() || undefined,
      offline: channel === "offline_queue",
    };
  }
  return { kind: "help", channel, locale, fromLocalId };
}

export interface AccessContext {
  directory: Directory;
  /** Resolve PIX balance for a ledger address */
  balanceOf: (address: string) => number;
  /** Optional pending count for status */
  pendingCount?: () => number;
}

/**
 * Turn a human intent into a reply + optional ledger action request.
 * Gateways (SMS aggregator, USSD, helper app) call this — never expose hex to users.
 */
export function handleAccessIntent(
  intent: SimpleIntent,
  ctx: AccessContext,
): {
  reply: AccessReply;
  /** If set, gateway should call propose+shine (or queue) */
  ledgerSend?: {
    fromAddress: string;
    toAddress: string;
    amount: number;
    meta: ReadableMeta;
    offline: boolean;
  };
} {
  const c = COPY[intent.locale] ?? COPY.en;
  const fromAddr = ctx.directory(intent.fromLocalId);

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
    const sms = c.recv(fromAddr);
    return { reply: { ok: true, sms: sms.slice(0, 160), display: sms, code: "OK" } };
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
    const toAddr = ctx.directory(intent.toLocalId);
    if (!toAddr) {
      return { reply: { ok: false, sms: c.err.slice(0, 160), display: c.err, code: "ERR" } };
    }
    const offline = Boolean(intent.offline);
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
] as const;
