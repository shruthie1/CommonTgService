import Imap from 'imap';
import { parseError } from '../utils/parseError';
import { Logger } from '../utils/logger';
import { InMemoryMailboxLock, MailboxLock, RedisMailboxLock } from './mailbox-lock';

const DEFAULT_IMAP_CONNECT_TIMEOUT_MS = 30_000;
const TELEGRAM_SENDER = 'noreply@telegram.org';
/**
 * Secondary check on the Date header (when Telegram SENT the mail, not when Gmail received it).
 * A code mailed for an earlier attempt and delivered late has a Date before this attempt's request.
 * The UID snapshot is the primary filter; this only catches late deliveries that land after it.
 */
const SENT_BEFORE_REQUEST_SKEW_MS = 45_000;
const MAX_CANDIDATES_PER_POLL = 20;
const MAX_PART_BYTES = 64 * 1024;
/** Cross-process lock: held for one whole set2fa attempt (connect + request + polls + confirm). */
const MAILBOX_LOCK_TTL_MS = 5 * 60_000;
const MAILBOX_LOCK_WAIT_MS = 3 * 60_000;
const MAILBOX_LOCK_RETRY_MS = 2_000;

const logger = new Logger('MailReader');

export interface MailboxSnapshot {
    /** Only mails with UID >= sinceUid can belong to the attempt that took this snapshot. */
    sinceUid: number;
    uidValidity: number;
}

export interface MailCodeLookupOptions {
    snapshot: MailboxSnapshot;
    expectedLength?: number;
    /** Taken just before Telegram is asked to send the code. */
    requestStartedAt?: Date;
    /** Masked mobile for log lines. */
    logTag?: string;
}

export type TelegramEmailRejectReason = 'recovery_email' | 'not_2fa_email' | 'no_code' | 'length_mismatch' | 'ambiguous';
export type TelegramEmailParse = { code: string } | { reason: TelegramEmailRejectReason };

// Telegram's 2FA email (sample read from the inbox 2026-11-23, digits redacted):
//   Subject: Your Code - NNNNNN
//   Your code is: NNNNNN. Use it to verify your email and activate two-step verification in Telegram Messenger.
// The same sender also mails the same inbox password-RECOVERY codes (10-29 a day):
//   Subject: Your Recovery Code - NNNNNN
//   Your code is: NNNNNN. Use it to disable your password and access your Telegram account.
// Neither names the account or phone, so the account cannot be matched from the mail.
const CODE_LINE_PATTERN = /your code is:?\s*(\d+)\b/gi;
const SUBJECT_CODE_PATTERN = /^\s*your code\s*-\s*(\d+)\s*$/i;
const TWO_STEP_PATTERN = /\b(two|2)[- ]?step verification\b/i;

/** Text (plain, or HTML with tags stripped) + subject of one Telegram mail → the 2FA code, or why there is none. Never guesses. */
export function parseTelegram2faEmail(subject: string, body: string, expectedLength?: number): TelegramEmailParse {
    const text = body.replace(/\r\n/g, '\n');
    if (/recovery code/i.test(subject) || /disable your password/i.test(text)) return { reason: 'recovery_email' };
    // Wording seen 2026-11: "two-step verification"; also accept "2-Step"/"two step" variants.
    if (!TWO_STEP_PATTERN.test(text)) return { reason: 'not_2fa_email' };

    const bodyCodes = Array.from(text.matchAll(CODE_LINE_PATTERN), (m) => m[1]);
    if (bodyCodes.length === 0) return { reason: 'no_code' };
    const subjectCode = subject.match(SUBJECT_CODE_PATTERN)?.[1];
    const distinct = new Set(subjectCode ? [...bodyCodes, subjectCode] : bodyCodes);
    if (distinct.size > 1) return { reason: 'ambiguous' };

    const code = bodyCodes[0];
    if (code.length < 4 || code.length > 8) return { reason: 'no_code' };
    if (expectedLength && code.length !== expectedLength) return { reason: 'length_mismatch' };
    return { code };
}

