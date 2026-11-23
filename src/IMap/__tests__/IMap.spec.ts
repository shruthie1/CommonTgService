import { EventEmitter } from 'events';

// Mock the imap library (true I/O boundary) so the default MailReader factory can
// be exercised without opening a real socket. The mock records the options passed
// to `new Imap(...)` so we can assert on credential fallbacks.
const imapConstructorCalls: any[] = [];
jest.mock('imap', () => {
    return jest.fn().mockImplementation((opts: any) => {
        imapConstructorCalls.push(opts);
        const em: any = new (require('events').EventEmitter)();
        em.connect = jest.fn();
        em.end = jest.fn();
        return em;
    });
});

import { MailReader, htmlToText, parseTelegram2faEmail } from '../IMap';
import { InMemoryMailboxLock, MAILBOX_LOCK_KEY, RedisMailboxLock } from '../mailbox-lock';
import { Logger } from '../../utils/logger';
import { FakeImap, FakeMailbox, recoveryBody, twoFaBody } from './fake-mailbox';

class FakeFetch extends EventEmitter {
    constructor(private readonly messages: Array<{ seqno: number; body: string; date?: Date }>) {
        super();
        queueMicrotask(() => {
            for (const messageData of this.messages) {
                const message = new EventEmitter();
                this.emit('message', message, messageData.seqno);

                const bodyStream = new EventEmitter();
                message.emit('body', bodyStream, { which: 'TEXT' });
                if (messageData.date) {
                    message.emit('attributes', { date: messageData.date });
                }
                bodyStream.emit('data', Buffer.from(messageData.body, 'utf8'));
                bodyStream.emit('end');
                message.emit('end');
            }

            this.emit('end');
        });
    }
}


/**
 * A configurable fake Imap that can simulate error / end / timeout behaviour on
 * connect, openBox, search, fetch, addFlags and expunge. Used to exercise the
 * error branches of MailReader.
 */
class ConfigurableImap extends EventEmitter {
    public searchResults: number[] = [];
    public messages = new Map<number, { body: string; date?: Date }>();
    public deletedSeqNos: number[] = [];

    // behaviour toggles
    public connectMode: 'ready' | 'error' | 'end' | 'hang' | 'throw' = 'ready';
    public openBoxError: Error | null = null;
    public searchError: Error | null = null;
    public addFlagsError: Error | null = null;
    public expungeError: Error | null = null;
    public endMode: 'end' | 'error' | 'throw' | 'hang' = 'end';
    public connectCalled = 0;
    public endCalled = 0;

    public seq = {
        addFlags: (ids: number[], _flag: string, callback: (err?: Error | null) => void) => {
            if (this.addFlagsError) {
                callback(this.addFlagsError);
                return;
            }
            this.deletedSeqNos.push(...ids);
            callback(null);
        },
    };

    connect(): void {
        this.connectCalled++;
        if (this.connectMode === 'throw') {
            throw new Error('connect threw synchronously');
        }
        if (this.connectMode === 'hang') return;
        queueMicrotask(() => {
            if (this.connectMode === 'ready') this.emit('ready');
            else if (this.connectMode === 'error') this.emit('error', new Error('connect error'));
            else if (this.connectMode === 'end') this.emit('end');
        });
    }

    end(): void {
        this.endCalled++;
        if (this.endMode === 'throw') {
            throw new Error('end threw');
        }
        if (this.endMode === 'hang') return;
        queueMicrotask(() => {
            if (this.endMode === 'end') this.emit('end');
            else if (this.endMode === 'error') this.emit('error', new Error('end error'));
        });
    }

    openBox(_mailbox: string, _readOnly: boolean, callback: (err: Error | null) => void): void {
        callback(this.openBoxError);
    }

    search(_criteria: unknown, callback: (err: Error | null, results: number[]) => void): void {
        if (this.searchError) {
            callback(this.searchError, []);
            return;
        }
        callback(null, this.searchResults);
    }

    fetch(ids: number[]): FakeFetch {
        return new FakeFetch(
            ids.map((id) => ({
                seqno: id,
                body: this.messages.get(id)?.body || '',
                date: this.messages.get(id)?.date,
            })),
        );
    }

    expunge(callback: (err: Error | null) => void): void {
        callback(this.expungeError);
    }
}

// A fetch fake that immediately emits an error (no messages).
class ErrorFetch extends EventEmitter {
    constructor() {
        super();
        queueMicrotask(() => this.emit('error', new Error('fetch error')));
    }
}

