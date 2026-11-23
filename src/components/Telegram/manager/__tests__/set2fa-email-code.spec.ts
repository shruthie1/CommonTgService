/**
 * set2fa end to end against a fake Gmail inbox (src/IMap/__tests__/fake-mailbox.ts) and a fake
 * Telegram that mirrors gramjs 2.26 client/2fa.js: UpdatePasswordSettings → Telegram mails a code
 * → EMAIL_UNCONFIRMED → loop { code = emailCodeCallback(len); ConfirmPasswordEmail(code) } with
 * onEmailCodeError(err) called synchronously on any error.
 *
 * Live context (11-21 / 11-22): CODE_INVALID 3 times. The inbox (read-only check 2026-11-23) also
 * receives 10-29 Telegram password-RECOVERY codes a day from the same sender with the same
 * "Your code is: NNNNNN." line, and the 3 unconsumed "Your Code" mails line up with those days.
 */
jest.mock('../../../../utils/fetchWithTimeout', () => ({ fetchWithTimeout: jest.fn().mockResolvedValue(undefined) }));
jest.mock('../../../../utils/logbots', () => ({ notifbot: jest.fn().mockReturnValue('http://bot') }));

import { MailReader } from '../../../../IMap/IMap';
import { InMemoryMailboxLock, MailboxLock } from '../../../../IMap/mailbox-lock';
import { FakeImap, FakeMailbox } from '../../../../IMap/__tests__/fake-mailbox';
import { set2fa } from '../auth-operations';

const MAX_LOOP = 3; // caps the gramjs while(true) so a regression cannot spin forever

interface TelegramAccountOptions {
    code: string;
    /** ms after the request until Gmail stores the mail; null = Telegram never mails. */
    deliveryDelayMs: number | null;
    /** Telegram rejects every code (account-side CODE_INVALID). */
    rejectAll?: boolean;
}

function telegramAccount(mailbox: FakeMailbox, opts: TelegramAccountOptions) {
    const submitted: string[] = [];
    const confirmed: string[] = [];
    let loops = 0;
    const updateTwoFaSettings = jest.fn(async ({ emailCodeCallback, onEmailCodeError }: any) => {
        const sentAt = new Date();
        if (opts.deliveryDelayMs !== null) {
            setTimeout(() => mailbox.addTwoFa(opts.code, { sentAt, receivedAt: new Date() }), opts.deliveryDelayMs);
        }
        // eslint-disable-next-line no-constant-condition
        while (true) {
            if (++loops > MAX_LOOP) throw new Error('gramjs email loop never ended');
            try {
                const code = await emailCodeCallback(opts.code.length);
                if (!code) throw new Error('Code is empty');
                submitted.push(code);
                if (opts.rejectAll || code !== opts.code) {
                    throw Object.assign(new Error('400: CODE_INVALID (caused by account.ConfirmPasswordEmail)'), { errorMessage: 'CODE_INVALID' });
                }
                confirmed.push(code);
                break;
            } catch (err) {
                onEmailCodeError(err);
            }
        }
    });
    return { updateTwoFaSettings, submitted, confirmed };
}

function ctxFor(phoneNumber: string, account: ReturnType<typeof telegramAccount>) {
    return {
        client: { invoke: jest.fn().mockResolvedValue({ hasPassword: false }), updateTwoFaSettings: account.updateTwoFaSettings },
        phoneNumber,
        logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
    } as any;
}

function readerFor(mailbox: FakeMailbox, lock: MailboxLock, tweak?: (imap: FakeImap) => void) {
    return MailReader.createForTest(() => {
        const imap = new FakeImap(mailbox);
        tweak?.(imap);
        return imap as any;
    }, lock);
}

/** Advance fake time in small steps so real async I/O chains (fake IMAP microtasks) interleave with timers. */
async function advance(ms: number): Promise<void> {
    for (let t = 0; t < ms; t += 500) await jest.advanceTimersByTimeAsync(500);
}

async function run(promise: Promise<unknown>, ms = 200_000): Promise<unknown> {
    const settled = promise.then((v) => ({ ok: v }), (e) => ({ err: e }));
    await advance(ms);
    return settled;
}

