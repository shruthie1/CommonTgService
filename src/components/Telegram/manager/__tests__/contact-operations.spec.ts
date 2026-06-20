jest.mock('fs');
import { Api } from 'telegram';
import * as fs from 'fs';
const mockedFs = fs as jest.Mocked<typeof fs>;
import {
    addContact,
    addContacts,
    getContacts,
    blockUser,
    exportContacts,
    importContacts,
    manageBlockList,
    getContactStatistics,
    sendContactsFile,
} from '../contact-operations';

function makeCtx(client: any) {
    return {
        client,
        phoneNumber: '900',
        logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
    } as any;
}

function makeUser(props: Record<string, unknown>) {
    return Object.assign(Object.create(Api.User.prototype), props);
}

describe('addContact', () => {
    afterEach(() => jest.useRealTimers());

    test('adds all contacts, delaying between them', async () => {
        jest.useFakeTimers();
        const invoke = jest.fn().mockResolvedValue(undefined);
        const ctx = makeCtx({ invoke });
        const data = [{ mobile: '1', tgId: 'a' }, { mobile: '2', tgId: 'b' }];
        const promise = addContact(ctx, data, 'Name');
        await jest.runAllTimersAsync();
        await promise;
        expect(invoke).toHaveBeenCalledTimes(2);
        expect(invoke.mock.calls[0][0]).toBeInstanceOf(Api.contacts.AddContact);
    });

    test('stops batch on FLOOD_WAIT', async () => {
        const invoke = jest.fn().mockRejectedValue({ seconds: 30 });
        const ctx = makeCtx({ invoke });
        await addContact(ctx, [{ mobile: '1', tgId: 'a' }, { mobile: '2', tgId: 'b' }], 'N');
        expect(invoke).toHaveBeenCalledTimes(1);
        expect(ctx.logger.warn).toHaveBeenCalledWith('900', expect.stringContaining('FLOOD_WAIT 30s'));
    });

    test('logs transient (non-permanent) errors and continues the batch', async () => {
        jest.useFakeTimers();
        const invoke = jest.fn()
            .mockRejectedValueOnce({ errorMessage: 'BAD' }) // transient/unknown -> keep going
            .mockResolvedValueOnce(undefined);
        const ctx = makeCtx({ invoke });
        const promise = addContact(ctx, [{ mobile: '1', tgId: 'a' }, { mobile: '2', tgId: 'b' }], 'N');
        await jest.runAllTimersAsync();
        await promise;
        expect(invoke).toHaveBeenCalledTimes(2);
    });

    test('aborts the batch on a PERMANENT error instead of hammering a dead account', async () => {
        // Session-survival: a revoked/banned account must not keep being invoked for every
        // remaining contact. The error is re-thrown so the caller can mark-and-skip.
        const invoke = jest.fn().mockRejectedValue({ errorMessage: 'SESSION_REVOKED' });
        const ctx = makeCtx({ invoke });
        await expect(
            addContact(ctx, [{ mobile: '1', tgId: 'a' }, { mobile: '2', tgId: 'b' }, { mobile: '3', tgId: 'c' }], 'N'),
        ).rejects.toMatchObject({ errorMessage: 'SESSION_REVOKED' });
        expect(invoke).toHaveBeenCalledTimes(1); // stopped after the first permanent failure
        expect(ctx.logger.error).toHaveBeenCalledWith('900', expect.stringContaining('Permanent error'), expect.anything());
    });

    test('outer catch logs when data is not iterable', async () => {
        const ctx = makeCtx({ invoke: jest.fn() });
        await expect(addContact(ctx, null as any, 'N')).resolves.toBeUndefined();
        expect(ctx.logger.error).toHaveBeenCalledWith('900', 'Error adding contacts:', expect.anything());
    });

    test('inner catch logs non-flood add failures without throwing', async () => {
        const ctx = makeCtx(null); // ctx.client null -> ctx.client.invoke throws TypeError inside inner try
        await expect(addContact(ctx, [{ mobile: '1', tgId: 'a' }], 'N')).resolves.toBeUndefined();
        // TypeError has no flood seconds -> logged via logger.info, no throw, no outer error
        expect(ctx.logger.info).toHaveBeenCalled();
    });
});

