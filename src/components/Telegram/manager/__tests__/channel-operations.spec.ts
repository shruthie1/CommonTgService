jest.mock('telegram/Helpers', () => {
    const actual = jest.requireActual('telegram/Helpers');
    return { ...actual, sleep: jest.fn().mockResolvedValue(undefined) };
});
jest.mock('../helpers', () => {
    const actual = jest.requireActual('../helpers');
    return { ...actual, downloadFileFromUrl: jest.fn().mockResolvedValue(Buffer.from('img')) };
});
jest.mock('../../utils/connection-manager', () => ({
    connectionManager: { unregisterClient: jest.fn().mockResolvedValue(undefined) },
    unregisterClient: jest.fn().mockResolvedValue(undefined),
}));

import { Api } from 'telegram';
import bigInt from 'big-integer';
import {
    leaveChannels,
    forwardMedia,
    createGroup,
    archiveChat,
    joinChannel,
    getGrpMembers,
    addGroupMembers,
    removeGroupMembers,
    promoteToAdmin,
    demoteAdmin,
    unblockGroupUser,
    getGroupAdmins,
    getGroupBannedUsers,
    createGroupOrChannel,
    createGroupWithOptions,
    updateGroupSettings,
} from '../channel-operations';

function makeCtx(client: any) {
    return {
        client,
        phoneNumber: '900',
        logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
    } as any;
}

function makeChannelEntity(id: string, overrides: Record<string, unknown> = {}) {
    return Object.assign(Object.create(Api.Channel.prototype), {
        id: {
            toString: () => id,
        },
        broadcast: true,
        ...overrides,
    });
}

describe('leaveChannels', () => {
    test('resolves a -100 chat ID consistently against dialog entities', async () => {
        const channel = makeChannelEntity('1179403119');
        const ctx = {
            phoneNumber: '9990004444',
            logger: {
                info: jest.fn(),
                warn: jest.fn(),
                error: jest.fn(),
                debug: jest.fn(),
            },
            client: {
                iterDialogs: async function* () {
                    yield { entity: channel };
                },
                getMe: jest.fn().mockResolvedValue({ id: 'me' }),
                invoke: jest.fn().mockResolvedValue(undefined),
            },
        } as any;

        const result = await leaveChannels(ctx, ['-1001179403119']);

        expect(result).toEqual({
            successCount: 1,
            skipCount: 0,
            totalCount: 1,
        });
        expect(ctx.client.invoke).toHaveBeenCalledTimes(1);
        expect(ctx.logger.warn).not.toHaveBeenCalledWith(
            ctx.phoneNumber,
            expect.stringContaining('not found in dialogs'),
        );
    });

    test('reports skipped chats when requested IDs are no longer in dialogs', async () => {
        const ctx = {
            phoneNumber: '9990004445',
            logger: {
                info: jest.fn(),
                warn: jest.fn(),
                error: jest.fn(),
                debug: jest.fn(),
            },
            client: {
                iterDialogs: async function* () {
                    return;
                },
                getMe: jest.fn().mockResolvedValue({ id: 'me' }),
                invoke: jest.fn(),
            },
        } as any;

        const result = await leaveChannels(ctx, ['1179403119']);

        expect(result).toEqual({
            successCount: 0,
            skipCount: 1,
            totalCount: 1,
        });
    });

    test('returns zeroed result for empty input', async () => {
        const ctx = makeCtx({ iterDialogs: jest.fn(), getMe: jest.fn() });
        const result = await leaveChannels(ctx, []);
        expect(result).toEqual({ successCount: 0, skipCount: 0, totalCount: 0 });
    });

    test('leaves a basic group chat via DeleteChatUser', async () => {
        const chat = Object.assign(Object.create(Api.Chat.prototype), { id: { toString: () => '500' } });
        const ctx = makeCtx({
            iterDialogs: async function* () { yield { entity: chat }; },
            getMe: jest.fn().mockResolvedValue(Object.assign(Object.create(Api.User.prototype), { id: 'me' })),
            invoke: jest.fn().mockResolvedValue(undefined),
        });
        const result = await leaveChannels(ctx, ['500']);
        expect(result.successCount).toBe(1);
        expect(ctx.client.invoke.mock.calls[0][0]).toBeInstanceOf(Api.messages.DeleteChatUser);
    });

    test('skips unknown entity types', async () => {
        const weird = Object.assign(Object.create(Api.ChatForbidden.prototype), { id: { toString: () => '501' } });
        const ctx = makeCtx({
            iterDialogs: async function* () { yield { entity: weird }; },
            getMe: jest.fn().mockResolvedValue({ id: 'me' }),
            invoke: jest.fn(),
        });
        // ChatForbidden is not a Channel or Chat -> not in entityMap (isChannelOrGroupEntity false) -> all skipped
        const result = await leaveChannels(ctx, ['501']);
        expect(result.skipCount).toBe(1);
    });

    test('throws on permanent error while leaving', async () => {
        const channel = makeChannelEntity('600');
        const ctx = makeCtx({
            iterDialogs: async function* () { yield { entity: channel }; },
            getMe: jest.fn().mockResolvedValue({ id: 'me' }),
            invoke: jest.fn().mockRejectedValue(new Error('USER_DEACTIVATED')),
        });
        await expect(leaveChannels(ctx, ['600'])).rejects.toThrow(/USER_DEACTIVATED/);
    });

    test('counts temporary errors as skips', async () => {
        const channel = makeChannelEntity('700');
        const ctx = makeCtx({
            iterDialogs: async function* () { yield { entity: channel }; },
            getMe: jest.fn().mockResolvedValue({ id: 'me' }),
            invoke: jest.fn().mockRejectedValue(new Error('FLOOD_WAIT')),
        });
        const result = await leaveChannels(ctx, ['700']);
        expect(result.skipCount).toBe(1);
        expect(result.successCount).toBe(0);
    });

    test('rethrows when dialog iteration fails', async () => {
        const ctx = makeCtx({
            iterDialogs: async function* () { throw new Error('iter fail'); },
            getMe: jest.fn(),
            invoke: jest.fn(),
        });
        await expect(leaveChannels(ctx, ['1'])).rejects.toThrow('iter fail');
    });
});