describe('MailReader — connection lifecycle', () => {
    test('getInstance returns a process-wide singleton', () => {
        const a = MailReader.getInstance();
        const b = MailReader.getInstance();
        expect(a).toBe(b);
    });

    test('default factory builds the gmail imap config and falls back to empty creds', async () => {
        // The production default factory reads GMAIL_ADD/GMAIL_PASS from the env and
        // falls back to '' when they are absent. Exercise it via getInstance() (which
        // uses the default constructor) with the env unset, driving ensureImap through
        // the mocked imap library so no real socket is opened.
        const prevAdd = process.env.GMAIL_ADD;
        const prevPass = process.env.GMAIL_PASS;
        delete process.env.GMAIL_ADD;
        delete process.env.GMAIL_PASS;
        imapConstructorCalls.length = 0;

        const reader = MailReader.getInstance();
        // connect() on the mock is a no-op (never emits 'ready'), so use a tiny
        // timeout and swallow the expected rejection.
        await reader.connectToMail(10).catch(() => undefined);

        expect(imapConstructorCalls.length).toBeGreaterThan(0);
        expect(imapConstructorCalls[0]).toMatchObject({
            user: '',
            password: '',
            host: 'imap.gmail.com',
            port: 993,
            tls: true,
        });

        if (prevAdd !== undefined) process.env.GMAIL_ADD = prevAdd;
        if (prevPass !== undefined) process.env.GMAIL_PASS = prevPass;
    });

    test('connectToMail resolves and marks the reader ready (ensureImap "ready" handler)', async () => {
        const imap = new ConfigurableImap();
        const reader = MailReader.createForTest(() => imap as any);
        await reader.connectToMail();
        expect(await reader.isMailReady()).toBe(true);
        expect(imap.connectCalled).toBe(1);
    });

    test('connectToMail is a no-op when already ready', async () => {
        const imap = new ConfigurableImap();
        const reader = MailReader.createForTest(() => imap as any);
        await reader.connectToMail();
        await reader.connectToMail(); // second call short-circuits
        expect(imap.connectCalled).toBe(1);
    });

    test('concurrent connectToMail calls share the same in-flight promise', async () => {
        const imap = new ConfigurableImap();
        const reader = MailReader.createForTest(() => imap as any);
        const [r1, r2] = await Promise.all([reader.connectToMail(), reader.connectToMail()]);
        expect(r1).toBeUndefined();
        expect(r2).toBeUndefined();
        expect(imap.connectCalled).toBe(1);
    });

    test('connectToMail rejects when the connection emits an error', async () => {
        const imap = new ConfigurableImap();
        imap.connectMode = 'error';
        const reader = MailReader.createForTest(() => imap as any);
        await expect(reader.connectToMail()).rejects.toThrow(/Mail connection failed/);
    });

    test('connectToMail rejects when the connection ends before ready', async () => {
        const imap = new ConfigurableImap();
        imap.connectMode = 'end';
        const reader = MailReader.createForTest(() => imap as any);
        await expect(reader.connectToMail()).rejects.toThrow(/ended before ready/);
    });

    test('connectToMail rejects when imap.connect() throws synchronously', async () => {
        const imap = new ConfigurableImap();
        imap.connectMode = 'throw';
        const reader = MailReader.createForTest(() => imap as any);
        await expect(reader.connectToMail()).rejects.toThrow(/connect threw synchronously/);
    });

    test('connectToMail rejects on timeout when ready never fires', async () => {
        const imap = new ConfigurableImap();
        imap.connectMode = 'hang';
        const reader = MailReader.createForTest(() => imap as any);
        // small real timeout keeps the test fast without fake timers
        await expect(reader.connectToMail(20)).rejects.toThrow(/timed out after 20ms/);
    });

    test('ensureImap reuses the existing imap on a second ensure (via repeated connect attempts)', async () => {
        const imap = new ConfigurableImap();
        imap.connectMode = 'hang';
        const factory = jest.fn(() => imap as any);
        const reader = MailReader.createForTest(factory);

        // Both callers share the in-flight connection. Use a short bounded timeout and
        // settle both promises so this test cannot leave a live timer behind.
        const firstConnect = reader.connectToMail(20);
        const secondConnect = reader.connectToMail(20);
        expect(factory).toHaveBeenCalledTimes(1);
        await expect(firstConnect).rejects.toThrow(/timed out after 20ms/);
        await expect(secondConnect).rejects.toThrow(/timed out after 20ms/);
    });
});

describe('MailReader — ensureImap event handlers', () => {
    test('ready/error/end events flip the isReady flag', async () => {
        const imap = new ConfigurableImap();
        const reader = MailReader.createForTest(() => imap as any);
        await reader.connectToMail();
        expect(await reader.isMailReady()).toBe(true);

        // the persistent ensureImap 'error' handler sets isReady=false
        imap.emit('error', new Error('later error'));
        expect(await reader.isMailReady()).toBe(false);

        // re-ready
        imap.emit('ready');
        expect(await reader.isMailReady()).toBe(true);

        // the persistent 'end' handler sets isReady=false
        imap.emit('end');
        expect(await reader.isMailReady()).toBe(false);
    });

    test('reconnect after a transient drop reuses the existing imap (ensureImap fast-path)', async () => {
        // Real operational scenario: the IMAP socket drops mid-session (persistent
        // 'error' handler flips isReady=false but leaves the imap instance in place),
        // then code re-calls connectToMail to recover. ensureImap must return the
        // SAME imap rather than constructing a fresh one via the factory.
        const imap = new ConfigurableImap();
        const factory = jest.fn(() => imap as any);
        const reader = MailReader.createForTest(factory);

        await reader.connectToMail();
        expect(factory).toHaveBeenCalledTimes(1);

        // transient drop: persistent error handler clears readiness but keeps imap
        imap.emit('error', new Error('transient socket drop'));
        expect(await reader.isMailReady()).toBe(false);

        // recovery: connectToMail runs again; not ready so it does not short-circuit,
        // but ensureImap sees this.imap already set and returns it (line 50).
        await reader.connectToMail();
        expect(factory).toHaveBeenCalledTimes(1); // imap reused, not recreated
        expect(imap.connectCalled).toBe(2); // connect() was driven again on the same instance
        expect(await reader.isMailReady()).toBe(true);
    });
});