function headerValue(headerText: string, name: string): string {
    const unfolded = headerText.replace(/\r?\n[ \t]+/g, ' ');
    const match = unfolded.match(new RegExp(`^${name}:\\s*(.*)$`, 'im'));
    return match ? match[1].trim() : '';
}

function parseMailDate(value: string): Date | null {
    if (!value) return null;
    const parsed = new Date(value.replace(/\s*\([^)]*\)\s*$/, ''));
    return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function leafParts(struct: unknown, out: any[] = []): any[] {
    if (Array.isArray(struct)) {
        for (const item of struct) leafParts(item, out);
    } else if (struct && typeof struct === 'object' && (struct as any).partID) {
        out.push(struct);
    }
    return out;
}

/** The text/plain part, else the text/html part (first of each in MIME order), else null. */
export function pickTextPart(struct: unknown): { partID: string; html: boolean; encoding?: string } | null {
    const parts = leafParts(struct).filter((p) => String(p.type).toLowerCase() === 'text');
    const plain = parts.find((p) => String(p.subtype).toLowerCase() === 'plain');
    if (plain) return { partID: String(plain.partID), html: false, encoding: plain.encoding };
    const html = parts.find((p) => String(p.subtype).toLowerCase() === 'html');
    if (html) return { partID: String(html.partID), html: true, encoding: html.encoding };
    return null;
}

const HTML_DROP_BLOCKS = new Set(['style', 'script', 'head']);
const HTML_LINE_BREAK_TAGS = /^(br|\/p|\/div|\/tr|\/li|\/h\d)$/;

/**
 * HTML → visible text in one linear pass: drops style/script/head blocks (colour codes live there)
 * and tags, then decodes common entities. Each '<' looks for its '>' once; when none is left the
 * scan stops, so hostile input (e.g. 64 KB of '<') stays linear.
 */