describe('leaveChannels skip branch', () => {
    test('skips requested ids missing from the matched entity map', async () => {
        // Two requested ids; only one is present in dialogs -> the other hits the !entityData skip branch
        const channel = makeChannelEntity('800');
        const ctx = makeCtx({
            iterDialogs: async function* () { yield { entity: channel }; },
            getMe: jest.fn().mockResolvedValue({ id: 'me' }),
            invoke: jest.fn().mockResolvedValue(undefined),
        });
        const result = await leaveChannels(ctx, ['800', '999']);
        expect(result.successCount).toBe(1);
        expect(result.skipCount).toBe(1);
        expect(result.totalCount).toBe(2);
    });
});

describe('forwardMedia', () => {
    // No sibling spies: the REAL forwardSecretMsgs / searchMessages / forwardMessages /
    // getTopPrivateChats run, driven through the fake GramJS client. We assert the REAL
    // forwarded-message counts (client.forwardMessages call args).

    // A real photo media so forwardSecretMsgs keeps the message id and forwards it.
    function photoMessage(id: number) {
        const media = Object.assign(Object.create(Api.MessageMediaPhoto.prototype), {
            photo: Object.create(Api.Photo.prototype),
        });
        return Object.assign(Object.create(Api.Message.prototype), { id, message: '', date: 1700000000, media });
    }

    test('forwards real media ids from explicit chat then leaves channel and unregisters', async () => {
        const channel = makeChannelEntity('1000', { accessHash: bigInt(1) });
        // Source chat has two media messages and one text-only message; only the two media
        // ids should be forwarded by the real forwardSecretMsgs.
        const sourceMessages = [
            photoMessage(11),
            photoMessage(12),
            Object.assign(Object.create(Api.Message.prototype), { id: 13, message: 'text', date: 1700000000, media: undefined }),
        ];
        let getMessagesCall = 0;
        const getMessages = jest.fn(async () => (getMessagesCall++ === 0 ? sourceMessages : []));
        const forwardMessages = jest.fn().mockResolvedValue(undefined);
        const ctx = makeCtx({
            // joinChannel -> getEntity + invoke returning chats
            getEntity: jest.fn().mockResolvedValue('entity'),
            invoke: jest.fn().mockResolvedValue({ chats: [{ id: bigInt(1000), accessHash: bigInt(1) }] }),
            getMe: jest.fn().mockResolvedValue(Object.assign(Object.create(Api.User.prototype), { id: { toString: () => 'me' } })),
            iterDialogs: async function* () { yield { entity: channel }; },
            getMessages,
            forwardMessages,
        });
        await forwardMedia(ctx, 'targetChannel', 'fromChat');
        // Real forwardSecretMsgs forwarded exactly the two media ids in one batch.
        expect(forwardMessages).toHaveBeenCalledTimes(1);
        expect(forwardMessages.mock.calls[0][1]).toEqual({ messages: [11, 12], fromPeer: 'fromChat' });
        const { connectionManager } = require('../../utils/connection-manager');
        expect(connectionManager.unregisterClient).toHaveBeenCalledWith('900');
    });

    test('catches errors and skips cleanup when self lookup fails (no channelId)', async () => {
        // fromChatId='' -> real getTopPrivateChats runs; getMe resolves undefined so it throws
        // "Failed to fetch self userInfo", which forwardMedia catches; no channelId => no cleanup.
        const unregister = require('../../utils/connection-manager').connectionManager.unregisterClient;
        unregister.mockClear();
        const ctx = makeCtx({ getMe: jest.fn().mockResolvedValue(undefined) });
        await forwardMedia(ctx, 'ch', '');
        expect(ctx.logger.info).toHaveBeenCalled();
        expect(unregister).not.toHaveBeenCalled();
    });

    test('creates group when no fromChat and forwards real top-private-chat media', async () => {
        // Drive the REAL getTopPrivateChats: one non-bot user dialog with >=10 messages,
        // then the REAL searchMessages returns one photo + one video id per chat, and the
        // REAL forwardMessages forwards them.
        const channel = makeChannelEntity('2000', { accessHash: bigInt(1) });
        const user = Object.assign(Object.create(Api.User.prototype), {
            id: bigInt(2), firstName: 'Top', lastName: 'Chat', username: 'u', phone: '1', bot: false,
        });
        const me = Object.assign(Object.create(Api.User.prototype), { id: { toString: () => 'me' } });
        // searchMessages results: a photo message id 101 and a video message id 102.
        const photoMsg = photoMessage(101);
        const videoDoc = Object.assign(Object.create(Api.Document.prototype), {
            attributes: [new Api.DocumentAttributeVideo({ duration: 1, w: 1, h: 1 } as any)], mimeType: 'video/mp4', size: 100,
        });
        const videoMediaMsg = Object.assign(Object.create(Api.Message.prototype), {
            id: 102, message: '', date: 1700000000,
            media: Object.assign(Object.create(Api.MessageMediaDocument.prototype), { document: videoDoc }),
        });
        const forwardMessages = jest.fn().mockResolvedValue(undefined);
        const invoke = jest.fn(async (req: any) => {
            // getTopPrivateChats global call scan + searchMessages Search both go through invoke.
            if (req instanceof Api.messages.Search) {
                // searchMessages photo/video filters; return the relevant media per filter.
                if (req.filter instanceof Api.InputMessagesFilterPhotos) {
                    return Object.assign(Object.create(Api.messages.ChannelMessages.prototype), { messages: [photoMsg], count: 1 });
                }
                if (req.filter instanceof Api.InputMessagesFilterVideo) {
                    return Object.assign(Object.create(Api.messages.ChannelMessages.prototype), { messages: [videoMediaMsg], count: 1 });
                }
                // The call-history scan inside getTopPrivateChats (PhoneCalls filter) -> no messages.
                return Object.assign(Object.create(Api.messages.Messages.prototype), { messages: [] });
            }
            // createGroup / archiveChat / leaveChannel invokes
            return { chats: [{ id: bigInt(2000), accessHash: bigInt(1) }] };
        });
        // getMessages: total-count probe inside getTopPrivateChats (>=10 so the chat is kept).
        const getMessages = jest.fn(async () => Object.assign([photoMessage(1)], { total: 20 }));
        const ctx = makeCtx({
            invoke,
            getMessages,
            forwardMessages,
            getEntity: jest.fn().mockResolvedValue(Object.create(Api.Channel.prototype)),
            getMe: jest.fn().mockResolvedValue(me),
            iterDialogs: async function* () {
                yield { isUser: true, entity: user, message: { date: 1700000000 } };
                yield { entity: channel };
            },
        });
        await forwardMedia(ctx, '', '');
        // Real flow forwarded the photo batch [101] and the video batch [102] for each chat.
        const batches = forwardMessages.mock.calls.map((c: any[]) => c[1].messages);
        expect(batches).toContainEqual([101]);
        expect(batches).toContainEqual([102]);
    });

    test('createOrJoinChannel falls back to createGroup when join fails', async () => {
        const channel = makeChannelEntity('3000', { accessHash: bigInt(1) });
        const sourceMessages = [photoMessage(31)];
        let getMessagesCall = 0;
        const getMessages = jest.fn(async () => (getMessagesCall++ === 0 ? sourceMessages : []));
        const forwardMessages = jest.fn().mockResolvedValue(undefined);
        const ctx = makeCtx({
            // getEntity rejects -> joinChannel throws -> createOrJoinChannel falls back to createGroup
            getEntity: jest.fn().mockRejectedValue(new Error('join fail')),
            invoke: jest.fn().mockResolvedValue({ chats: [{ id: bigInt(3000), accessHash: bigInt(1) }] }),
            getMe: jest.fn().mockResolvedValue(Object.assign(Object.create(Api.User.prototype), { id: { toString: () => 'me' } })),
            iterDialogs: async function* () { yield { entity: channel }; },
            getMessages,
            forwardMessages,
        });
        await forwardMedia(ctx, 'someChannel', 'fromChat');
        // After falling back to createGroup, real forwardSecretMsgs forwarded the one media id.
        expect(forwardMessages).toHaveBeenCalledTimes(1);
        expect(forwardMessages.mock.calls[0][1]).toEqual({ messages: [31], fromPeer: 'fromChat' });
    });
});