describe('MailReader — disconnectFromMail', () => {
    test('no-op when never connected', async () => {
        const reader = MailReader.createForTest(() => new ConfigurableImap() as any);
        await expect(reader.disconnectFromMail()).resolves.toBeUndefined();
    });

    test('ends the connection cleanly', async () => {
        const imap = new ConfigurableImap();
        const reader = MailReader.createForTest(() => imap as any);
        await reader.connectToMail();
        await reader.disconnectFromMail();
        expect(imap.endCalled).toBe(1);
        expect(await reader.isMailReady()).toBe(false);
    });

    test('resolves via the error listener when end() emits error', async () => {
        const imap = new ConfigurableImap();
        imap.endMode = 'error';
        const reader = MailReader.createForTest(() => imap as any);
        await reader.connectToMail();
        await expect(reader.disconnectFromMail()).resolves.toBeUndefined();
    });

    test('resolves when end() throws synchronously (caught, finish() called)', async () => {
        const imap = new ConfigurableImap();
        imap.endMode = 'throw';
        const reader = MailReader.createForTest(() => imap as any);
        await reader.connectToMail();
        await expect(reader.disconnectFromMail()).resolves.toBeUndefined();
    });

    test('falls back to the safety timeout when no end/error event fires', async () => {
        const imap = new ConfigurableImap();
        imap.endMode = 'hang';
        const reader = MailReader.createForTest(() => imap as any);
        await reader.connectToMail();

        // Speed up the hard-coded 5s safety timeout so the test stays fast,
        // without faking timers (which interferes with queueMicrotask flow).
        const realSetTimeout = global.setTimeout;
        const stub = jest
            .spyOn(global, 'setTimeout')
            .mockImplementation(((fn: any) => realSetTimeout(fn, 10)) as any);
        try {
            await expect(reader.disconnectFromMail()).resolves.toBeUndefined();
        } finally {
            stub.mockRestore();
        }
    });
});

// ---------------------------------------------------------------------------------------------
// 2FA email code: snapshot, parse, pick (fake Gmail mailbox, real Telegram mail format)
// ---------------------------------------------------------------------------------------------

async function readerOn(mailbox: FakeMailbox, lock = new InMemoryMailboxLock()) {
    const imap = new FakeImap(mailbox);
    const reader = MailReader.createForTest(() => imap as any, lock);
    await reader.connectToMail();
    return { imap, reader };
}

describe('parseTelegram2faEmail (real Telegram formats)', () => {
    test('the 2FA verify mail gives its code', () => {
        expect(parseTelegram2faEmail('Your Code - 482913', twoFaBody('482913'), 6)).toEqual({ code: '482913' });
    });

    test('a password-RECOVERY mail from the same sender is never a 2FA code', () => {
        expect(parseTelegram2faEmail('Your Recovery Code - 771234', recoveryBody('771234'), 6)).toEqual({ reason: 'recovery_email' });
        // body alone is enough, even with a misleading subject
        expect(parseTelegram2faEmail('Your Code - 771234', recoveryBody('771234'), 6)).toEqual({ reason: 'recovery_email' });
    });

    test('the delete-account mail (names a phone, has digits) is not a 2FA mail', () => {
        const body = 'Dear Swathi,\r\nWe have received a request to delete your Telegram account from your number +919876543210. If this wasn\'t you ... https://t.me/confirmphone?phone=919876543210&hash=abc123\r\nYou have 7 days to cancel.';
        expect(parseTelegram2faEmail('IMPORTANT: Request to delete your account', body, 6)).toEqual({ reason: 'not_2fa_email' });
    });

    test('other numbers and HTML colour codes around the code line do not change the code', () => {
        const body = `<div style="color:#333333">123456</div>\r\nRef 987654\r\n${twoFaBody('482913')}`;
        expect(parseTelegram2faEmail('Your Code - 482913', body, 6)).toEqual({ code: '482913' });
    });

    test('two different codes in one mail, or subject vs body mismatch, is ambiguous', () => {
        expect(parseTelegram2faEmail('Your Code - 482913', twoFaBody('482913') + twoFaBody('111222'), 6)).toEqual({ reason: 'ambiguous' });
        expect(parseTelegram2faEmail('Your Code - 999999', twoFaBody('482913'), 6)).toEqual({ reason: 'ambiguous' });
    });

    test('the same code repeated is not ambiguous', () => {
        expect(parseTelegram2faEmail('Your Code - 482913', twoFaBody('482913') + twoFaBody('482913'), 6)).toEqual({ code: '482913' });
    });

    test('"2-Step Verification" and "two step" wording variants are accepted', () => {
        const body = (wording: string) => `Your code is: 482913. Use it to verify your email and activate ${wording} in Telegram Messenger.`;
        for (const wording of ['2-Step Verification', 'Two-Step Verification', 'two step verification', '2 step verification', '2step verification', 'TWO-STEP VERIFICATION']) {
            expect(parseTelegram2faEmail('Your Code - 482913', body(wording), 6)).toEqual({ code: '482913' });
        }
        // the recovery mail is still rejected whatever the wording
        expect(parseTelegram2faEmail('Your Recovery Code - 771234', recoveryBody('771234') + ' 2-Step Verification', 6)).toEqual({ reason: 'recovery_email' });
    });

    test('HTML stripping stays linear on hostile input (each case under 100 ms)', () => {
        const cases = [
            '<'.repeat(65_536),
            '<a'.repeat(32_768),
            '<style>'.repeat(9_362),
            '<style>' + '</sty'.repeat(13_000),
            '&#'.repeat(32_768),
            ' \t'.repeat(32_768) + 'x',
        ];
        for (const input of cases) {
            const started = process.hrtime.bigint();
            htmlToText(input);
            const ms = Number(process.hrtime.bigint() - started) / 1e6;
            expect(ms).toBeLessThan(100);
        }
    });

    test('htmlToText keeps visible text, drops blocks/tags, stops at an unterminated tag', () => {
        expect(htmlToText('<head><style>p{color:#333333}</style></head><p>Your code is:&nbsp;<b>482913</b>.</p>x<br/>y'))
            .toBe(' Your code is: 482913 .\nx\ny');
        expect(htmlToText('ok <b unterminated 123456')).toBe('ok ');
        expect(htmlToText('<script>var a=123456;')).toBe('');
        expect(htmlToText('a &lt;b&gt; &amp; &#39;c&#39; &#x41;')).toBe("a <b> & 'c' A");
    });

    test('wrong length and missing code are rejected, never guessed', () => {
        expect(parseTelegram2faEmail('Your Code - 482913', twoFaBody('482913'), 5)).toEqual({ reason: 'length_mismatch' });
        expect(parseTelegram2faEmail('Your Code', twoFaBody('').replace('Your code is: .', 'Your code is coming.'), 6)).toEqual({ reason: 'no_code' });
        expect(parseTelegram2faEmail('Your Code', twoFaBody('123'), undefined)).toEqual({ reason: 'no_code' });
        expect(parseTelegram2faEmail('', '', 6)).toEqual({ reason: 'not_2fa_email' });
    });
});

