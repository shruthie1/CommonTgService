import { EventEmitter } from 'events';

/**
 * In-memory IMAP mailbox that behaves like Gmail for the calls MailReader makes (node-imap API):
 * - search() and fetch() are UID-based (node-imap's `imap.search` / `imap.fetch` are UID SEARCH / UID FETCH);
 *   the 'message' event carries the sequence number, attributes carry the uid;
 * - openBox() reports UIDNEXT / UIDVALIDITY;
 * - addFlags() is by UID, seq.addFlags() by sequence number, expunge() removes \Deleted mails.
 * Several FakeImap connections can share one FakeMailbox (two processes, one inbox).
 */

export interface FakeMail {
    uid: number;
    from: string;
    subject: string;
    /** Date header: when Telegram sent it. */
    sentAt: Date;
    /** INTERNALDATE: when Gmail stored it. */
    receivedAt: Date;
    /** Raw MIME body after the header (what BODY[TEXT] returns). */
    text: string;
    /** BODY[1]. */
    part1: string;
    /** Other BODY[<partID>] contents for multipart mails (e.g. { '2': '<html>…' }). */
    parts?: Record<string, string>;
    struct: unknown[];
    deleted: boolean;
    seen: boolean;
}

export const TELEGRAM_FROM = 'Telegram <noreply@telegram.org>';

/** Real Telegram 2FA verify mail (inbox sample 2026-11-23, digits replaced by the given code). */
export function twoFaBody(code: string): string {
    return (
        `Your code is: ${code}. Use it to verify your email and activate two-step verification in Telegram Messenger.\r\n\r\n` +
        "If you didn't request this, simply ignore this message.\r\n\r\nYours,\r\nThe Telegram Team\r\n"
    );
}

/** Real Telegram password-recovery mail, same sender, same inbox (10-29 a day in Nov 2026). */
export function recoveryBody(code: string): string {
    return (
        `Your code is: ${code}. Use it to disable your password and access your Telegram account.\r\n\r\n` +
        "If you didn't request to restore access to your account, go to Telegram Settings > Devices (or Privacy & Security > Active Sessions) and terminate any sessions you don’t recognize.\r\n\r\nYours,\r\nThe Telegram Team\r\n"
    );
}

const PLAIN_STRUCT = (size: number) => [
    { partID: '1', type: 'text', subtype: 'plain', params: { charset: 'utf-8' }, encoding: '7BIT', size },
];

export class FakeMailbox {
    public mails: FakeMail[] = [];
    public uidNext = 14_100;
    public uidValidity = 1;
    public expungeCalls: Array<number[] | 'all'> = [];

    add(mail: Partial<FakeMail> & { text: string }): FakeMail {
        const now = new Date();
        const full: FakeMail = {
            uid: this.uidNext++,
            from: TELEGRAM_FROM,
            subject: 'Your Code - 000000',
            sentAt: now,
            receivedAt: now,
            part1: mail.text,
            struct: PLAIN_STRUCT(mail.text.length),
            deleted: false,
            seen: false,
            ...mail,
        };
        this.mails.push(full);
        return full;
    }

    /** Telegram 2FA verify mail. */
    addTwoFa(code: string, extra: Partial<FakeMail> = {}): FakeMail {
        return this.add({ subject: `Your Code - ${code}`, text: twoFaBody(code), ...extra });
    }

    addRecovery(code: string, extra: Partial<FakeMail> = {}): FakeMail {
        return this.add({ subject: `Your Recovery Code - ${code}`, text: recoveryBody(code), ...extra });
    }

    private expunged = new Set<number>();

    present(): FakeMail[] {
        return this.mails.filter((m) => !this.expunged.has(m.uid));
    }

    seqnoOf(uid: number): number {
        return this.present().findIndex((m) => m.uid === uid) + 1;
    }

    byUid(uid: number): FakeMail | undefined {
        return this.present().find((m) => m.uid === uid);
    }

    expunge(uids?: number[]): void {
        this.expungeCalls.push(uids ? [...uids] : 'all');
        for (const m of this.present()) {
            if (m.deleted && (!uids || uids.includes(m.uid))) this.expunged.add(m.uid);
        }
    }
}

function headerText(mail: FakeMail): string {
    return `Subject: ${mail.subject}\r\nFrom: ${mail.from}\r\nDate: ${mail.sentAt.toUTCString().replace('GMT', '+0000')} (UTC)\r\n\r\n`;
}