describe('createGroup / archiveChat', () => {
    test('createGroup creates channel, archives, invites', async () => {
        const channel = { id: bigInt(10), accessHash: bigInt(20) };
        const invoke = jest.fn().mockResolvedValue({ chats: [channel] });
        const ctx = makeCtx({ invoke });
        const result = await createGroup(ctx);
        expect(result).toEqual({ id: bigInt(10), accessHash: bigInt(20) });
        // CreateChannel, EditPeerFolders (archive), InviteToChannel
        expect(invoke).toHaveBeenCalledTimes(3);
        expect(invoke.mock.calls[0][0]).toBeInstanceOf(Api.channels.CreateChannel);
        expect(invoke.mock.calls[2][0]).toBeInstanceOf(Api.channels.InviteToChannel);
    });

    test('archiveChat invokes EditPeerFolders', async () => {
        const invoke = jest.fn().mockResolvedValue({ ok: true });
        const ctx = makeCtx({ invoke });
        await archiveChat(ctx, bigInt(1), bigInt(2));
        expect(invoke.mock.calls[0][0]).toBeInstanceOf(Api.folders.EditPeerFolders);
    });
});

describe('joinChannel', () => {
    test('resolves entity and joins', async () => {
        const invoke = jest.fn().mockResolvedValue({ chats: [] });
        const ctx = makeCtx({ invoke, getEntity: jest.fn().mockResolvedValue('entity') });
        await joinChannel(ctx, 'somechannel');
        expect(ctx.client.getEntity).toHaveBeenCalledWith('somechannel');
        expect(invoke.mock.calls[0][0]).toBeInstanceOf(Api.channels.JoinChannel);
    });
});