describe('addContacts', () => {
    test('imports contacts', async () => {
        const invoke = jest.fn().mockResolvedValue({ imported: [] });
        const ctx = makeCtx({ invoke });
        await addContacts(ctx, ['1', '2'], 'N');
        expect(invoke).toHaveBeenCalledTimes(1);
        expect(invoke.mock.calls[0][0]).toBeInstanceOf(Api.contacts.ImportContacts);
    });
    test('handles error', async () => {
        const ctx = makeCtx({ invoke: jest.fn().mockRejectedValue(new Error('x')) });
        await addContacts(ctx, ['1'], 'N');
        expect(ctx.logger.error).toHaveBeenCalled();
    });
});

describe('getContacts', () => {
    test('throws if no client', async () => {
        await expect(getContacts(makeCtx(null))).rejects.toThrow('Client is not initialized');
    });
    test('returns invoke result', async () => {
        const result = { users: [] };
        const ctx = makeCtx({ invoke: jest.fn().mockResolvedValue(result) });
        expect(await getContacts(ctx)).toBe(result);
    });
    test('rethrows on error', async () => {
        const ctx = makeCtx({ invoke: jest.fn().mockRejectedValue(new Error('fail')) });
        await expect(getContacts(ctx)).rejects.toThrow('fail');
        expect(ctx.logger.error).toHaveBeenCalled();
    });
});

describe('blockUser', () => {
    test('blocks', async () => {
        const invoke = jest.fn().mockResolvedValue(undefined);
        const ctx = makeCtx({ invoke });
        await blockUser(ctx, '55');
        expect(invoke.mock.calls[0][0]).toBeInstanceOf(Api.contacts.Block);
        expect(ctx.logger.info).toHaveBeenCalled();
    });
    test('logs error', async () => {
        const ctx = makeCtx({ invoke: jest.fn().mockRejectedValue(new Error('x')) });
        await blockUser(ctx, '55');
        expect(ctx.logger.error).toHaveBeenCalled();
    });
});

describe('exportContacts', () => {
    test('throws if no client', async () => {
        await expect(exportContacts(makeCtx(null), 'csv')).rejects.toThrow('Client not initialized');
    });
    test('csv format without blocked', async () => {
        const users = [makeUser({ id: { toString: () => '1' }, firstName: 'A', lastName: 'B', phone: '9' })];
        const ctx = makeCtx({ invoke: jest.fn().mockResolvedValue({ users }) });
        const csv = await exportContacts(ctx, 'csv');
        expect(csv).toContain('A,B,9,false');
    });
    test('csv with includeBlocked marks blocked users', async () => {
        const user = makeUser({ id: { toString: () => '1' }, firstName: 'A', lastName: 'B', phone: '9' });
        const blocked = new Api.contacts.Blocked({
            blocked: [Object.assign(Object.create(Api.PeerBlocked.prototype), {
                peerId: Object.assign(Object.create(Api.PeerUser.prototype), { userId: { toString: () => '1' } }),
            })] as any,
            chats: [],
            users: [],
        });
        const invoke = jest.fn()
            .mockResolvedValueOnce({ users: [user] })
            .mockResolvedValueOnce(blocked);
        const ctx = makeCtx({ invoke });
        const csv = await exportContacts(ctx, 'csv', true);
        expect(csv).toContain('A,B,9,true');
    });
    test('vcard format', async () => {
        const users = [makeUser({ id: { toString: () => '1' }, firstName: 'A', lastName: 'B', phone: '9' })];
        const ctx = makeCtx({ invoke: jest.fn().mockResolvedValue({ users }) });
        const vcard = await exportContacts(ctx, 'vcard');
        expect(vcard).toContain('BEGIN:VCARD');
    });
    test('handles missing users key', async () => {
        const ctx = makeCtx({ invoke: jest.fn().mockResolvedValue({}) });
        const csv = await exportContacts(ctx, 'csv');
        expect(csv).toContain('First Name');
    });
    test('csv blanks out contacts missing name/phone fields', async () => {
        // A real contact synced without a saved name or phone (privacy-limited)
        const users = [makeUser({ id: { toString: () => '7' }, firstName: undefined, lastName: undefined, phone: undefined })];
        const ctx = makeCtx({ invoke: jest.fn().mockResolvedValue({ users }) });
        const csv = await exportContacts(ctx, 'csv');
        // empty firstName/lastName/phone columns, not blocked
        expect(csv).toContain(',,,false');
    });
    test('csv with includeBlocked tolerates empty block list and non-user peers', async () => {
        const user = makeUser({ id: { toString: () => '1' }, firstName: 'A', lastName: 'B', phone: '9' });
        // Blocked payload where the `blocked` array is absent and a chat peer (non-PeerUser) is present
        const blocked = Object.assign(Object.create(Api.contacts.Blocked.prototype), {
            blocked: undefined,
            chats: [],
            users: [],
        });
        const invoke = jest.fn()
            .mockResolvedValueOnce({ users: [user] })
            .mockResolvedValueOnce(blocked);
        const ctx = makeCtx({ invoke });
        const csv = await exportContacts(ctx, 'csv', true);
        // no blocked entries → user reported not blocked
        expect(csv).toContain('A,B,9,false');
    });
    test('csv with includeBlocked ignores non-PeerUser blocked entries', async () => {
        const user = makeUser({ id: { toString: () => '1' }, firstName: 'A', lastName: 'B', phone: '9' });
        const blocked = new Api.contacts.Blocked({
            blocked: [Object.assign(Object.create(Api.PeerBlocked.prototype), {
                // a blocked channel/chat, not a user — must not match the contact
                peerId: Object.assign(Object.create(Api.PeerChat.prototype), { chatId: { toString: () => '1' } }),
            })] as any,
            chats: [],
            users: [],
        });
        const invoke = jest.fn()
            .mockResolvedValueOnce({ users: [user] })
            .mockResolvedValueOnce(blocked);
        const ctx = makeCtx({ invoke });
        const csv = await exportContacts(ctx, 'csv', true);
        expect(csv).toContain('A,B,9,false');
    });
});

