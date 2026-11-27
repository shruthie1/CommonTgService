/**
 * Revenue by receiving UPI id (GET /monitor/upi-revenue), pure. No I/O here: the service passes the rows.
 *
 * Source: Mongo paymentProofs credited rows (servedAt set; amount = creditAmount, else amount), grouped by the
 * payee UPI id read from the receipt (payeeUpiId). One row per UPI id, never per bank account (owner 2026-11-22):
 * an account with two ids shows two rows; the account tag is a label only. A receipt id is mapped to one of our
 * configured ids (Mongo `upi-ids` doc + every client's qrId/gpayId): exact, else a unique id that contains the
 * read piece (receipts cut ids: "8000073302@fbpe", "paytmqr…0101rgcf…"), else a unique id within 2 edits (OCR
 * typos: "sx40" for "sx4o").
 *
 * Name match (owner 2026-11-22): a credit with no id matched but one of our banking names read goes to an id of that
 * account: the chat's client's current qrId if that id is on the account, else its gpayId if on the account, else the
 * account's one id when it has exactly one. Several ids and the client on none of them, or no name read: the "other"
 * row. No config maps names to ids (the upi-ids doc holds ids only), so an id's account is read from receipts: the
 * one banking name read on that id's matched receipts in the last 7 days, when every name read agrees and it was
 * read UPI_ACCOUNT_MIN_READS+ times. Rows show the name-matched part (nameRupees / nameCredits). The total is the
 * credited total under the owner's revenue rules either way.
 * Caveat: the current qrId / gpayId is used for every day, so a client that moved ids in the window (divya2, kavya2,
 * sowmya2 on 2026-11-21) has its earlier name-only credits judged against its new ids.
 *
 * Owner revenue rules (skill user-stats): proofs voided by CMS Uncredit (uncredited.state 'done') are out; every
 * credit of a chat with fakePaymentAt on any userData row is out; any credit of ₹1,000 or more is out.
 *
 * Labels (owner 2026-11-23): an id can carry an explicit owner label (RL, RG, LS…) in the Mongo `upi-labels` collection
 * ({ upiId, label }; not the upi-ids doc, whose GET is a vcui/payment-local contract). Every id with the same label
 * collapses into ONE row (kind 'label', key 'l' + label) with the per-id split in `upis`; its drill-down returns the
 * credits of all its ids. An id with no label keeps its own row and gets `suggestedLabel`: the one banking name read on
 * its receipts in the last 7 days (every read agreeing, 1+ reads). The suggestion is never applied here.
 * "Laxmi" (owner 2026-11-23): a payee name read with the "Laxmi" spelling means a fake receipt. Such credits never go
 * under an id or a label: they form one flagged row (kind 'laxmi', key 'laxmi'). Totals are unchanged by both.
 *
 * Output never carries a full UPI id or a payee name: ids are cut to the last 4 of the local part plus the
 * handle ("****3302@fbpe"); the tag is the initials of the banking name read most often on that id's receipts.
 * Row summaries carry no chat id. Drill-down items (upiRowItems, GET /monitor/upi-revenue/items) do carry the
 * full chatId, with clientId, telegramMsgId and username, so the UI can link each credit to its chat.
 * Only main QR ids get a tag (some client's qrId now, or a qrId* key of the upi-ids doc): on low-count gpay ids
 * the most frequent name read is noise (owner 2026-11-22), so gpay-only and other ids stay untagged.
 */

import { createHash } from 'crypto';

export const UPI_WINDOWS = ['today', '7d'] as const;
export type UpiWindow = (typeof UPI_WINDOWS)[number];
/** Owner rule 2026-10-25: a credit of ₹1,000 or more is never real. */
export const UPI_BIG_CREDIT = 1000;
/** Shortest read piece (letters and digits) that may match one of our ids by containment. */
export const UPI_MIN_PIECE = 4;
/** Shortest local part that may match one of our ids within UPI_MAX_EDITS. */
export const UPI_MIN_EDIT_LEN = 8;
export const UPI_MAX_EDITS = 2;