describe('getGrpMembers', () => {
    test('returns empty for non channel/chat entity', async () => {
        const ctx = makeCtx({ getEntity: jest.fn().mockResolvedValue(Object.create(Api.User.prototype)) });
        const result = await getGrpMembers(ctx, 'x');
        expect(result.members).toEqual([]);
        expect(result.pagination.hasMore).toBe(false);
    });

    test('fetches participants and resolves users with pagination', async () => {
        const chat = Object.assign(Object.create(Api.Channel.prototype), { title: 'G', username: 'g' });
        const participant = Object.assign(Object.create(Api.ChannelParticipant.prototype), { userId: bigInt(1) });
        const participants = Object.assign(Object.create(Api.channels.ChannelParticipants.prototype), {
            count: 5,
            participants: [participant],
        });
        const user = Object.assign(Object.create(Api.User.prototype), { id: bigInt(1), firstName: 'F', lastName: 'L', username: 'fl' });
        const getEntity = jest.fn()
            .mockResolvedValueOnce(chat)
            .mockResolvedValueOnce(user);
        const ctx = makeCtx({ getEntity, invoke: jest.fn().mockResolvedValue(participants) });
        const result = await getGrpMembers(ctx, 'g', 0, 200);
        expect(result.members).toEqual([{ tgId: bigInt(1), name: 'F L', username: 'fl' }]);
        expect(result.pagination).toEqual({ hasMore: true, nextOffset: 1, total: 5 });
    });

    test('handles participant without userId', async () => {
        const chat = Object.assign(Object.create(Api.Channel.prototype), { title: 'G' });
        const participant = Object.assign(Object.create(Api.ChannelParticipantBanned.prototype), { userId: bigInt(9) });
        const participants = Object.assign(Object.create(Api.channels.ChannelParticipants.prototype), {
            count: 1, participants: [participant],
        });
        const ctx = makeCtx({ getEntity: jest.fn().mockResolvedValue(chat), invoke: jest.fn().mockResolvedValue(participants) });
        const result = await getGrpMembers(ctx, 'g');
        expect(result.members).toEqual([]);
    });

    test('advances nextOffset by participants CONSUMED even when a page resolves no users (no infinite loop)', async () => {
        // Real scenario: a page of GetParticipants is entirely admins/creator/banned (filtered to
        // null), so result.members is empty. nextOffset must still advance by the page size, or the
        // caller (hasMore && re-fetch same offset) loops forever and floods GetParticipants.
        const chat = Object.assign(Object.create(Api.Channel.prototype), { title: 'G' });
        // 3 non-ChannelParticipant entries (admins/banned) -> all filtered out
        const admins = [0, 1, 2].map(i =>
            Object.assign(Object.create(Api.ChannelParticipantAdmin.prototype), { userId: bigInt(100 + i) }),
        );
        const participants = Object.assign(Object.create(Api.channels.ChannelParticipants.prototype), {
            count: 50, participants: admins,
        });
        const ctx = makeCtx({ getEntity: jest.fn().mockResolvedValue(chat), invoke: jest.fn().mockResolvedValue(participants) });
        const result = await getGrpMembers(ctx, 'g', 0, 200);
        expect(result.members).toEqual([]);
        // offset must move forward by the 3 consumed participants, not stay at 0.
        expect(result.pagination.nextOffset).toBe(3);
        expect(result.pagination.hasMore).toBe(true); // 3 < 50, but next fetch uses a new offset
    });

    test('handles non-ChannelParticipants result', async () => {
        const chat = Object.assign(Object.create(Api.Channel.prototype), { title: 'G' });
        const ctx = makeCtx({ getEntity: jest.fn().mockResolvedValue(chat), invoke: jest.fn().mockResolvedValue({}) });
        const result = await getGrpMembers(ctx, 'g');
        expect(result.members).toEqual([]);
    });

    test('returns empty result on error', async () => {
        const ctx = makeCtx({ getEntity: jest.fn().mockRejectedValue(new Error('boom')) });
        const result = await getGrpMembers(ctx, 'g');
        expect(result.members).toEqual([]);
        expect(ctx.logger.error).toHaveBeenCalled();
    });
});