describe('importContacts', () => {
    afterEach(() => jest.useRealTimers());

    test('throws if no client', async () => {
        await expect(importContacts(makeCtx(null), [])).rejects.toThrow('Client not initialized');
    });
    test('imports successfully with delay between', async () => {
        jest.useFakeTimers();
        const ctx = makeCtx({ invoke: jest.fn().mockResolvedValue(undefined) });
        const promise = importContacts(ctx, [{ firstName: 'A', phone: '1' }, { firstName: 'B', phone: '2' }]);
        await jest.runAllTimersAsync();
        const results = await promise;
        expect(results).toEqual([{ success: true, phone: '1' }, { success: true, phone: '2' }]);
    });
    test('records errors and stops on flood wait', async () => {
        const ctx = makeCtx({ invoke: jest.fn().mockRejectedValue({ errorMessage: 'FLOOD_WAIT_42' }) });
        const results = await importContacts(ctx, [{ firstName: 'A', phone: '1' }, { firstName: 'B', phone: '2' }]);
        expect(results).toEqual([{ success: false, phone: '1', error: 'FLOOD_WAIT_42' }]);
    });
    test('records generic (transient) error and continues', async () => {
        jest.useFakeTimers();
        const ctx = makeCtx({
            invoke: jest.fn()
                .mockRejectedValueOnce(new Error('nope'))
                .mockResolvedValueOnce(undefined),
        });
        const promise = importContacts(ctx, [{ firstName: 'A', phone: '1' }, { firstName: 'B', phone: '2' }]);
        await jest.runAllTimersAsync();
        const results = await promise;
        expect(results[0]).toEqual({ success: false, phone: '1', error: 'nope' });
        expect(results[1]).toEqual({ success: true, phone: '2' });
    });

    test('stops the batch on a PERMANENT error (does not keep invoking on a dead account)', async () => {
        const invoke = jest.fn().mockRejectedValue({ errorMessage: 'USER_DEACTIVATED_BAN' });
        const ctx = makeCtx({ invoke });
        const results = await importContacts(ctx, [{ firstName: 'A', phone: '1' }, { firstName: 'B', phone: '2' }, { firstName: 'C', phone: '3' }]);
        expect(invoke).toHaveBeenCalledTimes(1);       // stopped after the first permanent failure
        expect(results).toHaveLength(1);
        expect(results[0].success).toBe(false);
        expect(ctx.logger.error).toHaveBeenCalledWith('900', expect.stringContaining('Permanent error'), expect.anything());
    });
});