describe('MailReader.snapshotMailbox', () => {
    test('uses UIDNEXT from the selected inbox', async () => {
        const mailbox = new FakeMailbox();
        mailbox.addTwoFa('111111');
        const { reader } = await readerOn(mailbox);
        expect(await reader.snapshotMailbox('••••1234')).toEqual({ sinceUid: mailbox.uidNext, uidValidity: 1 });
    });

    test('falls back to one past the highest Telegram UID when the server sends no UIDNEXT', async () => {
        const mailbox = new FakeMailbox();
        const last = mailbox.addTwoFa('111111');
        const imap = new FakeImap(mailbox);
        imap.openBox = (_n: string, _r: boolean, cb: any) => cb(null, { name: 'INBOX' });
        const reader = MailReader.createForTest(() => imap as any);
        await reader.connectToMail();
        expect((await reader.snapshotMailbox()).sinceUid).toBe(last.uid + 1);
    });

    test('fallback on an inbox with no Telegram mail starts at UID 1', async () => {
        const imap = new ConfigurableImap();
        const reader = MailReader.createForTest(() => imap as any);
        await reader.connectToMail();
        expect((await reader.snapshotMailbox()).sinceUid).toBe(1);
    });

    test('throws when not connected, and EMAIL_SNAPSHOT_FAILED when the inbox cannot be opened', async () => {
        const notReady = MailReader.createForTest(() => new ConfigurableImap() as any);
        await expect(notReady.snapshotMailbox()).rejects.toThrow(/Mail server is not ready/);

        const imap = new ConfigurableImap();
        imap.openBoxError = new Error('open box failed');
        const reader = MailReader.createForTest(() => imap as any);
        await reader.connectToMail();
        await expect(reader.snapshotMailbox()).rejects.toThrow(/EMAIL_SNAPSHOT_FAILED: open box failed/);
        expect(await reader.isMailReady()).toBe(false);
    });
});