class FakeFetch extends EventEmitter {
    constructor(mailbox: FakeMailbox, uids: number[], bodies: string[], fail?: Error, latencyMs = 0) {
        super();
        // The server reads the mails when the request arrives; the reply lands after the latency.
        const found = uids
            .map((uid) => ({ mail: mailbox.byUid(uid), seqno: mailbox.seqnoOf(uid) }))
            .filter((x): x is { mail: FakeMail; seqno: number } => Boolean(x.mail));
        const emitAll = () => {
            if (fail) {
                this.emit('error', fail);
                return;
            }
            for (const { mail, seqno } of found) {
                const msg = new EventEmitter();
                this.emit('message', msg, seqno);
                msg.emit('attributes', { uid: mail.uid, date: mail.receivedAt, struct: mail.struct, flags: [] });
                for (const which of bodies) {
                    const stream = new EventEmitter();
                    msg.emit('body', stream, { which });
                    const upper = which.toUpperCase();
                    const content = upper.startsWith('HEADER') ? headerText(mail) : upper === 'TEXT' ? mail.text : mail.parts?.[which] ?? (which === '1' ? mail.part1 : '');
                    stream.emit('data', Buffer.from(content, 'utf8'));
                    stream.emit('end');
                }
                msg.emit('end');
            }
            this.emit('end');
        };
        if (latencyMs > 0) setTimeout(emitAll, latencyMs);
        else queueMicrotask(emitAll);
    }
}

export class FakeImap extends EventEmitter {
    public connectCalls = 0;
    public failConnect: Error | null = null;
    public failFetch: Error | null = null;
    public markSeenRequested = false;
    public fetchBodies: string[][] = [];
    public searchCriteria: unknown[] = [];
    /** Network latency for search/fetch (ms, via setTimeout so fake timers control it). 0 = immediate. */
    public latencyMs = 0;

    constructor(public readonly mailbox: FakeMailbox) {
        super();
    }

    public seq = {
        addFlags: (seqnos: number[], _flag: string, cb: (err?: Error | null) => void) => {
            const present = this.mailbox.present();
            for (const s of seqnos) if (present[s - 1]) present[s - 1].deleted = true;
            cb(null);
        },
    };

    connect(): void {
        this.connectCalls++;
        queueMicrotask(() => {
            if (this.failConnect) this.emit('error', this.failConnect);
            else this.emit('ready');
        });
    }

    end(): void {
        queueMicrotask(() => this.emit('end'));
    }

    serverSupports(cap: string): boolean {
        return cap === 'UIDPLUS';
    }

    openBox(_name: string, _readOnly: boolean, cb: (err: Error | null, box?: unknown) => void): void {
        cb(null, { name: 'INBOX', uidnext: this.mailbox.uidNext, uidvalidity: this.mailbox.uidValidity });
    }

    search(criteria: any[], cb: (err: Error | null, uids: number[]) => void): void {
        // The server answers from the mailbox as it is now; the reply arrives after the latency.
        const reply = (uids: number[]) => (this.latencyMs > 0 ? setTimeout(() => cb(null, uids), this.latencyMs) : cb(null, uids));
        this.searchCriteria.push(criteria);
        let mails = this.mailbox.present();
        for (const c of criteria) {
            if (Array.isArray(c) && c[0] === 'FROM') mails = mails.filter((m) => m.from.toLowerCase().includes(String(c[1]).toLowerCase()));
            if (Array.isArray(c) && c[0] === 'UID') {
                const lo = Number(String(c[1]).split(':')[0]);
                const matched = mails.filter((m) => m.uid >= lo);
                // RFC 3501: "n:*" includes the highest UID even when it is below n.
                mails = matched.length ? matched : mails.slice(-1);
            }
        }
        reply(mails.map((m) => m.uid));
    }

    fetch(uids: number[], options: { bodies: string[]; markSeen?: boolean }): FakeFetch {
        if (options.markSeen) this.markSeenRequested = true;
        this.fetchBodies.push(options.bodies);
        return new FakeFetch(this.mailbox, uids, options.bodies, this.failFetch || undefined, this.latencyMs);
    }

    addFlags(uids: number[], _flag: string, cb: (err?: Error | null) => void): void {
        for (const uid of uids) {
            const m = this.mailbox.byUid(uid);
            if (m) m.deleted = true;
        }
        cb(null);
    }

    expunge(uidsOrCb: number[] | ((err: Error | null) => void), maybeCb?: (err: Error | null) => void): void {
        if (typeof uidsOrCb === 'function') {
            this.mailbox.expunge();
            uidsOrCb(null);
        } else {
            this.mailbox.expunge(uidsOrCb);
            maybeCb?.(null);
        }
    }
}