export function htmlToText(html: string): string {
    const lower = html.toLowerCase();
    let out = '';
    let i = 0;
    while (i < html.length) {
        const lt = html.indexOf('<', i);
        if (lt === -1) {
            out += html.slice(i);
            break;
        }
        out += html.slice(i, lt);
        const gt = html.indexOf('>', lt + 1);
        if (gt === -1) break; // unterminated tag: nothing after it is visible text
        const name = (lower.slice(lt + 1, gt).match(/^\/?[a-z0-9]+/) || [''])[0];
        if (HTML_DROP_BLOCKS.has(name)) {
            const close = lower.indexOf(`</${name}`, gt + 1);
            if (close === -1) break;
            const closeEnd = html.indexOf('>', close);
            if (closeEnd === -1) break;
            out += ' ';
            i = closeEnd + 1;
            continue;
        }
        out += HTML_LINE_BREAK_TAGS.test(name) ? '\n' : ' ';
        i = gt + 1;
    }
    return out
        .replace(/&nbsp;/gi, ' ')
        .replace(/&#(\d{1,7});/g, (_, n) => String.fromCharCode(Number(n)))
        .replace(/&#x([0-9a-f]{1,6});/gi, (_, n) => String.fromCharCode(parseInt(n, 16)))
        .replace(/&quot;/gi, '"')
        .replace(/&apos;|&#39;/gi, "'")
        .replace(/&lt;/gi, '<')
        .replace(/&gt;/gi, '>')
        .replace(/&amp;/gi, '&')
        .replace(/[ \t]+/g, ' ');
}

function decodePart(raw: string, encoding: string | undefined): string {
    const enc = String(encoding || '').toUpperCase();
    if (enc === 'BASE64') return Buffer.from(raw.replace(/\s+/g, ''), 'base64').toString('utf8');
    if (enc === 'QUOTED-PRINTABLE') {
        const bytes = raw.replace(/=\r?\n/g, '').replace(/=([0-9A-F]{2})/gi, (_, hex) => String.fromCharCode(parseInt(hex, 16)));
        return Buffer.from(bytes, 'latin1').toString('utf8');
    }
    return raw;
}

function redactDigits(value: string): string {
    return value.replace(/\d/g, 'N').replace(/\s+/g, '_').slice(0, 60);
}

export function emailCodeLog(kind: string, fields: Record<string, string | number | undefined>): void {
    const rest = Object.entries(fields)
        .filter(([, v]) => v !== undefined && v !== '')
        .map(([k, v]) => `${k}=${v}`)
        .join(' ');
    const line = `email-code kind=${kind}${rest ? ` ${rest}` : ''}`;
    const info = kind === 'picked' || kind === 'snapshot' || kind === 'none' || (kind === 'lock' && fields.reason !== 'redis_unavailable_proceed');
    if (info) logger.log(line);
    else logger.warn(line);
}

export class EmailCodeError extends Error {
    constructor(public readonly reason: string, detail: string) {
        super(`${reason}: ${detail}`);
        this.name = 'EmailCodeError';
    }
}

interface FetchedMail {
    uid: number;
    header: string;
    struct: unknown;
    /** Chosen text part (plain preferred, HTML fallback) and its raw body. */
    part: { partID: string; html: boolean; encoding?: string } | null;
    body: string;
}

export class MailReader {
    private static instance: MailReader;
    private imap: Imap | null = null;
    private isReady: boolean = false;
    private connectPromise: Promise<void> | null = null;
    private mailboxQueue: Promise<void> = Promise.resolve();

    private constructor(
        private readonly imapFactory: () => Imap = () => new Imap({
            user: process.env.GMAIL_ADD || '',
            password: process.env.GMAIL_PASS || '',
            host: 'imap.gmail.com',
            port: 993,
            tls: true,
            tlsOptions: {
                rejectUnauthorized: false,
            },
        }),
        private readonly sharedLock: MailboxLock = new RedisMailboxLock(),
    ) {}

    /** Tests: pass the same InMemoryMailboxLock to two readers to model two processes sharing one Redis key. */
    public static createForTest(imapFactory: () => Imap, sharedLock: MailboxLock = new InMemoryMailboxLock()): MailReader {
        return new MailReader(imapFactory, sharedLock);
    }

    private ensureImap(): Imap {
        if (this.imap) {
            return this.imap;
        }

        const imap = this.imapFactory();
        imap.on('ready', () => {
            console.log('Mail is Ready');
            this.isReady = true;
        });

        imap.on('error', (err: Error) => {
            console.error('SomeError:', err);
            this.isReady = false;
        });

        imap.on('end', () => {
            console.log('Connection ended');
            this.isReady = false;
        });
        this.imap = imap;
        return imap;
    }

    public static getInstance(): MailReader {
        if (!MailReader.instance) {
            MailReader.instance = new MailReader();
        }
        return MailReader.instance;
    }

    /**
     * One mailbox user at a time: first within this process (queue), then across processes (shared
     * lock). If the lock store is down, the attempt proceeds without the cross-process lock: the UID
     * snapshot and the ambiguity check still stop a wrong code, and set2fa keeps working.
     */
    public async runExclusive<T>(operation: () => Promise<T>, logTag?: string): Promise<T> {
        let releaseLock: (() => void) | null = null;
        const previous = this.mailboxQueue;
        this.mailboxQueue = new Promise<void>((resolve) => {
            releaseLock = resolve;
        });

        await previous;
        try {
            const token = await this.acquireSharedLock(logTag);
            try {
                return await operation();
            } finally {
                if (token) {
                    try {
                        await this.sharedLock.release(token);
                    } catch (err) {
                        // The TTL frees it anyway; a failed release only delays the next attempt.
                        emailCodeLog('failed', { reason: 'lock_release_failed', mobile: logTag, error: redactDigits(err instanceof Error ? err.message : String(err)) });
                    }
                }
            }
        } finally {
            releaseLock?.();
        }
    }

    /**
     * Token when held; null when the lock store is unavailable on the FIRST try (proceed unlocked).
     * Throws EMAIL_LOCK_BUSY when another process holds it past the wait, or when the store fails
     * after a try already saw it held.
     */
    private async acquireSharedLock(logTag?: string): Promise<string | null> {
        const deadline = Date.now() + MAILBOX_LOCK_WAIT_MS;
        let waited = false;
        for (;;) {
            let token: string | null;
            try {
                token = await this.sharedLock.tryAcquire(MAILBOX_LOCK_TTL_MS);
            } catch (err) {
                if (waited) {
                    // Another process held the lock on an earlier try: its code request may be in
                    // flight. Never run unlocked beside it.
                    emailCodeLog('failed', { reason: 'lock_busy_redis_lost', mobile: logTag });
                    throw new EmailCodeError('EMAIL_LOCK_BUSY', `lock was held elsewhere, then the lock store failed: ${err instanceof Error ? err.message : String(err)}`);
                }
                emailCodeLog('lock', {
                    reason: 'redis_unavailable_proceed',
                    mobile: logTag,
                    error: redactDigits(err instanceof Error ? err.message : String(err)),
                });
                return null;
            }
            if (token) {
                if (waited) emailCodeLog('lock', { reason: 'acquired_after_wait', mobile: logTag });
                return token;
            }
            if (Date.now() >= deadline) {
                emailCodeLog('failed', { reason: 'lock_busy', mobile: logTag });
                throw new EmailCodeError('EMAIL_LOCK_BUSY', `another process held the 2FA mailbox for ${MAILBOX_LOCK_WAIT_MS / 1000}s`);
            }
            if (!waited) emailCodeLog('lock', { reason: 'waiting', mobile: logTag });
            waited = true;
            await new Promise((resolve) => setTimeout(resolve, MAILBOX_LOCK_RETRY_MS));
        }
    }

    public async connectToMail(timeoutMs: number = DEFAULT_IMAP_CONNECT_TIMEOUT_MS): Promise<void> {
        console.log('Connecting to mail server');
        if (this.isReady && this.imap) {
            return;
        }
        if (this.connectPromise) {
            return this.connectPromise;
        }

        const imap = this.ensureImap();
        this.isReady = false;

        this.connectPromise = new Promise<void>((resolve, reject) => {
            let timeoutHandle: NodeJS.Timeout | null = null;

            const cleanup = () => {
                imap.removeListener('ready', onReady);
                imap.removeListener('error', onError);
                imap.removeListener('end', onEndBeforeReady);
                if (timeoutHandle) {
                    clearTimeout(timeoutHandle);
                }
            };

            const onReady = () => {
                cleanup();
                console.log('Mail connect() completed');
                resolve();
            };

            const onError = (err: Error) => {
                cleanup();
                this.imap = null;
                reject(new Error(`Mail connection failed: ${parseError(err)}`));
            };

            const onEndBeforeReady = () => {
                cleanup();
                this.imap = null;
                reject(new Error('Mail connection ended before ready'));
            };

            timeoutHandle = setTimeout(() => {
                cleanup();
                this.imap = null;
                reject(new Error(`Mail server connection timed out after ${timeoutMs}ms`));
            }, timeoutMs);

            imap.once('ready', onReady);
            imap.once('error', onError);
            imap.once('end', onEndBeforeReady);

            try {
                imap.connect();
                console.log('Mail connect() initiated — waiting for ready event');
            } catch (err) {
                cleanup();
                this.imap = null;
                reject(err);
            }
        }).finally(() => {
            this.connectPromise = null;
        });

        return this.connectPromise;
    }

    public async disconnectFromMail(): Promise<void> {
        console.log('Disconnecting from mail server');
        const imap = this.imap;
        this.imap = null;
        this.isReady = false;
        this.connectPromise = null;

        if (!imap) {
            console.log('Mail server already disconnected');
            return;
        }

        try {
            await new Promise<void>((resolve) => {
                let settled = false;
                const finish = () => {
                    if (settled) return;
                    settled = true;
                    imap.removeListener('end', finish);
                    imap.removeListener('error', finish);
                    resolve();
                };

                imap.once('end', finish);
                imap.once('error', finish);

                try {
                    imap.end();
                } catch (err) {
                    console.error('Error disconnecting from mail server:', parseError(err));
                    finish();
                    return;
                }

                setTimeout(finish, 5000);
            });
            console.log('Disconnected from mail server');
        } catch (err) {
            /* istanbul ignore next -- the inner disconnect promise only ever resolves (errors are swallowed by finish()); this catch is defensive and unreachable from tests */
            console.error('Error disconnecting from mail server:', parseError(err));
            /* istanbul ignore next -- see above */
            throw err;
        }
    }

    public async isMailReady(): Promise<boolean> {
        return this.isReady;
    }

    /**
     * Take BEFORE asking Telegram for a code. Every mail that can carry this attempt's code gets a
     * UID >= sinceUid; a leftover code from an earlier attempt (timed out, failed, or delivered late
     * before this point) has a lower UID and is never read.
     */
    public async snapshotMailbox(logTag?: string): Promise<MailboxSnapshot> {
        if (!this.isReady || !this.imap) {
            throw new Error('Mail server is not ready');
        }
        try {
            const box = await this.openInbox();
            let sinceUid = Number(box?.uidnext) || 0;
            if (!sinceUid) {
                // Server sent no UIDNEXT: fall back to one past the highest Telegram mail.
                const uids = await this.search([['FROM', TELEGRAM_SENDER]]);
                sinceUid = (uids.length ? Math.max(...uids) : 0) + 1;
            }
            const snapshot = { sinceUid, uidValidity: Number(box?.uidvalidity) || 0 };
            emailCodeLog('snapshot', { mobile: logTag, uid: sinceUid });
            return snapshot;
        } catch (error) {
            this.isReady = false;
            emailCodeLog('failed', { reason: 'snapshot_failed', mobile: logTag });
            throw new EmailCodeError('EMAIL_SNAPSHOT_FAILED', error instanceof Error ? error.message : String(error));
        }
    }

    /**
     * The 2FA code from a Telegram mail that arrived after `snapshot`, or null when none has arrived
     * yet. Throws EMAIL_CODE_AMBIGUOUS when fresh mails carry different codes (it cannot know which
     * is ours, so it submits none). Deletes only the picked mail, by UID.
     */
    public async getCode(options: MailCodeLookupOptions): Promise<string | null> {
        if (!this.isReady || !this.imap) {
            throw new Error('Mail server is not ready');
        }
        const { snapshot, expectedLength, requestStartedAt, logTag } = options;
        if (!snapshot || !Number.isFinite(snapshot.sinceUid) || snapshot.sinceUid <= 0) {
            throw new Error('getCode needs a mailbox snapshot taken before the code was requested');
        }

        try {
            const box = await this.openInbox();
            const uidValidity = Number(box?.uidvalidity) || 0;
            if (snapshot.uidValidity && uidValidity && uidValidity !== snapshot.uidValidity) {
                emailCodeLog('failed', { reason: 'uidvalidity_changed', mobile: logTag });
                throw new EmailCodeError('EMAIL_UIDVALIDITY_CHANGED', 'mailbox UIDs were reset since the snapshot');
            }

            // IMAP "n:*" also returns the highest existing UID when it is below n: filter client-side.
            const found = await this.search([['FROM', TELEGRAM_SENDER], ['UID', `${snapshot.sinceUid}:*`]]);
            const uids = found.filter((uid) => uid >= snapshot.sinceUid).sort((a, b) => b - a).slice(0, MAX_CANDIDATES_PER_POLL);
            if (uids.length === 0) {
                emailCodeLog('none', { reason: 'no_new_mail', mobile: logTag, uid: snapshot.sinceUid });
                return null;
            }

            const mails = await this.fetchMails(uids);
            const accepted: Array<{ uid: number; code: string }> = [];
            for (const mail of mails) {
                const verdict = this.judgeMail(mail, snapshot, expectedLength, requestStartedAt);
                if ('code' in verdict) {
                    accepted.push({ uid: mail.uid, code: verdict.code });
                } else {
                    emailCodeLog('rejected', { reason: verdict.reason, mobile: logTag, uid: mail.uid, subject: verdict.subject });
                }
            }

            if (accepted.length === 0) {
                emailCodeLog('none', { reason: 'no_valid_mail', mobile: logTag, uid: snapshot.sinceUid });
                return null;
            }
            const distinct = new Set(accepted.map((a) => a.code));
            if (distinct.size > 1) {
                emailCodeLog('ambiguous', { reason: 'ambiguous', mobile: logTag, uid: accepted.map((a) => a.uid).join(',') });
                throw new EmailCodeError('EMAIL_CODE_AMBIGUOUS', `${accepted.length} fresh 2FA mails carry ${distinct.size} different codes`);
            }

            const pick = accepted.sort((a, b) => b.uid - a.uid)[0];
            try {
                await this.deleteMessage(pick.uid);
            } catch (deleteError) {
                // The code is valid; the UID snapshot already stops any later attempt reusing it.
                emailCodeLog('delete_failed', {
                    mobile: logTag,
                    uid: pick.uid,
                    error: redactDigits(deleteError instanceof Error ? deleteError.message : String(deleteError)),
                });
            }
            emailCodeLog('picked', { mobile: logTag, uid: pick.uid });
            return pick.code;
        } catch (error) {
            if (!(error instanceof EmailCodeError)) {
                console.error('Mail read error:', parseError(error, '', false)?.message);
                this.isReady = false;
            }
            throw error;
        }
    }

    private judgeMail(
        mail: FetchedMail,
        snapshot: MailboxSnapshot,
        expectedLength?: number,
        requestStartedAt?: Date,
    ): { code: string } | { reason: string; subject?: string } {
        const subject = headerValue(mail.header, 'Subject');
        // Every rejection carries the subject (digits → N) so a Telegram format change shows in logs.
        const shownSubject = redactDigits(subject) || '(none)';
        if (!(mail.uid >= snapshot.sinceUid)) return { reason: 'stale_uid', subject: shownSubject };
        if (!headerValue(mail.header, 'From').toLowerCase().includes(TELEGRAM_SENDER)) return { reason: 'not_telegram', subject: shownSubject };

        if (!mail.part) return { reason: 'no_text_part', subject: shownSubject };
        const decoded = decodePart(mail.body, mail.part.encoding);
        const parsed = parseTelegram2faEmail(subject, mail.part.html ? htmlToText(decoded) : decoded, expectedLength);
        if ('reason' in parsed) return { reason: parsed.reason, subject: shownSubject };

        const sentAt = parseMailDate(headerValue(mail.header, 'Date'));
        if (requestStartedAt && sentAt && sentAt.getTime() < requestStartedAt.getTime() - SENT_BEFORE_REQUEST_SKEW_MS) {
            return { reason: 'sent_before_request', subject: shownSubject };
        }
        return { code: parsed.code };
    }

    private async search(criteria: any[]): Promise<number[]> {
        return new Promise<number[]>((resolve, reject) => {
            this.imap!.search(criteria, (err, foundResults) => {
                if (err) {
                    console.error('Search error:', parseError(err, '', false)?.message);
                    reject(err);
                } else {
                    resolve(foundResults || []);
                }
            });
        });
    }

    /**
     * UID FETCH, PEEK only (markSeen false), in two rounds: headers + MIME structure, then the one
     * text part chosen from the structure (text/plain, else text/html).
     */
    private async fetchMails(uids: number[]): Promise<FetchedMail[]> {
        const heads = await this.fetchRaw(uids, ['HEADER.FIELDS (FROM SUBJECT DATE)'], true);
        const mails: FetchedMail[] = heads.map((h) => ({
            uid: h.uid,
            header: h.bodies.HEADER || '',
            struct: h.struct,
            part: pickTextPart(h.struct),
            body: '',
        }));

        const byPart = new Map<string, FetchedMail[]>();
        for (const mail of mails) {
            if (!mail.part) continue;
            const group = byPart.get(mail.part.partID) || [];
            group.push(mail);
            byPart.set(mail.part.partID, group);
        }
        for (const [partID, group] of byPart) {
            const bodies = await this.fetchRaw(group.map((m) => m.uid), [partID], false);
            for (const fetched of bodies) {
                const mail = group.find((m) => m.uid === fetched.uid);
                if (mail) mail.body = fetched.bodies.PART || '';
            }
        }
        return mails;
    }

    private async fetchRaw(
        uids: number[],
        bodies: string[],
        struct: boolean,
    ): Promise<Array<{ uid: number; struct: unknown; bodies: { HEADER?: string; PART?: string } }>> {
        const out: Array<{ uid: number; struct: unknown; bodies: { HEADER?: string; PART?: string } }> = [];
        const fetch = this.imap!.fetch(uids, { bodies, struct, markSeen: false });

        await new Promise<void>((resolve, reject) => {
            fetch.on('message', (msg: any) => {
                const item = { uid: 0, struct: null as unknown, bodies: {} as { HEADER?: string; PART?: string } };
                msg.on('body', (stream: any, info: any) => {
                    const key = String(info?.which || '').toUpperCase().startsWith('HEADER') ? 'HEADER' : 'PART';
                    stream.on('data', (chunk: Buffer | string) => {
                        const current = item.bodies[key] || '';
                        if (current.length < MAX_PART_BYTES) item.bodies[key] = current + chunk.toString('utf8');
                    });
                });
                msg.once('attributes', (attrs: any) => {
                    item.uid = Number(attrs?.uid) || 0;
                    item.struct = attrs?.struct ?? null;
                });
                msg.once('end', () => out.push(item));
            });
            fetch.once('error', (err: Error) => reject(err));
            fetch.once('end', () => resolve());
        });
        return out;
    }

    private async openInbox(): Promise<{ uidnext?: number; uidvalidity?: number } | undefined> {
        return new Promise((resolve, reject) => {
            this.imap!.openBox('INBOX', false, (err, box) => {
                if (err) {
                    console.error('Open Inbox error:', parseError(err, '', false)?.message);
                    reject(err);
                } else {
                    resolve(box as any);
                }
            });
        });
    }

    /** By UID: a sequence number shifts when another client expunges, a UID never does. */
    private async deleteMessage(uid: number): Promise<void> {
        await new Promise<void>((resolve, reject) => {
            this.imap!.addFlags([uid], '\\Deleted', (flagError) => {
                if (flagError) {
                    reject(flagError);
                    return;
                }

                const done = (expungeError?: Error | null) => {
                    if (expungeError) {
                        reject(expungeError);
                        return;
                    }
                    resolve();
                };
                // UID EXPUNGE (UIDPLUS, which Gmail has) removes only this mail, never another
                // client's pending \Deleted mail.
                const imap = this.imap as any;
                if (typeof imap.serverSupports === 'function' && imap.serverSupports('UIDPLUS')) {
                    imap.expunge([uid], done);
                } else {
                    imap.expunge(done);
                }
            });
        });
    }
}