/** Our banking names (tg-platform paid-to-us.ts OUR_PAYEE_NAMES). Used only for the row tag (initials). */
const OUR_BANKING_NAMES = ['Ravva Lakshmi', 'Lakshmi Stores', 'Girls Community', 'Reddy Girl', 'Shetty Saikumar', 'Shetty Srinivas'];
/** "Lakshmi Store" and "Lakshmi Stores" are one name (owner 2026-11-23): names are compared with "stores" read as "store". */
const storeForm = (s: string) => s.replace(/stores/g, 'store');
const NAME_FORMS = OUR_BANKING_NAMES.map((name) => {
  const words = storeForm(name.toLowerCase()).split(' ');
  return { tag: words.map((w) => w[0].toUpperCase()).join(''), forms: [words.join(''), [...words].reverse().join('')] };
});

/** An id belongs to an account only after this many matched receipts read that banking name (and no other). */
export const UPI_ACCOUNT_MIN_READS = 2;

/** A payee name read with the "Laxmi" spelling (owner: "laxm is fake"): some word contains "laxm", any case, so a name
 *  read joined ("RAVVALAXMI") counts. Words are split on non-letters, so letters joined across words ("Vilax Mishra")
 *  never match; "lakshmi" never contains "laxm". */
export function isLaxmiName(name: unknown): boolean {
  return String(name ?? '').toLowerCase().split(/[^a-z]+/).some((w) => w.includes('laxm'));
}

/** Owner label of an id in the upi-labels collection: 1-8 letters or digits, upper case. Anything else is no label. */
export const UPI_LABEL = /^[A-Z0-9]{1,8}$/;

export interface UpiLabelRow {
  upiId?: unknown;
  label?: unknown;
}

/** Normalised id -> label, from upi-labels rows; rows with no id or an invalid label are skipped. */
export function labelsOfIds(rows: UpiLabelRow[] | undefined): Map<string, string> {
  const out = new Map<string, string>();
  for (const r of rows ?? []) {
    if (typeof r?.upiId !== 'string' || !r.upiId.includes('@') || typeof r.label !== 'string') continue;
    const label = r.label.trim().toUpperCase();
    if (UPI_LABEL.test(label)) out.set(normUpi(r.upiId), label);
  }
  return out;
}

/**
 * Fields read from paymentProofs (never image / ocr). The drill-down (GET /monitor/upi-revenue/items) also needs the
 * proof's ids, persona and times to link the chat and the review and to load the screenshot through the existing
 * image route; verdict.outcome tells a legacy row (no archived file) apart.
 */
export const UPI_PROOF_PROJECTION = {
  chatId: 1, clientId: 1, payeeUpiId: 1, payeeName: 1, creditAmount: 1, amount: 1, servedAt: 1, 'uncredited.state': 1,
  proofId: 1, profile: 1, telegramMsgId: 1, createdAt: 1, 'verdict.outcome': 1,
};

export interface UpiProofRow {
  chatId?: unknown;
  clientId?: string;
  payeeUpiId?: string | null;
  payeeName?: string | null;
  creditAmount?: number | null;
  amount?: number | null;
  uncredited?: { state?: string } | null;
  _id?: unknown;
  proofId?: string | null;
  profile?: string | null;
  telegramMsgId?: number | null;
  servedAt?: Date | string | null;
  createdAt?: Date | string | null;
  verdict?: { outcome?: string | null } | null;
}

export interface UpiClientRow {
  clientId?: string;
  qrId?: string | null;
  gpayId?: string | null;
}