describe('MailReader.getCode (UID snapshot)', () => {
    test('a stale 2FA mail from an earlier attempt seconds ago is NOT picked', async () => {
        const mailbox = new FakeMailbox();
        mailbox.addTwoFa('111111', { sentAt: new Date(Date.now() - 20_000), receivedAt: new Date(Date.now() - 10_000) });
        const { reader } = await readerOn(mailbox);
        const snapshot = await reader.snapshotMailbox();

        expect(await reader.getCode({ snapshot, expectedLength: 6, requestStartedAt: new Date() })).toBeNull();
        expect(mailbox.present()).toHaveLength(1); // never deleted
    });

    test('IMAP "n:*" returning the highest older UID is filtered out client-side', async () => {
        const mailbox = new FakeMailbox();
        const old = mailbox.addTwoFa('111111');
        const { reader, imap } = await readerOn(mailbox);
        const snapshot = await reader.snapshotMailbox();

        expect(await reader.getCode({ snapshot, expectedLength: 6 })).toBeNull();
        expect(imap.searchCriteria[imap.searchCriteria.length - 1]).toEqual([['FROM', 'noreply@telegram.org'], ['UID', `${snapshot.sinceUid}:*`]]);
        expect(mailbox.byUid(old.uid)).toBeDefined();
    });

    test('a fresh mail after the snapshot IS picked, read with PEEK, and only it is deleted (UID EXPUNGE)', async () => {
        const mailbox = new FakeMailbox();
        const old = mailbox.addTwoFa('111111');
        const { reader, imap } = await readerOn(mailbox);
        const snapshot = await reader.snapshotMailbox();
        const fresh = mailbox.addTwoFa('482913');

        expect(await reader.getCode({ snapshot, expectedLength: 6, requestStartedAt: new Date() })).toBe('482913');
        expect(imap.markSeenRequested).toBe(false);
        expect(imap.fetchBodies).toEqual([['HEADER.FIELDS (FROM SUBJECT DATE)'], ['1']]); // structure first, then the text part
        expect(mailbox.byUid(fresh.uid)).toBeUndefined();
        expect(mailbox.byUid(old.uid)).toBeDefined();
        expect(mailbox.expungeCalls).toEqual([[fresh.uid]]);
    });

    test('falls back to a plain EXPUNGE when the server has no UIDPLUS', async () => {
        const mailbox = new FakeMailbox();
        const { reader, imap } = await readerOn(mailbox);
        (imap as any).serverSupports = () => false;
        const snapshot = await reader.snapshotMailbox();
        mailbox.addTwoFa('482913');
        expect(await reader.getCode({ snapshot, expectedLength: 6 })).toBe('482913');
        expect(mailbox.expungeCalls).toEqual(['all']);
    });

    test('a recovery-code mail after the snapshot is rejected; the 2FA mail is picked', async () => {
        const mailbox = new FakeMailbox();
        const { reader } = await readerOn(mailbox);
        const snapshot = await reader.snapshotMailbox();
        mailbox.addTwoFa('482913');
        const recovery = mailbox.addRecovery('771234');

        expect(await reader.getCode({ snapshot, expectedLength: 6 })).toBe('482913');
        expect(mailbox.byUid(recovery.uid)).toBeDefined();
    });

    test('only recovery mails after the snapshot → no code', async () => {
        const mailbox = new FakeMailbox();
        const { reader } = await readerOn(mailbox);
        const snapshot = await reader.snapshotMailbox();
        mailbox.addRecovery('771234');
        expect(await reader.getCode({ snapshot, expectedLength: 6 })).toBeNull();
    });

    test('two fresh mails with the same code: the newest is picked', async () => {
        const mailbox = new FakeMailbox();
        const { reader } = await readerOn(mailbox);
        const snapshot = await reader.snapshotMailbox();
        const first = mailbox.addTwoFa('482913');
        const second = mailbox.addTwoFa('482913');
        expect(await reader.getCode({ snapshot, expectedLength: 6 })).toBe('482913');
        expect(mailbox.byUid(second.uid)).toBeUndefined();
        expect(mailbox.byUid(first.uid)).toBeDefined();
    });

    test('two fresh mails with DIFFERENT codes: EMAIL_CODE_AMBIGUOUS, nothing deleted', async () => {
        const mailbox = new FakeMailbox();
        const { reader } = await readerOn(mailbox);
        const snapshot = await reader.snapshotMailbox();
        mailbox.addTwoFa('482913');
        mailbox.addTwoFa('555666');
        await expect(reader.getCode({ snapshot, expectedLength: 6 })).rejects.toThrow(/EMAIL_CODE_AMBIGUOUS/);
        expect(mailbox.present()).toHaveLength(2);
        expect(await reader.isMailReady()).toBe(true); // a decision, not a broken connection
    });

    test('a mail Telegram SENT before this request (delivered late, after the snapshot) is rejected', async () => {
        const mailbox = new FakeMailbox();
        const { reader } = await readerOn(mailbox);
        const snapshot = await reader.snapshotMailbox();
        const requestStartedAt = new Date();
        mailbox.addTwoFa('333333', { sentAt: new Date(requestStartedAt.getTime() - 70_000) });
        expect(await reader.getCode({ snapshot, expectedLength: 6, requestStartedAt })).toBeNull();

        mailbox.addTwoFa('482913', { sentAt: new Date(requestStartedAt.getTime() - 30_000) }); // within clock skew
        expect(await reader.getCode({ snapshot, expectedLength: 6, requestStartedAt })).toBe('482913');
    });

    test('multipart: text/plain part 1 is read; colour codes and digits in the HTML part are ignored', async () => {
        const mailbox = new FakeMailbox();
        const { reader } = await readerOn(mailbox);
        const snapshot = await reader.snapshotMailbox();
        const html = '<html><body style="color:#333333"><b>123456</b> Your code is: 999999</body></html>';
        mailbox.add({
            subject: 'Your Code - 482913',
            text: `--b1\r\nContent-Type: text/html\r\n\r\n${html}\r\n--b1\r\nContent-Type: text/plain\r\n\r\n${twoFaBody('482913')}\r\n--b1--`,
            part1: twoFaBody('482913'),
            struct: [
                { type: 'alternative', params: { boundary: 'b1' } },
                [{ partID: '1', type: 'text', subtype: 'plain', encoding: '7BIT' }],
                [{ partID: '2', type: 'text', subtype: 'html', encoding: '7BIT' }],
            ],
        });
        expect(await reader.getCode({ snapshot, expectedLength: 6 })).toBe('482913');
    });

    test('multipart with the HTML part FIRST: the text/plain part (2) is read', async () => {
        const mailbox = new FakeMailbox();
        const { reader, imap } = await readerOn(mailbox);
        const snapshot = await reader.snapshotMailbox();
        mailbox.add({
            subject: 'Your Code - 482913',
            text: '(raw mime)',
            part1: '<html><body style="color:#333333"><b>123456</b> Your code is: 999999</body></html>',
            parts: { '2': twoFaBody('482913') },
            struct: [
                { type: 'alternative' },
                [{ partID: '1', type: 'text', subtype: 'html', encoding: '7BIT' }],
                [{ partID: '2', type: 'text', subtype: 'plain', encoding: '7BIT' }],
            ],
        });
        expect(await reader.getCode({ snapshot, expectedLength: 6 })).toBe('482913');
        expect(imap.fetchBodies[imap.fetchBodies.length - 1]).toEqual(['2']);
    });

    test('an HTML-only mail: tags, style colour codes and entities are stripped, then the strict rule applies', async () => {
        const mailbox = new FakeMailbox();
        const { reader } = await readerOn(mailbox);
        const snapshot = await reader.snapshotMailbox();
        const html =
            '<html><head><style>.c{color:#333333} .d{color:#123456}</style></head>' +
            '<body><div style="color:#654321">Your code is:&nbsp;<b>482913</b>. Use it to verify your email and activate ' +
            'two-step verification in Telegram&nbsp;Messenger.</div><p>Yours,<br>The Telegram Team</p></body></html>';
        mailbox.add({
            subject: 'Your Code - 482913',
            text: html,
            part1: html,
            struct: [{ partID: '1', type: 'text', subtype: 'html', encoding: '7BIT' }],
        });
        expect(await reader.getCode({ snapshot, expectedLength: 6 })).toBe('482913');
    });

    test('an HTML-only recovery mail is still rejected', async () => {
        const mailbox = new FakeMailbox();
        const { reader } = await readerOn(mailbox);
        const snapshot = await reader.snapshotMailbox();
        const html = `<p>${recoveryBody('771234').replace(/\r\n/g, '<br>')}</p>`;
        mailbox.add({ subject: 'Your Recovery Code - 771234', text: html, part1: html, struct: [{ partID: '1', type: 'text', subtype: 'html' }] });
        expect(await reader.getCode({ snapshot, expectedLength: 6 })).toBeNull();
    });

    test('a mail with no text part at all is rejected (no_text_part)', async () => {
        const mailbox = new FakeMailbox();
        const { reader } = await readerOn(mailbox);
        const snapshot = await reader.snapshotMailbox();
        mailbox.add({ subject: 'Your Code - 482913', text: '', part1: '', struct: [{ partID: '1', type: 'image', subtype: 'png' }] });
        expect(await reader.getCode({ snapshot, expectedLength: 6 })).toBeNull();
    });

    test('base64 and quoted-printable plain parts are decoded', async () => {
        const mailbox = new FakeMailbox();
        const { reader } = await readerOn(mailbox);
        let snapshot = await reader.snapshotMailbox();
        mailbox.add({
            subject: 'Your Code - 482913',
            text: '',
            part1: Buffer.from(twoFaBody('482913')).toString('base64').replace(/(.{76})/g, '$1\r\n'),
            struct: [{ partID: '1', type: 'text', subtype: 'plain', encoding: 'BASE64' }],
        });
        expect(await reader.getCode({ snapshot, expectedLength: 6 })).toBe('482913');

        snapshot = await reader.snapshotMailbox();
        mailbox.add({
            subject: 'Your Code - 246802',
            text: '',
            part1: 'Your code is: 246802. Use it to verify your email and activate two-step verif=\r\nication in Telegram Messenger. Don=E2=80=99t share it.',
            struct: [{ partID: '1', type: 'text', subtype: 'plain', encoding: 'QUOTED-PRINTABLE' }],
        });
        expect(await reader.getCode({ snapshot, expectedLength: 6 })).toBe('246802');
    });

    test('a mail not from Telegram is rejected even if search returned it', async () => {
        const mailbox = new FakeMailbox();
        const { reader, imap } = await readerOn(mailbox);
        const snapshot = await reader.snapshotMailbox();
        const spoof = mailbox.addTwoFa('482913', { from: 'Someone <x@example.com>' });
        imap.search = (_c: any, cb: any) => cb(null, [spoof.uid]);
        expect(await reader.getCode({ snapshot, expectedLength: 6 })).toBeNull();
    });

    test('UIDVALIDITY change since the snapshot fails the lookup', async () => {
        const mailbox = new FakeMailbox();
        const { reader } = await readerOn(mailbox);
        const snapshot = await reader.snapshotMailbox();
        mailbox.uidValidity = 2;
        mailbox.addTwoFa('482913');
        await expect(reader.getCode({ snapshot, expectedLength: 6 })).rejects.toThrow(/EMAIL_UIDVALIDITY_CHANGED/);
    });

    test('a lookup without a snapshot is refused', async () => {
        const { reader } = await readerOn(new FakeMailbox());
        await expect(reader.getCode({} as any)).rejects.toThrow(/needs a mailbox snapshot/);
        await expect(reader.getCode({ snapshot: { sinceUid: 0, uidValidity: 1 } })).rejects.toThrow(/needs a mailbox snapshot/);
    });

    test('decision log lines are greppable and never contain the code', async () => {
        const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
        const log = jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
        try {
            const mailbox = new FakeMailbox();
            const { reader } = await readerOn(mailbox);
            const snapshot = await reader.snapshotMailbox('••••1234');
            const recovery = mailbox.addRecovery('771234');
            const fresh = mailbox.addTwoFa('482913');
            expect(await reader.getCode({ snapshot, expectedLength: 6, logTag: '••••1234' })).toBe('482913');

            const lines = [...warn.mock.calls, ...log.mock.calls].map((c) => String(c[0])).filter((l) => l.startsWith('email-code '));
            expect(lines).toEqual(expect.arrayContaining([
                `email-code kind=snapshot mobile=••••1234 uid=${snapshot.sinceUid}`,
                `email-code kind=rejected reason=recovery_email mobile=••••1234 uid=${recovery.uid} subject=Your_Recovery_Code_-_NNNNNN`,
                `email-code kind=picked mobile=••••1234 uid=${fresh.uid}`,
            ]));
            expect(lines.join('\n')).not.toMatch(/482913|771234/);

            const snap2 = await reader.snapshotMailbox('••••1234');
            const odd = mailbox.add({ subject: 'Telegram code 246802 for you', text: 'Your code is: 246802. Thanks.' });
            expect(await reader.getCode({ snapshot: snap2, expectedLength: 6, logTag: '••••1234' })).toBeNull();
            expect(warn.mock.calls.map((c) => String(c[0]))).toContain(
                `email-code kind=rejected reason=not_2fa_email mobile=••••1234 uid=${odd.uid} subject=Telegram_code_NNNNNN_for_you`,
            );
        } finally {
            warn.mockRestore();
            log.mockRestore();
        }
    });
});

