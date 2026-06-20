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

import { MailReader, extractTelegramCode, isMailFreshEnough } from '../IMap';

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

class FakeImap extends EventEmitter {
    public searchResults: number[] = [];
    public messages = new Map<number, { body: string; date?: Date }>();
    public deletedSeqNos: number[] = [];
    public seq = {
        addFlags: (ids: number[], _flag: string, callback: (err?: Error | null) => void) => {
            this.deletedSeqNos.push(...ids);
            callback(null);
        },
    };

    connect(): void {
        queueMicrotask(() => this.emit('ready'));
    }

    end(): void {
        queueMicrotask(() => this.emit('end'));
    }

    openBox(_mailbox: string, _readOnly: boolean, callback: (err: Error | null) => void): void {
        callback(null);
    }

    search(_criteria: unknown, callback: (err: Error | null, results: number[]) => void): void {
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
        callback(null);
    }
}

describe('MailReader', () => {
    test('runExclusive serializes mailbox access', async () => {
        const reader = MailReader.createForTest(() => new FakeImap() as any);
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

    test('getCode returns null when no matching mail exists instead of reusing old state', async () => {
        const imap = new FakeImap();
        const reader = MailReader.createForTest(() => imap as any);
        const now = new Date('2026-04-11T10:00:00.000Z');

        imap.searchResults = [1];
        imap.messages.set(1, {
            body: 'Telegram code: 12345.',
            date: new Date('2026-04-11T10:01:00.000Z'),
        });

        await reader.connectToMail();
        const firstCode = await reader.getCode({ expectedLength: 5, minReceivedAt: now });
        expect(firstCode).toBe('12345');

        imap.searchResults = [];
        const secondCode = await reader.getCode({ expectedLength: 5, minReceivedAt: new Date('2026-04-11T10:02:00.000Z') });
        expect(secondCode).toBeNull();
    });

    test('getCode picks the newest fresh code with the requested length and deletes only that message', async () => {
        const imap = new FakeImap();
        const reader = MailReader.createForTest(() => imap as any);
        const startedAt = new Date('2026-04-11T10:00:00.000Z');

        imap.searchResults = [1, 2, 3];
        imap.messages.set(1, {
            body: 'Telegram verification code 999999.',
            date: new Date('2026-04-11T10:05:00.000Z'),
        });
        imap.messages.set(2, {
            body: 'Telegram verification code 12345.',
            date: new Date('2026-04-11T09:30:00.000Z'),
        });
        imap.messages.set(3, {
            body: 'Telegram verification code 54321.',
            date: new Date('2026-04-11T10:06:00.000Z'),
        });

        await reader.connectToMail();
        const code = await reader.getCode({ expectedLength: 5, minReceivedAt: startedAt });

        expect(code).toBe('54321');
        expect(imap.deletedSeqNos).toEqual([3]);
    });
});

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
        // first connect creates the imap and hangs; we don't await it
        reader.connectToMail(10000).catch(() => undefined);
        // imap created exactly once even though a second connect would ensureImap again
        expect(factory).toHaveBeenCalledTimes(1);
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

describe('MailReader — getCode error branches', () => {
    test('throws when the reader is not ready', async () => {
        const reader = MailReader.createForTest(() => new ConfigurableImap() as any);
        await expect(reader.getCode()).rejects.toThrow(/Mail server is not ready/);
    });

    test('rejects and flips isReady when openBox fails', async () => {
        const imap = new ConfigurableImap();
        imap.openBoxError = new Error('open box failed');
        const reader = MailReader.createForTest(() => imap as any);
        await reader.connectToMail();
        await expect(reader.getCode()).rejects.toThrow('open box failed');
        expect(await reader.isMailReady()).toBe(false);
    });

    test('rejects when search fails', async () => {
        const imap = new ConfigurableImap();
        imap.searchError = new Error('search failed');
        const reader = MailReader.createForTest(() => imap as any);
        await reader.connectToMail();
        await expect(reader.getCode()).rejects.toThrow('search failed');
    });

    test('returns null when search finds no messages', async () => {
        const imap = new ConfigurableImap();
        imap.searchResults = [];
        const reader = MailReader.createForTest(() => imap as any);
        await reader.connectToMail();
        expect(await reader.getCode()).toBeNull();
    });

    test('returns null when messages exist but contain no matching code', async () => {
        const imap = new ConfigurableImap();
        imap.searchResults = [1];
        imap.messages.set(1, { body: 'no digits here' });
        const reader = MailReader.createForTest(() => imap as any);
        await reader.connectToMail();
        expect(await reader.getCode({ expectedLength: 5 })).toBeNull();
    });

    test('rejects when fetch emits an error', async () => {
        const imap = new ConfigurableImap();
        imap.searchResults = [1];
        imap.fetch = (() => new ErrorFetch()) as any;
        const reader = MailReader.createForTest(() => imap as any);
        await reader.connectToMail();
        await expect(reader.getCode()).rejects.toThrow('fetch error');
    });

    test('rejects when addFlags fails during delete', async () => {
        const imap = new ConfigurableImap();
        imap.searchResults = [1];
        imap.messages.set(1, { body: 'Telegram code 12345' });
        imap.addFlagsError = new Error('addFlags failed');
        const reader = MailReader.createForTest(() => imap as any);
        await reader.connectToMail();
        await expect(reader.getCode({ expectedLength: 5 })).rejects.toThrow('addFlags failed');
    });

    test('rejects when expunge fails during delete', async () => {
        const imap = new ConfigurableImap();
        imap.searchResults = [1];
        imap.messages.set(1, { body: 'Telegram code 12345' });
        imap.expungeError = new Error('expunge failed');
        const reader = MailReader.createForTest(() => imap as any);
        await reader.connectToMail();
        await expect(reader.getCode({ expectedLength: 5 })).rejects.toThrow('expunge failed');
    });

    test('parses a string mail date into a Date when filtering by freshness', async () => {
        // Some IMAP servers/libraries deliver the message date as an ISO string
        // rather than a Date object. getCode must coerce it so freshness filtering
        // still works (string-date branch of the attributes handler).
        const imap = new ConfigurableImap();
        imap.searchResults = [1];
        imap.messages.set(1, {
            body: 'Telegram code 24680',
            // intentionally a string to exercise the `new Date(attrs.date)` branch
            date: '2026-04-11T10:05:00.000Z' as unknown as Date,
        });
        const reader = MailReader.createForTest(() => imap as any);
        await reader.connectToMail();

        const code = await reader.getCode({
            expectedLength: 5,
            minReceivedAt: new Date('2026-04-11T10:00:00.000Z'),
        });
        expect(code).toBe('24680');
    });

    test('extracts the first code with no expectedLength filter', async () => {
        const imap = new ConfigurableImap();
        imap.searchResults = [1];
        imap.messages.set(1, { body: 'Your code is 4321 thanks' });
        const reader = MailReader.createForTest(() => imap as any);
        await reader.connectToMail();
        expect(await reader.getCode()).toBe('4321');
        expect(imap.deletedSeqNos).toEqual([1]);
    });
});

describe('runExclusive — error propagation', () => {
    test('propagates the rejection but still releases the lock for the next op', async () => {
        const reader = MailReader.createForTest(() => new ConfigurableImap() as any);
        await expect(
            reader.runExclusive(async () => {
                throw new Error('op failed');
            }),
        ).rejects.toThrow('op failed');

        // lock released -> a subsequent operation runs normally
        const result = await reader.runExclusive(async () => 'ok');
        expect(result).toBe('ok');
    });
});

describe('extractTelegramCode / isMailFreshEnough edge cases', () => {
    test('extractTelegramCode returns null when there is no match', () => {
        expect(extractTelegramCode('no codes', 5)).toBeNull();
        expect(extractTelegramCode('')).toBeNull();
    });

    test('isMailFreshEnough returns true when minReceivedAt or receivedAt is missing', () => {
        expect(isMailFreshEnough(null)).toBe(true);
        expect(isMailFreshEnough(null, new Date())).toBe(true);
        expect(isMailFreshEnough(new Date())).toBe(true);
    });
});

describe('mail helpers', () => {
    test('extractTelegramCode honors the expected length', () => {
        expect(extractTelegramCode('Codes: 12345 and 999999', 5)).toBe('12345');
        expect(extractTelegramCode('Codes: 12345 and 999999', 6)).toBe('999999');
    });

    test('isMailFreshEnough rejects stale mail beyond the allowed clock skew', () => {
        const startedAt = new Date('2026-04-11T10:00:00.000Z');
        expect(isMailFreshEnough(new Date('2026-04-11T09:58:30.000Z'), startedAt)).toBe(false);
        expect(isMailFreshEnough(new Date('2026-04-11T09:59:30.000Z'), startedAt)).toBe(true);
    });
});