describe('member management', () => {
    test('addGroupMembers throws without client', async () => {
        await expect(addGroupMembers(makeCtx(null), 'g', [])).rejects.toThrow('Client not initialized');
    });
    test('addGroupMembers invites', async () => {
        const ctx = makeCtx({ getInputEntity: jest.fn().mockResolvedValue('e'), invoke: jest.fn().mockResolvedValue(undefined) });
        await addGroupMembers(ctx, 'g', ['u1', 'u2']);
        expect(ctx.client.invoke.mock.calls[0][0]).toBeInstanceOf(Api.channels.InviteToChannel);
    });
    test('removeGroupMembers throws without client', async () => {
        await expect(removeGroupMembers(makeCtx(null), 'g', [])).rejects.toThrow('Client not initialized');
    });
    test('removeGroupMembers bans each member', async () => {
        const ctx = makeCtx({ getInputEntity: jest.fn().mockResolvedValue('e'), invoke: jest.fn().mockResolvedValue(undefined) });
        await removeGroupMembers(ctx, 'g', ['u1', 'u2']);
        expect(ctx.client.invoke).toHaveBeenCalledTimes(2);
        expect(ctx.client.invoke.mock.calls[0][0]).toBeInstanceOf(Api.channels.EditBanned);
    });
});

describe('admin operations', () => {
    test('promoteToAdmin throws without client', async () => {
        await expect(promoteToAdmin(makeCtx(null), 'g', 'u')).rejects.toThrow('Client not initialized');
    });
    test('promoteToAdmin with default and custom permissions', async () => {
        const ctx = makeCtx({ getInputEntity: jest.fn().mockResolvedValue('e'), invoke: jest.fn().mockResolvedValue(undefined) });
        await promoteToAdmin(ctx, 'g', 'u');
        await promoteToAdmin(ctx, 'g', 'u', { banUsers: true, postMessages: true }, 'Boss');
        const call = ctx.client.invoke.mock.calls[1][0] as Api.channels.EditAdmin;
        expect(call).toBeInstanceOf(Api.channels.EditAdmin);
        expect(call.rank).toBe('Boss');
    });
    test('demoteAdmin throws without client', async () => {
        await expect(demoteAdmin(makeCtx(null), 'g', 'u')).rejects.toThrow('Client not initialized');
    });
    test('demoteAdmin zeros rights', async () => {
        const ctx = makeCtx({ getInputEntity: jest.fn().mockResolvedValue('e'), invoke: jest.fn().mockResolvedValue(undefined) });
        await demoteAdmin(ctx, 'g', 'u');
        expect(ctx.client.invoke.mock.calls[0][0]).toBeInstanceOf(Api.channels.EditAdmin);
    });
    test('unblockGroupUser throws without client', async () => {
        await expect(unblockGroupUser(makeCtx(null), 'g', 'u')).rejects.toThrow('Client not initialized');
    });
    test('unblockGroupUser clears banned rights', async () => {
        const ctx = makeCtx({ getInputEntity: jest.fn().mockResolvedValue('e'), invoke: jest.fn().mockResolvedValue(undefined) });
        await unblockGroupUser(ctx, 'g', 'u');
        expect(ctx.client.invoke.mock.calls[0][0]).toBeInstanceOf(Api.channels.EditBanned);
    });
});