describe('manageBlockList', () => {
    afterEach(() => jest.useRealTimers());

    test('throws if no client', async () => {
        await expect(manageBlockList(makeCtx(null), [], true)).rejects.toThrow('Client not initialized');
    });
    test('blocks users', async () => {
        jest.useFakeTimers();
        const ctx = makeCtx({
            invoke: jest.fn().mockResolvedValue(undefined),
            getInputEntity: jest.fn().mockResolvedValue('entity'),
        });
        const promise = manageBlockList(ctx, ['u1', 'u2'], true);
        await jest.runAllTimersAsync();
        const results = await promise;
        expect(results).toEqual([{ success: true, userId: 'u1' }, { success: true, userId: 'u2' }]);
        expect(ctx.client.invoke.mock.calls[0][0]).toBeInstanceOf(Api.contacts.Block);
    });
    test('unblocks users', async () => {
        const ctx = makeCtx({
            invoke: jest.fn().mockResolvedValue(undefined),
            getInputEntity: jest.fn().mockResolvedValue('entity'),
        });
        const results = await manageBlockList(ctx, ['u1'], false);
        expect(results).toEqual([{ success: true, userId: 'u1' }]);
        expect(ctx.client.invoke.mock.calls[0][0]).toBeInstanceOf(Api.contacts.Unblock);
    });
    test('stops on flood wait', async () => {
        const ctx = makeCtx({
            invoke: jest.fn().mockRejectedValue({ seconds: 10 }),
            getInputEntity: jest.fn().mockResolvedValue('entity'),
        });
        const results = await manageBlockList(ctx, ['u1', 'u2'], true);
        expect(results).toEqual([{ success: false, userId: 'u1', error: 'FLOOD_WAIT_10' }]);
    });
    test('stops on flood wait during unblock with unblock-specific warning', async () => {
        const ctx = makeCtx({
            invoke: jest.fn().mockRejectedValue({ seconds: 25 }),
            getInputEntity: jest.fn().mockResolvedValue('entity'),
        });
        const results = await manageBlockList(ctx, ['u1', 'u2'], false);
        expect(results).toEqual([{ success: false, userId: 'u1', error: 'FLOOD_WAIT_25' }]);
        expect(ctx.logger.warn).toHaveBeenCalledWith('900', expect.stringContaining('during unblock'));
    });
    test('records generic (transient) error and continues', async () => {
        jest.useFakeTimers();
        const ctx = makeCtx({
            invoke: jest.fn()
                .mockRejectedValueOnce(new Error('bad'))
                .mockResolvedValueOnce(undefined),
            getInputEntity: jest.fn().mockResolvedValue('entity'),
        });
        const promise = manageBlockList(ctx, ['u1', 'u2'], true);
        await jest.runAllTimersAsync();
        const results = await promise;
        expect(results[0]).toEqual({ success: false, userId: 'u1', error: 'bad' });
        expect(results[1]).toEqual({ success: true, userId: 'u2' });
    });

    test('stops the batch on a PERMANENT error', async () => {
        const invoke = jest.fn().mockRejectedValue({ errorMessage: 'AUTH_KEY_UNREGISTERED' });
        const ctx = makeCtx({ invoke, getInputEntity: jest.fn().mockResolvedValue('entity') });
        const results = await manageBlockList(ctx, ['u1', 'u2', 'u3'], true);
        expect(invoke).toHaveBeenCalledTimes(1);    // stopped after the first permanent failure
        expect(results).toHaveLength(1);
        expect(ctx.logger.error).toHaveBeenCalledWith('900', expect.stringContaining('Permanent error'), expect.anything());
    });
});