describe('MailReader.getCode error branches', () => {
    test('throws when the reader is not ready', async () => {
        const reader = MailReader.createForTest(() => new ConfigurableImap() as any);
        await expect(reader.getCode({ snapshot: { sinceUid: 1, uidValidity: 1 } })).rejects.toThrow(/Mail server is not ready/);
    });

    test('openBox / search / fetch failures reject and mark the connection not ready', async () => {
        for (const breakIt of [
            (imap: FakeImap) => { imap.openBox = (_n: string, _r: boolean, cb: any) => cb(new Error('open box failed')); },
            (imap: FakeImap) => { imap.search = (_c: any, cb: any) => cb(new Error('search failed'), []); },
            (imap: FakeImap) => { imap.failFetch = new Error('fetch error'); },
        ]) {
            const mailbox = new FakeMailbox();
            const { reader, imap } = await readerOn(mailbox);
            const snapshot = await reader.snapshotMailbox();
            mailbox.addTwoFa('482913');
            breakIt(imap);
            await expect(reader.getCode({ snapshot, expectedLength: 6 })).rejects.toThrow(/open box failed|search failed|fetch error/);
            expect(await reader.isMailReady()).toBe(false);
        }
    });

    test('a failed delete (flag or expunge) still returns the valid code and logs delete_failed', async () => {
        for (const breakIt of [
            (imap: FakeImap) => { imap.addFlags = (_u: number[], _f: string, cb: any) => cb(new Error('addFlags failed')); },
            (imap: FakeImap) => { imap.expunge = ((_u: any, cb: any) => cb(new Error('expunge failed'))) as any; },
        ]) {
            const mailbox = new FakeMailbox();
            const { reader, imap } = await readerOn(mailbox);
            const snapshot = await reader.snapshotMailbox();
            mailbox.addTwoFa('482913');
            breakIt(imap);
            const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
            try {
                expect(await reader.getCode({ snapshot, expectedLength: 6 })).toBe('482913');
                expect(warn.mock.calls.map((c) => String(c[0])).some((l) => /^email-code kind=delete_failed uid=\d+ error=(addFlags|expunge)_failed$/.test(l))).toBe(true);
            } finally {
                warn.mockRestore();
            }
            // the snapshot still stops reuse: a later attempt never sees this mail
            const next = await reader.snapshotMailbox();
            expect(await reader.getCode({ snapshot: next, expectedLength: 6 })).toBeNull();
        }
    });
});