export interface UpiRevenueRow {
  /** Stable row key for the drill-down: 'other', 'laxmi', 'l' + label, or 'u' + 12 hex of sha256(normalised id).
   *  Never the id itself. */
  key: string;
  /** Masked id ("****3302@fbpe"); null on the other, laxmi and label rows. */
  id: string | null;
  /** 'qr' = some client's qrId, 'gpay' = some client's gpayId (and no qrId), 'listed' = upi-ids doc only, 'label' = every
   *  id of one owner label, 'laxmi' = credits whose payee name reads "Laxmi" (suspect fake), 'other'. */
  kind: 'qr' | 'gpay' | 'listed' | 'label' | 'laxmi' | 'other';
  /** Owner label of the id (upi-labels); on a label row, its label. null when the id has none. */
  label: string | null;
  /** Unlabelled id rows only: the label the banking name read on its receipts suggests (owner approves it). */
  suggestedLabel: string | null;
  /** Label rows only: one row per id under the label (each with its own key), ₹ desc. */
  upis?: UpiRevenueRow[];
  /** Banking-name initials (RL, RG, GC, LS…) read most often on this id's receipts. Main QR ids only (a client's
   *  qrId, or a qrId* key of the upi-ids doc); null on every other id and when no name was read. */
  tag: string | null;
  rupees: number;
  payers: number;
  credits: number;
  /** Part of rupees / credits put on this id by the banking name read (no id read or matched); 0 on the other row. */
  nameRupees: number;
  nameCredits: number;
  /** rupees ÷ total rupees, 0-1 (4 dp); 0 when the total is 0. */
  share: number;
  /** Clients whose qrId is this id now. */
  qrClients: string[];
  /** Clients whose gpayId is this id now. */
  gpayClients: string[];
}

export interface UpiRevenueFold {
  rows: UpiRevenueRow[];
  total: { rupees: number; payers: number; credits: number };
  /** Credits put on an id by the banking name read (sum of the rows' nameRupees / nameCredits). */
  nameMatched: { rupees: number; credits: number };
  excluded: { fakeRupees: number; fakeCredits: number; bigRupees: number; bigCredits: number; voidedCredits: number };
  /** Distinct ids (label rows' ids included; not the other or laxmi row) with at least one counted credit. */
  idsWithCredits: number;
}

/** Lower case, spaces dropped, QR suffix after '&' dropped. */
export function normUpi(v: unknown): string {
  return String(v ?? '').trim().toLowerCase().replace(/\s+/g, '').split('&')[0];
}

/** "****" + last 4 of the local part + "@handle" (no handle: just the 4). Never more of the id. */
export function maskUpi(v: unknown): string {
  const n = normUpi(v);
  const at = n.indexOf('@');
  const local = at >= 0 ? n.slice(0, at) : n;
  const handle = at >= 0 ? n.slice(at) : '';
  return `****${local.slice(-4)}${handle}`;
}

/** Row key of a normalised id (null = the other row). Stable across refreshes and windows; not reversible to the id. */
export function upiRowKey(id: string | null): string {
  return id === null ? UPI_OTHER_KEY : `u${createHash('sha256').update(id).digest('hex').slice(0, 12)}`;
}
export const UPI_OTHER_KEY = 'other';
export const UPI_LAXMI_KEY = 'laxmi';
/** Row key of a label row: 'l' + the label (labels are 1-8 upper-case letters or digits). */
export const upiLabelKey = (label: string): string => `l${label}`;
export const UPI_ROW_KEY = /^(other|laxmi|u[0-9a-f]{12}|l[A-Z0-9]{1,8})$/;

const compact = (s: string) => s.replace(/[^a-z0-9]/g, '');

/** Levenshtein distance, early exit once every cell of a row exceeds `max`. */
function editsWithin(a: string, b: string, max: number): number {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    let best = i;
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      best = Math.min(best, cur[j]);
    }
    if (best > max) return max + 1;
    prev = cur;
  }
  return prev[b.length];
}

export interface KnownUpi {
  /** Normalised id. */
  id: string;
  local: string;
}