describe('getGroupAdmins', () => {
    test('throws without client', async () => {
        await expect(getGroupAdmins(makeCtx(null), 'g')).rejects.toThrow('Client not initialized');
    });
    test('maps admin participants', async () => {
        const rights = Object.assign(Object.create(Api.ChatAdminRights.prototype), { changeInfo: true, banUsers: true });
        const admin = Object.assign(Object.create(Api.ChannelParticipantAdmin.prototype), { userId: bigInt(7), rank: 'Mod', adminRights: rights });
        const ctx = makeCtx({ getInputEntity: jest.fn().mockResolvedValue('e'), invoke: jest.fn().mockResolvedValue({ users: [], participants: [admin] }) });
        const result = await getGroupAdmins(ctx, 'g');
        expect(result[0]).toMatchObject({ userId: '7', rank: 'Mod', permissions: { changeInfo: true, banUsers: true } });
    });
    test('returns empty when no users field', async () => {
        const ctx = makeCtx({ getInputEntity: jest.fn().mockResolvedValue('e'), invoke: jest.fn().mockResolvedValue({}) });
        expect(await getGroupAdmins(ctx, 'g')).toEqual([]);
    });
});

describe('getGroupBannedUsers', () => {
    test('throws without client', async () => {
        await expect(getGroupBannedUsers(makeCtx(null), 'g')).rejects.toThrow('Client not initialized');
    });
    test('maps banned participants', async () => {
        const rights = Object.assign(Object.create(Api.ChatBannedRights.prototype), { viewMessages: true, untilDate: 99 });
        const peer = Object.assign(Object.create(Api.PeerChat.prototype), { chatId: bigInt(3) });
        const banned = Object.assign(Object.create(Api.ChannelParticipantBanned.prototype), { peer, bannedRights: rights });
        const ctx = makeCtx({ getInputEntity: jest.fn().mockResolvedValue('e'), invoke: jest.fn().mockResolvedValue({ users: [], participants: [banned] }) });
        const result = await getGroupBannedUsers(ctx, 'g');
        expect(result[0]).toMatchObject({ userId: '3', bannedRights: { viewMessages: true, untilDate: 99 } });
    });
    test('returns empty when no users field', async () => {
        const ctx = makeCtx({ getInputEntity: jest.fn().mockResolvedValue('e'), invoke: jest.fn().mockResolvedValue({}) });
        expect(await getGroupBannedUsers(ctx, 'g')).toEqual([]);
    });
    test('maps a banned PeerUser (the real Telegram shape) without crashing', async () => {
        // Telegram returns ChannelParticipantBanned.peer as Api.PeerUser (userId), NOT PeerChat.
        // Reading (peer as PeerChat).chatId would be undefined -> .toString() throws.
        const rights = Object.assign(Object.create(Api.ChatBannedRights.prototype), { viewMessages: true, untilDate: 42 });
        const peer = Object.assign(Object.create(Api.PeerUser.prototype), { userId: bigInt(7) });
        const banned = Object.assign(Object.create(Api.ChannelParticipantBanned.prototype), { peer, bannedRights: rights });
        const ctx = makeCtx({ getInputEntity: jest.fn().mockResolvedValue('e'), invoke: jest.fn().mockResolvedValue({ users: [], participants: [banned] }) });
        const result = await getGroupBannedUsers(ctx, 'g');
        expect(result[0]).toMatchObject({ userId: '7', bannedRights: { viewMessages: true, untilDate: 42 } });
    });
});