describe('runExclusive', () => {
    test('serializes mailbox access within one process', async () => {
        const reader = MailReader.createForTest(() => new ConfigurableImap() as any);
        const order: string[] = [];
        const first = reader.runExclusive(async () => {
            order.push('first:start');
            await new Promise((resolve) => setTimeout(resolve, 5));
            order.push('first:end');
        });
        const second = reader.runExclusive(async () => {
            order.push('second:start');
            order.push('second:end');
        });
        await Promise.all([first, second]);
        expect(order).toEqual(['first:start', 'first:end', 'second:start', 'second:end']);
    });

    test('serializes across processes through the shared lock (two readers, one lock key)', async () => {
        jest.useFakeTimers();
        try {
            const lock = new InMemoryMailboxLock();
            const cms = MailReader.createForTest(() => new ConfigurableImap() as any, lock);
            const ums = MailReader.createForTest(() => new ConfigurableImap() as any, lock);
            const order: string[] = [];
            const a = cms.runExclusive(async () => {
                order.push('cms:start');
                await new Promise((r) => setTimeout(r, 30_000));
                order.push('cms:end');
            });
            const b = ums.runExclusive(async () => {
                order.push('ums:start');
            });
            await jest.advanceTimersByTimeAsync(40_000);
            await Promise.all([a, b]);
            expect(order).toEqual(['cms:start', 'cms:end', 'ums:start']);
        } finally {
            jest.useRealTimers();
        }
    });

    test('propagates the rejection but still releases both locks', async () => {
        const lock = new InMemoryMailboxLock();
        const reader = MailReader.createForTest(() => new ConfigurableImap() as any, lock);
        await expect(reader.runExclusive(async () => { throw new Error('op failed'); })).rejects.toThrow('op failed');
        expect(await reader.runExclusive(async () => 'ok')).toBe('ok');
        const other = MailReader.createForTest(() => new ConfigurableImap() as any, lock);
        expect(await other.runExclusive(async () => 'ok2')).toBe('ok2');
    });

    test('shared lock unreachable → proceeds WITHOUT the cross-process lock and logs redis_unavailable_proceed', async () => {
        const lock = { tryAcquire: jest.fn().mockRejectedValue(new Error('redis not ready (status=reconnecting)')), release: jest.fn() };
        const reader = MailReader.createForTest(() => new ConfigurableImap() as any, lock);
        const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
        try {
            expect(await reader.runExclusive(async () => 'ran', '••••1234')).toBe('ran');
            expect(warn.mock.calls.map((c) => String(c[0]))).toContain(
                'email-code kind=lock reason=redis_unavailable_proceed mobile=••••1234 error=redis_not_ready_(status=reconnecting)',
            );
            expect(lock.release).not.toHaveBeenCalled(); // nothing held, nothing to release
        } finally {
            warn.mockRestore();
        }
    });

    test('lock seen held, then Redis throws → EMAIL_LOCK_BUSY, never proceeds unlocked', async () => {
        jest.useFakeTimers();
        try {
            const lock = {
                tryAcquire: jest.fn().mockResolvedValueOnce(null).mockRejectedValue(new Error('redis not ready (status=reconnecting)')),
                release: jest.fn(),
            };
            const reader = MailReader.createForTest(() => new ConfigurableImap() as any, lock);
            const op = jest.fn();
            const settled = reader.runExclusive(op).then(() => 'ran', (e) => e);
            await jest.advanceTimersByTimeAsync(5_000);
            expect(String(await settled)).toMatch(/^EmailCodeError: EMAIL_LOCK_BUSY: lock was held elsewhere, then the lock store failed/);
            expect(op).not.toHaveBeenCalled();
            expect(lock.release).not.toHaveBeenCalled();
        } finally {
            jest.useRealTimers();
        }
    });

    test('lock held elsewhere for a while → waits, then proceeds once it is free', async () => {
        jest.useFakeTimers();
        try {
            const lock = new InMemoryMailboxLock();
            const other = await lock.tryAcquire(300_000);
            setTimeout(() => void lock.release(other!), 30_000);
            const reader = MailReader.createForTest(() => new ConfigurableImap() as any, lock);
            const settled = reader.runExclusive(async () => 'ran').then((v) => v, (e) => e);
            await jest.advanceTimersByTimeAsync(35_000);
            expect(await settled).toBe('ran');
        } finally {
            jest.useRealTimers();
        }
    });

    test('lock held elsewhere for longer than the wait → EMAIL_LOCK_BUSY, operation never runs', async () => {
        jest.useFakeTimers();
        try {
            const lock = { tryAcquire: jest.fn().mockResolvedValue(null), release: jest.fn() };
            const reader = MailReader.createForTest(() => new ConfigurableImap() as any, lock);
            const op = jest.fn();
            const settled = reader.runExclusive(op).then(() => 'ok', (e) => e);
            await jest.advanceTimersByTimeAsync(3 * 60_000 + 5_000);
            expect(String(await settled)).toMatch(/EMAIL_LOCK_BUSY/);
            expect(op).not.toHaveBeenCalled();
            expect(lock.tryAcquire.mock.calls.length).toBeGreaterThan(10);
        } finally {
            jest.useRealTimers();
        }
    });

    test('a failed lock release is logged, not thrown (TTL frees it)', async () => {
        const lock = { tryAcquire: jest.fn().mockResolvedValue('t'), release: jest.fn().mockRejectedValue(new Error('redis blip')) };
        const reader = MailReader.createForTest(() => new ConfigurableImap() as any, lock);
        expect(await reader.runExclusive(async () => 'ok')).toBe('ok');
        expect(lock.release).toHaveBeenCalledWith('t');
    });
});