/** Our configured ids: every "@" string of the upi-ids doc(s) and each client's qrId / gpayId, normalised, deduped. */
export function knownUpiIds(upiDocs: Array<Record<string, unknown>>, clients: UpiClientRow[]): KnownUpi[] {
  const out = new Map<string, KnownUpi>();
  const add = (v: unknown) => {
    if (typeof v !== 'string' || !v.includes('@')) return;
    const id = normUpi(v);
    if (!id.includes('@') || out.has(id)) return;
    out.set(id, { id, local: compact(id.split('@')[0]) });
  };
  for (const d of upiDocs) for (const [k, v] of Object.entries(d || {})) if (k !== '_id') (Array.isArray(v) ? v : [v]).forEach(add);
  for (const c of clients) { add(c.qrId); add(c.gpayId); }
  return [...out.values()];
}

/** Characters apps print to hide part of an id ("bharatpe.******3302", "******3302", "paytmqr••••0101…"). */
const MASK_CHAR = /[*•·●]/;

/**
 * A receipt id printed masked (a run of '*', '•', '·', of 2+ dots, or '…' hides a run of characters): the one
 * known id whose local part the visible characters fit, in order, with UPI_MIN_PIECE+ letters or digits visible.
 * undefined = not masked (the next rule decides); null = masked but no unique fit.
 */
function maskedMatch(local: string, known: KnownUpi[]): string | null | undefined {
  if (!MASK_CHAR.test(local) && !/\.\.|…/.test(local)) return undefined;
  if (compact(local).length < UPI_MIN_PIECE) return null;
  let re = '';
  for (const m of local.matchAll(/([*•·●]+)|(\.{2,}|…+)|(\.)|([^*•·●.…]+)/g)) {
    // Apps print a fixed-width mask ("******3302" for a 19-character id), so a run hides one or more characters.
    if (m[1]) re += '.+';
    else if (m[2]) re += '.*'; // a cut ("…0101rgcf…", "sx4o...") may hide nothing
    else if (m[3]) re += '.';
    else re += m[4].replace(/[\\^$+?()[\]{}|-]/g, '\\$&');
  }
  const rx = new RegExp(`^${re}$`);
  const hits = known.filter((k) => rx.test(k.id.split('@')[0]));
  return hits.length === 1 ? hits[0].id : null;
}

/** The one known id a receipt id stands for, or null (no id read, or no unique match). */
export function matchUpi(read: unknown, known: KnownUpi[]): string | null {
  const n = normUpi(read);
  if (!n) return null;
  if (known.some((k) => k.id === n)) return n;
  const masked = maskedMatch(n.split('@')[0], known);
  if (masked !== undefined) return masked;
  // Cut ids end in "..." / "…"; the handle may be cut, misread or missing, so only the local part decides.
  const local = compact(n.split('@')[0].replace(/(\.\.\.|…).*$/, ''));
  if (local.length >= UPI_MIN_PIECE) {
    const hits = known.filter((k) => k.local.includes(local));
    if (hits.length === 1) return hits[0].id;
    if (hits.length > 1) return null;
  }
  if (local.length >= UPI_MIN_EDIT_LEN) {
    let best = UPI_MAX_EDITS + 1;
    let hit: KnownUpi[] = [];
    for (const k of known) {
      const d = editsWithin(local, k.local, UPI_MAX_EDITS);
      if (d < best) { best = d; hit = [k]; } else if (d === best) hit.push(k);
    }
    if (best <= UPI_MAX_EDITS && hit.length === 1) return hit[0].id;
  }
  return null;
}

/** upi-ids doc keys that hold a main QR id ("qrId", "qrId1", …). */
const MAIN_QR_KEY = /^qrid\d*$/i;

