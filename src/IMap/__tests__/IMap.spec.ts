import { EventEmitter } from 'events';
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