describe('RedisMailboxLock', () => {
    test('acquires with SET NX PX and releases only its own token', async () => {
        const redis = { status: 'ready', set: jest.fn().mockResolvedValue('OK'), eval: jest.fn().mockResolvedValue(1) };
        const lock = new RedisMailboxLock(() => redis as any);
        const token = await lock.tryAcquire(300_000);
        expect(token).toEqual(expect.any(String));
        expect(redis.set).toHaveBeenCalledWith(MAILBOX_LOCK_KEY, token, 'PX', 300_000, 'NX');
        await lock.release(token!);
        expect(redis.eval).toHaveBeenCalledWith(expect.stringContaining("redis.call('get', KEYS[1]) == ARGV[1]"), 1, MAILBOX_LOCK_KEY, token);
    });

    test('returns null when another holder has the key', async () => {
        const lock = new RedisMailboxLock(() => ({ status: 'ready', set: jest.fn().mockResolvedValue(null), eval: jest.fn() }) as any);
        expect(await lock.tryAcquire(1000)).toBeNull();
    });

    test('a hung Redis command times out instead of blocking set2fa', async () => {
        jest.useFakeTimers();
        try {
            const lock = new RedisMailboxLock(() => ({ status: 'ready', set: () => new Promise(() => undefined), eval: jest.fn().mockResolvedValue(0) }) as any);
            const settled = lock.tryAcquire(1000).then(() => 'ok', (e) => e);
            await jest.advanceTimersByTimeAsync(5_001);
            expect(String(await settled)).toMatch(/mailbox lock acquire timed out/);
        } finally {
            jest.useRealTimers();
        }
    });

    test('Redis not ready → throws without sending SET (nothing parked in the offline queue)', async () => {
        for (const status of ['reconnecting', 'connecting', 'end', 'wait']) {
            const redis = { status, set: jest.fn(), eval: jest.fn() };
            await expect(new RedisMailboxLock(() => redis as any).tryAcquire(1000)).rejects.toThrow(`redis not ready (status=${status})`);
            expect(redis.set).not.toHaveBeenCalled();
        }
    });

    test('a SET that times out but lands later leaves no held lock (owner release queued behind it)', async () => {
        jest.useFakeTimers();
        try {
            // Fake Redis that answers in order, late: models ioredis resending unanswered commands after a stall.
            const store = new Map<string, string>();
            const pending: Array<() => void> = [];
            const redis = {
                status: 'ready',
                set: (key: string, value: string) => new Promise((resolve) => pending.push(() => {
                    if (store.has(key)) return resolve(null);
                    store.set(key, value);
                    resolve('OK');
                })),
                eval: (_script: string, _n: number, key: string, token: string) => new Promise((resolve) => pending.push(() => {
                    if (store.get(key) === token) {
                        store.delete(key);
                        return resolve(1);
                    }
                    resolve(0);
                })),
            };
            const lock = new RedisMailboxLock(() => redis as any);
            const settled = lock.tryAcquire(300_000).then(() => 'ok', (e) => e);
            await jest.advanceTimersByTimeAsync(5_001);
            expect(String(await settled)).toMatch(/mailbox lock acquire timed out/);

            while (pending.length) pending.shift()!(); // the stalled connection drains: SET, then the release
            await Promise.resolve();
            expect(store.has(MAILBOX_LOCK_KEY)).toBe(false);
        } finally {
            jest.useRealTimers();
        }
    });

    test('in-memory lock: expires after its TTL, ignores a stale token on release', async () => {
        const lock = new InMemoryMailboxLock();
        const t1 = await lock.tryAcquire(10);
        expect(await lock.tryAcquire(10)).toBeNull();
        await new Promise((r) => setTimeout(r, 15));
        const t2 = await lock.tryAcquire(1000);
        expect(t2).not.toBeNull();
        await lock.release(t1!); // stale token: no effect
        expect(await lock.tryAcquire(1000)).toBeNull();
        await lock.release(t2!);
        expect(await lock.tryAcquire(1000)).not.toBeNull();
    });
});