/** Main QR ids, normalised: every client's qrId now and every qrId* value of the upi-ids doc(s). Only these get a tag. */
export function mainQrIds(upiDocs: Array<Record<string, unknown>>, clients: UpiClientRow[]): Set<string> {
  const out = new Set<string>();
  const add = (v: unknown) => { if (typeof v === 'string' && v.includes('@')) out.add(normUpi(v)); };
  for (const d of upiDocs) for (const [k, v] of Object.entries(d || {})) if (MAIN_QR_KEY.test(k)) (Array.isArray(v) ? v : [v]).forEach(add);
  for (const c of clients) add(c.qrId);
  return out;
}

/** Initials of the banking name in a payee name read ("Mrs RAVVA LAKSHMI" → "RL"), or null. */
export function bankingTag(name: unknown): string | null {
  const lower = String(name ?? '').toLowerCase().replace(/\s+/g, '');
  const n = storeForm(compact(lower));
  if (!n) return null;
  const hit = NAME_FORMS.find((f) => f.forms.some((form) => n.includes(form)))?.tag;
  if (hit) return hit;
  // Seen cut-off form (tg-aut paid-to-us.ts SEEN_CUT_OFF_NAMES): counts only right before "..." / "…".
  return /ravvalaksh(\.\.\.|…)/.test(lower) ? 'RL' : null;
}

/**
 * Account (banking-name tag) of each known id, read from its matched receipts: the one name read on them, when every
 * name read agrees and it was read UPI_ACCOUNT_MIN_READS+ times. Ids with no such name have no account.
 */
export function accountsOfIds(proofs: UpiProofRow[], known: KnownUpi[], minReads = UPI_ACCOUNT_MIN_READS): Map<string, string> {
  const reads = new Map<string, Map<string, number>>();
  for (const r of proofs) {
    const tag = bankingTag(r.payeeName);
    if (!tag) continue;
    const id = matchUpi(r.payeeUpiId, known);
    if (id === null) continue;
    const m = reads.get(id) ?? new Map<string, number>();
    m.set(tag, (m.get(tag) ?? 0) + 1);
    reads.set(id, m);
  }
  const out = new Map<string, string>();
  for (const [id, m] of reads) {
    const [only] = [...m.entries()];
    if (m.size === 1 && only[1] >= minReads) out.set(id, only[0]);
  }
  return out;
}

/**
 * The id a name-only credit goes to: the client's current qrId if on the account, else its gpayId if on the account,
 * else the account's one id. null when the account has several ids and the client is on none, or has none.
 */
export function nameMatchedId(tag: string, client: UpiClientRow | undefined, accounts: Map<string, string>): string | null {
  for (const v of [client?.qrId, client?.gpayId]) {
    if (typeof v !== 'string' || !v.includes('@')) continue;
    const id = normUpi(v);
    if (accounts.get(id) === tag) return id;
  }
  const ids = [...accounts.entries()].filter(([, t]) => t === tag).map(([id]) => id);
  return ids.length === 1 ? ids[0] : null;
}

export function creditOf(r: UpiProofRow): number {
  const v = Number(r.creditAmount ?? r.amount ?? 0);
  return Number.isFinite(v) ? v : 0;
}

interface Acc { rupees: number; credits: number; nameRupees: number; nameCredits: number; payers: Set<string>; tags: Map<string, number> }
const newAcc = (): Acc => ({ rupees: 0, credits: 0, nameRupees: 0, nameCredits: 0, payers: new Set<string>(), tags: new Map<string, number>() });

/**
 * Folds credited proof rows into one row per id. Every id that is some client's qrId now is listed even at ₹0
 * (it shows where clients point); gpay / listed ids only when they took a credit. Sorted by ₹ desc, the other
 * row last.
 */
export interface UpiFoldInput {
  proofs: UpiProofRow[];
  /** Receipts the id accounts are read from (the last 7 days); default `proofs`. */
  accountProofs?: UpiProofRow[];
  fakeChats: Set<string>;
  upiDocs: Array<Record<string, unknown>>;
  clients: UpiClientRow[];
  /** upi-labels rows ({ upiId, label }); none = no label rows. */
  labels?: UpiLabelRow[];
}