describe('set2fa email code (fake Gmail inbox + gramjs loop)', () => {
    let lock: InMemoryMailboxLock;
    let mailbox: FakeMailbox;

    beforeEach(() => {
        jest.useFakeTimers({ now: new Date('2026-11-22T07:54:00.000Z') });
        lock = new InMemoryMailboxLock();
        mailbox = new FakeMailbox();
    });

    afterEach(() => {
        jest.useRealTimers();
        jest.restoreAllMocks();
    });

    test('a fresh code after the request is picked and confirmed; only that mail is deleted', async () => {
        mailbox.addRecovery('900001', { sentAt: new Date(Date.now() - 3_600_000), receivedAt: new Date(Date.now() - 3_600_000) });
        jest.spyOn(MailReader, 'getInstance').mockReturnValue(readerFor(mailbox, lock));
        const account = telegramAccount(mailbox, { code: '482913', deliveryDelayMs: 13_000 });

        const outcome: any = await run(set2fa(ctxFor('919000001234', account)));

        expect(outcome.ok).toMatchObject({ email: 'storeslaksmi@gmail.com' });
        expect(account.submitted).toEqual(['482913']);
        expect(mailbox.present().map((m) => m.subject)).toEqual(['Your Recovery Code - 900001']);
    });

    test('a stale 2FA mail from an earlier attempt (30 s old) is NOT submitted', async () => {
        // Old code: accepted anything up to 60 s older than the attempt and took the newest at the 10 s poll.
        mailbox.addTwoFa('111111', { sentAt: new Date(Date.now() - 40_000), receivedAt: new Date(Date.now() - 30_000) });
        jest.spyOn(MailReader, 'getInstance').mockReturnValue(readerFor(mailbox, lock));
        const account = telegramAccount(mailbox, { code: '482913', deliveryDelayMs: 13_000 });

        const outcome: any = await run(set2fa(ctxFor('919000001234', account)));

        expect(outcome.err).toBeUndefined();
        expect(account.submitted).toEqual(['482913']);
    });

    test('a password-RECOVERY code arriving during the wait is NOT submitted (live CODE_INVALID cause)', async () => {
        jest.spyOn(MailReader, 'getInstance').mockReturnValue(readerFor(mailbox, lock));
        const account = telegramAccount(mailbox, { code: '482913', deliveryDelayMs: 13_000 });
        setTimeout(() => mailbox.addRecovery('771234'), 5_000);

        const outcome: any = await run(set2fa(ctxFor('919000001234', account)));

        expect(outcome.err).toBeUndefined();
        expect(account.submitted).toEqual(['482913']);
        expect(mailbox.present().map((m) => m.subject)).toEqual(['Your Recovery Code - 771234']); // left alone
    });

    test('no mail at all → clean EMAIL_CODE_TIMEOUT, nothing submitted, lock released', async () => {
        jest.spyOn(MailReader, 'getInstance').mockReturnValue(readerFor(mailbox, lock));
        const account = telegramAccount(mailbox, { code: '482913', deliveryDelayMs: null });

        const outcome: any = await run(set2fa(ctxFor('919000001234', account)));

        expect(String(outcome.err?.message)).toMatch(/^EMAIL_CODE_TIMEOUT: no fresh 2FA mail after 6 polls \(60s\)/);
        expect(account.submitted).toEqual([]);
        expect(await lock.tryAcquire(1000)).not.toBeNull();
    });

    test('a late mail from a timed-out attempt is not reused by the next attempt', async () => {
        const reader = readerFor(mailbox, lock);
        jest.spyOn(MailReader, 'getInstance').mockReturnValue(reader);

        // Attempt 1: Telegram's mail lands 65 s after the request, after every poll budget.
        const first = telegramAccount(mailbox, { code: '333333', deliveryDelayMs: 65_000 });
        const firstOutcome = set2fa(ctxFor('919000001111', first)).then((v) => ({ ok: v }), (e) => ({ err: e }));
        // Attempt 2 starts as soon as attempt 1 gives up; its own mail lands 40 s after its request.
        const second = telegramAccount(mailbox, { code: '444444', deliveryDelayMs: 40_000 });
        const secondOutcome = firstOutcome.then(() =>
            set2fa(ctxFor('919000002222', second)).then((v) => ({ ok: v }), (e) => ({ err: e })),
        );
        await advance(300_000);

        expect(((await firstOutcome) as any).err).toBeDefined();
        expect(first.submitted).toEqual([]);
        expect(((await secondOutcome) as any).err).toBeUndefined();
        expect(second.submitted).toEqual(['444444']);
    });

    test('two fresh 2FA mails with different codes → EMAIL_CODE_AMBIGUOUS, nothing submitted', async () => {
        // e.g. a process on an older build (no shared lock) requested a code at the same moment.
        jest.spyOn(MailReader, 'getInstance').mockReturnValue(readerFor(mailbox, lock));
        const account = telegramAccount(mailbox, { code: '482913', deliveryDelayMs: 4_000 });
        setTimeout(() => mailbox.addTwoFa('555666'), 6_000);

        const outcome: any = await run(set2fa(ctxFor('919000001234', account)));

        expect(String(outcome.err?.message)).toMatch(/^EMAIL_CODE_AMBIGUOUS/);
        expect(account.submitted).toEqual([]);
    });

    test('a concurrent attempt in another process neither steals nor deletes the first attempt\'s code', async () => {
        // cms and ums: separate MailReader instances (separate processes), one inbox, one Redis lock key.
        // 300 ms IMAP round trips, so the two processes' polls overlap as they do on the network.
        const cmsReader = readerFor(mailbox, lock, (imap) => { imap.latencyMs = 300; });
        const umsReader = readerFor(mailbox, lock, (imap) => { imap.latencyMs = 300; });
        jest.spyOn(MailReader, 'getInstance').mockReturnValueOnce(cmsReader).mockReturnValueOnce(umsReader);
        const x = telegramAccount(mailbox, { code: '555555', deliveryDelayMs: 13_000 });
        const y = telegramAccount(mailbox, { code: '666666', deliveryDelayMs: 25_000 });

        const a = set2fa(ctxFor('919000001111', x)).then((v) => ({ ok: v }), (e) => ({ err: e }));
        const b = set2fa(ctxFor('919000002222', y)).then((v) => ({ ok: v }), (e) => ({ err: e }));
        await advance(300_000);

        expect(((await a) as any).err).toBeUndefined();
        expect(((await b) as any).err).toBeUndefined();
        expect(x.submitted).toEqual(['555555']);
        expect(y.submitted).toEqual(['666666']);
    });

    test('IMAP connect failure → clean failure before Telegram is asked for a code; lock released', async () => {
        jest.spyOn(MailReader, 'getInstance').mockReturnValue(readerFor(mailbox, lock, (imap) => {
            imap.failConnect = new Error('Invalid credentials (Failure)');
        }));
        const account = telegramAccount(mailbox, { code: '482913', deliveryDelayMs: 13_000 });

        const outcome: any = await run(set2fa(ctxFor('919000001234', account)));

        expect(String(outcome.err?.message)).toMatch(/Mail connection failed/);
        expect(account.updateTwoFaSettings).not.toHaveBeenCalled();
        expect(await lock.tryAcquire(1000)).not.toBeNull();
    });

    test('Redis down → the attempt proceeds without the shared lock and confirms the fresh code', async () => {
        const deadLock = { tryAcquire: jest.fn().mockRejectedValue(new Error('redis not ready (status=reconnecting)')), release: jest.fn() };
        jest.spyOn(MailReader, 'getInstance').mockReturnValue(readerFor(mailbox, deadLock));
        mailbox.addTwoFa('111111', { sentAt: new Date(Date.now() - 20_000), receivedAt: new Date(Date.now() - 10_000) }); // stale
        const account = telegramAccount(mailbox, { code: '482913', deliveryDelayMs: 13_000 });
        setTimeout(() => mailbox.addRecovery('771234'), 5_000);

        const outcome: any = await run(set2fa(ctxFor('919000001234', account)));

        expect(outcome.err).toBeUndefined();
        expect(account.submitted).toEqual(['482913']);
        expect(deadLock.release).not.toHaveBeenCalled();
    });

    test('lock held by another process for 30 s → waits, then runs and confirms its own code', async () => {
        const other = await lock.tryAcquire(300_000);
        setTimeout(() => void lock.release(other!), 30_000);
        jest.spyOn(MailReader, 'getInstance').mockReturnValue(readerFor(mailbox, lock));
        const account = telegramAccount(mailbox, { code: '482913', deliveryDelayMs: 13_000 });

        const outcome: any = await run(set2fa(ctxFor('919000001234', account)));

        expect(outcome.err).toBeUndefined();
        expect(account.submitted).toEqual(['482913']);
    });

    test('lock held by another process, then Redis fails → EMAIL_LOCK_BUSY, no mailbox use, no Telegram call', async () => {
        const flaky = {
            tryAcquire: jest.fn().mockResolvedValueOnce(null).mockResolvedValueOnce(null).mockRejectedValue(new Error('mailbox lock acquire timed out after 5000ms')),
            release: jest.fn(),
        };
        const connects: FakeImap[] = [];
        jest.spyOn(MailReader, 'getInstance').mockReturnValue(readerFor(mailbox, flaky, (imap) => connects.push(imap)));
        const account = telegramAccount(mailbox, { code: '482913', deliveryDelayMs: 13_000 });

        const outcome: any = await run(set2fa(ctxFor('919000001234', account)), 20_000);

        expect(String(outcome.err?.message)).toMatch(/^EMAIL_LOCK_BUSY/);
        expect(flaky.tryAcquire).toHaveBeenCalledTimes(3);
        expect(connects).toHaveLength(0);
        expect(account.updateTwoFaSettings).not.toHaveBeenCalled();
        expect(account.submitted).toEqual([]);
    });

    test('lock held by another process past the 3 min wait → EMAIL_LOCK_BUSY, Telegram never asked', async () => {
        await lock.tryAcquire(300_000);
        jest.spyOn(MailReader, 'getInstance').mockReturnValue(readerFor(mailbox, lock));
        const account = telegramAccount(mailbox, { code: '482913', deliveryDelayMs: 13_000 });

        const outcome: any = await run(set2fa(ctxFor('919000001234', account)), 200_000);

        expect(String(outcome.err?.message)).toMatch(/^EMAIL_LOCK_BUSY/);
        expect(account.updateTwoFaSettings).not.toHaveBeenCalled();
    });

    test('CODE_INVALID from Telegram stays one normal failure: one submit, no re-ask, no unhandled rejection', async () => {
        jest.spyOn(MailReader, 'getInstance').mockReturnValue(readerFor(mailbox, lock));
        const account = telegramAccount(mailbox, { code: '482913', deliveryDelayMs: 13_000, rejectAll: true });
        const unhandled = jest.fn();
        process.on('unhandledRejection', unhandled);
        try {
            const outcome: any = await run(set2fa(ctxFor('919000001234', account)));
            const realSetImmediate = jest.requireActual('timers').setImmediate as typeof setImmediate;
            await new Promise((r) => realSetImmediate(r));

            expect(outcome.err?.errorMessage).toBe('CODE_INVALID');
            expect(account.submitted).toEqual(['482913']);
            expect(account.updateTwoFaSettings).toHaveBeenCalledTimes(1);
            expect(unhandled).not.toHaveBeenCalled();
            expect(await lock.tryAcquire(1000)).not.toBeNull();
        } finally {
            process.off('unhandledRejection', unhandled);
        }
    });

    test('a second code request inside one attempt is refused, never read from the inbox', async () => {
        jest.spyOn(MailReader, 'getInstance').mockReturnValue(readerFor(mailbox, lock));
        let second: Promise<unknown> | undefined;
        const updateTwoFaSettings = jest.fn(async ({ emailCodeCallback }: any) => {
            setTimeout(() => mailbox.addTwoFa('482913'), 13_000);
            await emailCodeCallback(6);
            second = emailCodeCallback(6).then(() => 'resolved', (e: Error) => e.message);
        });
        const ctx = ctxFor('919000001234', { updateTwoFaSettings } as any);

        const outcome: any = await run(set2fa(ctx));

        expect(outcome.err).toBeUndefined();
        expect(await second).toMatch(/^EMAIL_CODE_SECOND_REQUEST/);
    });
});