describe('createGroupOrChannel', () => {
    test('throws without client', async () => {
        await expect(createGroupOrChannel(makeCtx(null), {} as any)).rejects.toThrow('Client not initialized');
    });
    test('invokes CreateChannel', async () => {
        const ctx = makeCtx({ invoke: jest.fn().mockResolvedValue({ ok: true }) });
        await createGroupOrChannel(ctx, { title: 'T' } as any);
        expect(ctx.client.invoke.mock.calls[0][0]).toBeInstanceOf(Api.channels.CreateChannel);
    });
    test('wraps errors', async () => {
        const ctx = makeCtx({ invoke: jest.fn().mockRejectedValue(new Error('nope')) });
        await expect(createGroupOrChannel(ctx, { title: 'T' } as any)).rejects.toThrow('Failed to create group or channel: nope');
    });
});

describe('createGroupWithOptions', () => {
    test('throws without client', async () => {
        await expect(createGroupWithOptions(makeCtx(null), {} as any)).rejects.toThrow('Client not initialized');
    });

    test('throws when no channelId found in updates', async () => {
        const ctx = makeCtx({ invoke: jest.fn().mockResolvedValue({ updates: [] }) });
        await expect(createGroupWithOptions(ctx, { title: 'T' } as any)).rejects.toThrow('Failed to create channel');
    });

    test('throws when created entity is not a channel', async () => {
        const update = Object.assign(Object.create(Api.UpdateChannel.prototype), { channelId: bigInt(5) });
        const ctx = makeCtx({
            invoke: jest.fn().mockResolvedValue({ updates: [update] }),
            getEntity: jest.fn().mockResolvedValue(Object.create(Api.Chat.prototype)),
        });
        await expect(createGroupWithOptions(ctx, { title: 'T' } as any)).rejects.toThrow('Created entity is not a channel');
    });

    test('creates channel, adds members and uploads photo', async () => {
        const update = Object.assign(Object.create(Api.UpdateChannel.prototype), { channelId: bigInt(5) });
        const channelEntity = Object.create(Api.Channel.prototype);
        const ctx = makeCtx({
            invoke: jest.fn().mockResolvedValue(undefined),
            getEntity: jest.fn().mockResolvedValue(channelEntity),
            getInputEntity: jest.fn().mockResolvedValue('inputEntity'),
            uploadFile: jest.fn().mockResolvedValue('uploadedFile'),
        });
        // first invoke (createGroupOrChannel) returns updates
        ctx.client.invoke.mockResolvedValueOnce({ updates: [update] });
        const result = await createGroupWithOptions(ctx, { title: 'T', members: ['m1'], photo: 'http://img' } as any);
        expect(result).toBe(channelEntity);
        expect(ctx.client.uploadFile).toHaveBeenCalled();
        const editPhoto = ctx.client.invoke.mock.calls.find((c: any[]) => c[0] instanceof Api.channels.EditPhoto);
        expect(editPhoto).toBeDefined();
    });

    test('handles single (non-array) update', async () => {
        const update = Object.assign(Object.create(Api.UpdateChannel.prototype), { channelId: bigInt(8) });
        const channelEntity = Object.create(Api.Channel.prototype);
        const ctx = makeCtx({
            invoke: jest.fn().mockResolvedValue(undefined),
            getEntity: jest.fn().mockResolvedValue(channelEntity),
        });
        ctx.client.invoke.mockResolvedValueOnce({ updates: update });
        const result = await createGroupWithOptions(ctx, { title: 'T' } as any);
        expect(result).toBe(channelEntity);
    });
});