export function foldUpiRevenue(input: UpiFoldInput): UpiRevenueFold {
  return foldUpiRevenueWithCredits(input).fold;
}

/** One counted credit and the row it went to (internal; the drill-down maps it to UpiRevenueItem). */
export interface UpiCountedCredit {
  /** Key of the id row (or 'other' / 'laxmi'). */
  key: string;
  /** Key of the top-level row it is shown under: the label row of its id, else `key`. */
  row: string;
  proof: UpiProofRow;
  rupees: number;
  /** 'id' = the payee id read matched one of ours; 'name' = put on the id by the banking name read; 'none' = other row. */
  match: 'id' | 'name' | 'none';
}

/** The fold plus every credit it counted, each with its row key: the credits of a row sum to its ₹ and count. */
export function foldUpiRevenueWithCredits(input: UpiFoldInput): { fold: UpiRevenueFold; credits: UpiCountedCredit[] } {
  const known = knownUpiIds(input.upiDocs, input.clients);
  const qrOf = new Map<string, string[]>();
  const gpayOf = new Map<string, string[]>();
  for (const c of input.clients) {
    if (!c.clientId) continue;
    for (const [field, map] of [['qrId', qrOf], ['gpayId', gpayOf]] as const) {
      const v = c[field];
      if (typeof v !== 'string' || !v.includes('@')) continue;
      const id = normUpi(v);
      map.set(id, [...(map.get(id) ?? []), c.clientId]);
    }
  }
  const mainQr = mainQrIds(input.upiDocs, input.clients);
  const accounts = accountsOfIds(input.accountProofs ?? input.proofs, known);
  const suggestions = accountsOfIds(input.accountProofs ?? input.proofs, known, 1);
  const labelOf = labelsOfIds(input.labels);
  const clientById = new Map<string, UpiClientRow>();
  for (const c of input.clients) if (c.clientId) clientById.set(c.clientId, c);
  const nameMatched = { rupees: 0, credits: 0 };
  const excluded = { fakeRupees: 0, fakeCredits: 0, bigRupees: 0, bigCredits: 0, voidedCredits: 0 };
  const acc = new Map<string | null, Acc>();
  const laxmi = newAcc();
  const counted: UpiCountedCredit[] = [];
  const allPayers = new Set<string>();
  let rupees = 0;
  let credits = 0;
  for (const r of input.proofs) {
    if (r.uncredited?.state === 'done') { excluded.voidedCredits++; continue; }
    const amt = creditOf(r);
    const chat = String(r.chatId ?? '');
    if (input.fakeChats.has(chat)) { excluded.fakeRupees += amt; excluded.fakeCredits++; continue; }
    if (amt >= UPI_BIG_CREDIT) { excluded.bigRupees += amt; excluded.bigCredits++; continue; }
    allPayers.add(chat);
    rupees += amt;
    credits++;
    if (isLaxmiName(r.payeeName)) {
      laxmi.rupees += amt;
      laxmi.credits++;
      laxmi.payers.add(chat);
      counted.push({ key: UPI_LAXMI_KEY, row: UPI_LAXMI_KEY, proof: r, rupees: amt, match: 'none' });
      continue;
    }
    const tag = bankingTag(r.payeeName);
    let key = matchUpi(r.payeeUpiId, known);
    const byName = key === null && tag !== null && (key = nameMatchedId(tag, clientById.get(String(r.clientId ?? '')), accounts)) !== null;
    const a = acc.get(key) ?? newAcc();
    a.rupees += amt;
    a.credits++;
    if (byName) { a.nameRupees += amt; a.nameCredits++; nameMatched.rupees += amt; nameMatched.credits++; }
    a.payers.add(chat);
    if (tag) a.tags.set(tag, (a.tags.get(tag) ?? 0) + 1);
    acc.set(key, a);
    const label = key === null ? undefined : labelOf.get(key);
    counted.push({ key: upiRowKey(key), row: label ? upiLabelKey(label) : upiRowKey(key), proof: r, rupees: amt, match: key === null ? 'none' : byName ? 'name' : 'id' });
  }
  for (const id of qrOf.keys()) if (!acc.has(id)) acc.set(id, newAcc());
  const share = (v: number) => (rupees > 0 ? Math.round((v / rupees) * 10_000) / 10_000 : 0);
  const rows: UpiRevenueRow[] = [...acc.entries()].map(([id, a]) => {
    const tag = [...a.tags.entries()].sort((x, y) => y[1] - x[1] || x[0].localeCompare(y[0]))[0]?.[0] ?? null;
    return {
      key: upiRowKey(id),
      id: id === null ? null : maskUpi(id),
      kind: id === null ? 'other' : qrOf.has(id) ? 'qr' : gpayOf.has(id) ? 'gpay' : 'listed',
      tag: id !== null && mainQr.has(id) ? tag : null,
      label: id === null ? null : labelOf.get(id) ?? null,
      suggestedLabel: id === null || labelOf.has(id) ? null : suggestions.get(id) ?? null,
      rupees: a.rupees,
      payers: a.payers.size,
      credits: a.credits,
      nameRupees: a.nameRupees,
      nameCredits: a.nameCredits,
      share: share(a.rupees),
      qrClients: id === null ? [] : [...(qrOf.get(id) ?? [])].sort(),
      gpayClients: id === null ? [] : [...(gpayOf.get(id) ?? [])].sort(),
    };
  });
  // Two ids with the same last 4 and handle ("lakshmistores@airtel", "stores@airtel") stay apart: the local-part length is added.
  const byMask = new Map<string, number>();
  for (const r of rows) if (r.id) byMask.set(r.id, (byMask.get(r.id) ?? 0) + 1);
  for (const [i, [id]] of [...acc.entries()].entries()) {
    const r = rows[i];
    if (id !== null && r.id && (byMask.get(r.id) ?? 0) > 1) r.id = `${r.id} (${id.split('@')[0].length} ch)`;
  }
  const idsWithCredits = rows.filter((r) => r.kind !== 'other' && r.credits > 0).length;
  // Rows of one label collapse into one row; payers are distinct chats over all its ids.
  const ids = [...acc.keys()];
  const byLabel = new Map<string, { subs: UpiRevenueRow[]; payers: Set<string> }>();
  const top: UpiRevenueRow[] = [];
  rows.forEach((r, i) => {
    if (!r.label) { top.push(r); return; }
    const g = byLabel.get(r.label) ?? { subs: [], payers: new Set<string>() };
    g.subs.push(r);
    acc.get(ids[i])!.payers.forEach((c) => g.payers.add(c));
    byLabel.set(r.label, g);
  });
  const byRs = (x: UpiRevenueRow, y: UpiRevenueRow) => y.rupees - x.rupees || y.credits - x.credits || String(x.id).localeCompare(String(y.id));
  for (const [label, g] of byLabel) {
    const sum = (f: (r: UpiRevenueRow) => number) => g.subs.reduce((s, r) => s + f(r), 0);
    const rs = sum((r) => r.rupees);
    const union = (f: (r: UpiRevenueRow) => string[]) => [...new Set(g.subs.flatMap(f))].sort();
    top.push({
      key: upiLabelKey(label), id: null, kind: 'label', tag: label, label, suggestedLabel: null,
      rupees: rs, payers: g.payers.size, credits: sum((r) => r.credits), nameRupees: sum((r) => r.nameRupees), nameCredits: sum((r) => r.nameCredits),
      share: share(rs), qrClients: union((r) => r.qrClients), gpayClients: union((r) => r.gpayClients), upis: [...g.subs].sort(byRs),
    });
  }
  if (laxmi.credits > 0) {
    top.push({
      key: UPI_LAXMI_KEY, id: null, kind: 'laxmi', tag: null, label: null, suggestedLabel: null, rupees: laxmi.rupees, payers: laxmi.payers.size,
      credits: laxmi.credits, nameRupees: 0, nameCredits: 0, share: share(laxmi.rupees), qrClients: [], gpayClients: [],
    });
  }
  const tail = (r: UpiRevenueRow) => (r.kind === 'other' ? 2 : r.kind === 'laxmi' ? 1 : 0);
  top.sort((x, y) => tail(x) - tail(y) || byRs(x, y));
  const fold: UpiRevenueFold = {
    rows: top,
    total: { rupees, payers: allPayers.size, credits },
    nameMatched,
    excluded,
    idsWithCredits,
  };
  return { fold, credits: counted };
}