describe('getContactStatistics', () => {
    test('throws if no client', async () => {
        await expect(getContactStatistics(makeCtx(null))).rejects.toThrow('Client not initialized');
    });
    test('computes stats with correct online vs last-week-active semantics', async () => {
        const recentMs = Math.floor(Date.now() / 1000);
        const oldMs = Math.floor((Date.now() - 30 * 86400000) / 1000);
        // Genuinely online right now.
        const online = makeUser({ phone: '1', mutualContact: true, status: Object.create(Api.UserStatusOnline.prototype) });
        // Offline but seen within the last week -> counts as lastWeekActive, NOT online.
        const recentlyOffline = makeUser({ phone: '2', status: Object.assign(Object.create(Api.UserStatusOffline.prototype), { wasOnline: recentMs }) });
        // Offline and stale -> neither online nor lastWeekActive.
        const stale = makeUser({ phone: '3', status: Object.assign(Object.create(Api.UserStatusOffline.prototype), { wasOnline: oldMs }) });
        const noStatus = makeUser({ phone: undefined });
        const ctx = makeCtx({ invoke: jest.fn().mockResolvedValue({ users: [online, recentlyOffline, stale, noStatus] }) });
        const stats = await getContactStatistics(ctx);
        expect(stats.total).toBe(4);
        expect(stats.online).toBe(1);          // only the UserStatusOnline contact
        expect(stats.withPhone).toBe(3);
        expect(stats.mutual).toBe(1);
        expect(stats.lastWeekActive).toBe(1);  // only the recently-offline contact
    });
    test('returns zeroed stats when GetContacts yields no users key', async () => {
        // ContactsNotModified-style response has no `users` field
        const ctx = makeCtx({ invoke: jest.fn().mockResolvedValue({}) });
        const stats = await getContactStatistics(ctx);
        expect(stats).toEqual({ total: 0, online: 0, withPhone: 0, mutual: 0, lastWeekActive: 0 });
    });
});

describe('sendContactsFile', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        mockedFs.existsSync.mockReturnValue(true);
        mockedFs.writeFileSync.mockImplementation(() => undefined);
        mockedFs.readFileSync.mockReturnValue(Buffer.from('vcard') as any);
        mockedFs.statSync.mockReturnValue({ size: 5 } as any);
        mockedFs.unlinkSync.mockImplementation(() => undefined);
        mockedFs.mkdirSync.mockImplementation(() => undefined as any);
    });

    test('throws if no client', async () => {
        await expect(sendContactsFile(makeCtx(null), 'c', { users: [] } as any)).rejects.toThrow('Client is not initialized');
    });
    test('writes, sends, and cleans up temp file', async () => {
        const sendFile = jest.fn().mockResolvedValue(undefined);
        const ctx = makeCtx({ sendFile });
        const contacts = { users: [makeUser({ firstName: 'A', lastName: 'B', phone: '9' })] } as any;
        await sendContactsFile(ctx, 'chat1', contacts);
        expect(mockedFs.writeFileSync).toHaveBeenCalled();
        expect(sendFile).toHaveBeenCalledWith('chat1', expect.objectContaining({ forceDocument: true }));
        expect(mockedFs.unlinkSync).toHaveBeenCalled();
    });
    test('creates contacts dir when missing', async () => {
        mockedFs.existsSync.mockReturnValueOnce(false).mockReturnValue(true);
        const ctx = makeCtx({ sendFile: jest.fn().mockResolvedValue(undefined) });
        await sendContactsFile(ctx, 'c', { users: [] } as any);
        expect(mockedFs.mkdirSync).toHaveBeenCalledWith('./contacts', { recursive: true });
    });
    test('skips unlink in finally when temp file no longer exists', async () => {
        // dir './contacts' exists (skip mkdir) but temp file is already gone by cleanup time
        mockedFs.existsSync.mockImplementation((p: any) => p === './contacts');
        const sendFile = jest.fn().mockResolvedValue(undefined);
        const ctx = makeCtx({ sendFile });
        await sendContactsFile(ctx, 'chat9', { users: [] } as any);
        expect(sendFile).toHaveBeenCalled();
        expect(mockedFs.unlinkSync).not.toHaveBeenCalled();
    });
    test('rethrows and still cleans up on sendFile failure', async () => {
        const ctx = makeCtx({ sendFile: jest.fn().mockRejectedValue(new Error('send fail')) });
        await expect(sendContactsFile(ctx, 'c', { users: [] } as any)).rejects.toThrow('send fail');
        expect(mockedFs.unlinkSync).toHaveBeenCalled();
        expect(ctx.logger.error).toHaveBeenCalled();
    });
});