describe('updateGroupSettings', () => {
    test('throws without client', async () => {
        await expect(updateGroupSettings(makeCtx(null), { groupId: 'g' } as any)).rejects.toThrow('Client not initialized');
    });
    test('applies all settings', async () => {
        const ctx = makeCtx({ getEntity: jest.fn().mockResolvedValue('chan'), invoke: jest.fn().mockResolvedValue(undefined) });
        const result = await updateGroupSettings(ctx, { groupId: 'g', title: 'T', description: 'D', username: 'U', slowMode: 30 } as any);
        expect(result).toBe(true);
        const args = ctx.client.invoke.mock.calls.map((c: any[]) => c[0]);
        expect(args.some((a: any) => a instanceof Api.channels.EditTitle)).toBe(true);
        expect(args.some((a: any) => a instanceof Api.messages.EditChatAbout)).toBe(true);
        expect(args.some((a: any) => a instanceof Api.channels.UpdateUsername)).toBe(true);
        expect(args.some((a: any) => a instanceof Api.channels.ToggleSlowMode)).toBe(true);
    });
    test('no-op when no settings provided', async () => {
        const ctx = makeCtx({ getEntity: jest.fn().mockResolvedValue('chan'), invoke: jest.fn() });
        const result = await updateGroupSettings(ctx, { groupId: 'g' } as any);
        expect(result).toBe(true);
        expect(ctx.client.invoke).not.toHaveBeenCalled();
    });
});