/** One credit of a row, as GET /monitor/upi-revenue/items sends it. Ids masked; no payee name, no image or ocr. */
export interface UpiRevenueItem {
  proofId: string | null;
  clientId: string;
  chatId: string;
  profile: string | null;
  telegramMsgId: number | null;
  /** ISO times; servedAt is when the credit was given. */
  servedAt: string | null;
  createdAt: string | null;
  /** The credited ₹ this row counts (creditAmount, else amount). */
  rupees: number;
  match: 'id' | 'name' | 'none';
  /** The payee id read, masked ("****3302@fbpe"); null when none was read. */
  payeeUpi: string | null;
  /** Initials of our banking name read (RL, GC…); null when none of ours was read. */
  payeeTag: string | null;
  /** A payee name was read at all (ours or not). The name itself is never sent. */
  payeeNameRead: boolean;
  /** Row from before tg-aut wrote verdicts (no archived screenshot). */
  legacy: boolean;
  /** clients.repl of the proof's client (serves the screenshot); null when unknown. */
  clientHost: string | null;
  /** userData username of the chat (filled by the service); null when none. */
  username: string | null;
}

const iso = (v: unknown): string | null => {
  if (v === null || v === undefined || v === '') return null;
  const t = new Date(v as string).getTime();
  return Number.isFinite(t) ? new Date(t).toISOString() : null;
};

/** The credits of one row (by key: a top-level row, or an id row inside a label row), newest credit first. Their rupees
 *  sum to the row's ₹ and their count to its credits. */
export function upiRowItems(credits: UpiCountedCredit[], key: string, hosts: Map<string, string> = new Map()): UpiRevenueItem[] {
  return credits
    .filter((c) => c.key === key || c.row === key)
    .map(({ proof: r, rupees, match }) => {
      const read = normUpi(r.payeeUpiId);
      const tel = Number(r.telegramMsgId);
      return {
        proofId: typeof r.proofId === 'string' && r.proofId ? r.proofId : null,
        clientId: String(r.clientId ?? ''),
        chatId: String(r.chatId ?? ''),
        profile: typeof r.profile === 'string' && r.profile ? r.profile : null,
        telegramMsgId: Number.isInteger(tel) && tel > 0 ? tel : null,
        servedAt: iso(r.servedAt),
        createdAt: iso(r.createdAt),
        rupees,
        match,
        payeeUpi: read ? maskUpi(read) : null,
        payeeTag: bankingTag(r.payeeName),
        payeeNameRead: String(r.payeeName ?? '').trim() !== '',
        legacy: !(typeof r.verdict?.outcome === 'string' && r.verdict.outcome),
        clientHost: hosts.get(String(r.clientId ?? '')) ?? null,
        username: null,
      };
    })
    .sort((a, b) => (Date.parse(b.servedAt ?? '') || 0) - (Date.parse(a.servedAt ?? '') || 0) || String(a.proofId).localeCompare(String(b.proofId)));
}
