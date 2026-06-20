jest.mock('../client-operations');
jest.mock('../message-operations');
jest.mock('../media-operations');
jest.mock('../channel-operations');
jest.mock('../contact-operations');
jest.mock('../profile-operations');
jest.mock('../auth-operations');
jest.mock('../chat-operations');

import TelegramManager from '../TelegramManager';
import * as clientOps from '../client-operations';
import * as chatOps from '../chat-operations';
import * as channelOps from '../channel-operations';
import * as authOps from '../auth-operations';

describe('TelegramManager static activeClientSetup registry', () => {
    afterEach(() => {
        // clean up any leftover entries
        const existing = TelegramManager.getActiveClientSetup();
        if (existing) TelegramManager.clearActiveClientSetup(existing.newMobile);
    });

    test('set/has/get/clear', () => {
        expect(TelegramManager.hasActiveClientSetup()).toBe(false);
        const data = { newMobile: '111', oldMobile: '222' } as any;
        TelegramManager.setActiveClientSetup(data);
        expect(TelegramManager.hasActiveClientSetup()).toBe(true);
        expect(TelegramManager.getActiveClientSetup('111')).toBe(data);
        expect(TelegramManager.getActiveClientSetup()).toBe(data); // first value
        TelegramManager.clearActiveClientSetup('111');
        expect(TelegramManager.hasActiveClientSetup()).toBe(false);
    });
});

describe('TelegramManager lifecycle', () => {
    afterEach(() => jest.clearAllMocks());

    test('createClient stores client/apiId/apiHash and wires ctx', async () => {
        const fakeClient = { connected: true } as any;
        (clientOps.createClient as jest.Mock).mockResolvedValue({ client: fakeClient, apiId: 7, apiHash: 'hh' });
        const mgr = new TelegramManager('', '900');
        const client = await mgr.createClient();
        expect(client).toBe(fakeClient);
        expect(mgr.apiId).toBe(7);
        expect(mgr.apiHash).toBe('hh');
        expect(mgr.client).toBe(fakeClient);
        // ctx passed to ops should carry phoneNumber + logger
        const ctxArg = (clientOps.createClient as jest.Mock).mock.calls[0][0];
        expect(ctxArg.phoneNumber).toBe('900');
        expect(ctxArg.logger).toBeDefined();
    });

    test('connected returns false before create, true when client connected', async () => {
        const mgr = new TelegramManager('', '900');
        expect(mgr.connected()).toBe(false);
        (clientOps.createClient as jest.Mock).mockResolvedValue({ client: { connected: true }, apiId: 1, apiHash: 'h' });
        await mgr.createClient();
        expect(mgr.connected()).toBe(true);
    });

    test('connect throws when no client', async () => {
        const mgr = new TelegramManager('', '900');
        await expect(mgr.connect()).rejects.toThrow(/Cannot connect/);
    });

    test('connect delegates to client.connect', async () => {
        const connect = jest.fn().mockResolvedValue(undefined);
        (clientOps.createClient as jest.Mock).mockResolvedValue({ client: { connected: true, connect }, apiId: 1, apiHash: 'h' });
        const mgr = new TelegramManager('', '900');
        await mgr.createClient();
        await mgr.connect();
        expect(connect).toHaveBeenCalled();
    });

    test('destroy clears client and calls destroyClient', async () => {
        (clientOps.createClient as jest.Mock).mockResolvedValue({ client: { connected: true }, apiId: 1, apiHash: 'h' });
        (clientOps.destroyClient as jest.Mock).mockResolvedValue(undefined);
        const mgr = new TelegramManager('', '900');
        await mgr.createClient();
        await mgr.destroy();
        expect(clientOps.destroyClient).toHaveBeenCalled();
        expect(mgr.client).toBeNull();
    });

    test('errorHandler stores timeout result and clears it on next call', async () => {
        const timeoutHandle = setTimeout(() => {}, 100000) as any;
        (clientOps.handleClientError as jest.Mock).mockReturnValueOnce(timeoutHandle).mockReturnValueOnce(null);
        const mgr = new TelegramManager('', '900');
        await mgr.errorHandler(new Error('TIMEOUT'));
        // second call: clearTimeoutErr clears previous, then stores null
        await mgr.errorHandler(new Error('again'));
        expect(clientOps.handleClientError).toHaveBeenCalledTimes(2);
        clearTimeout(timeoutHandle);
    });
});

describe('TelegramManager delegations', () => {
    afterEach(() => jest.clearAllMocks());

    test('getMe delegates to chatOps', async () => {
        (chatOps.getMe as jest.Mock).mockResolvedValue({ id: 1 });
        const mgr = new TelegramManager('', '900');
        await mgr.getMe();
        expect(chatOps.getMe).toHaveBeenCalled();
    });

    test('joinChannel delegates to channelOps', async () => {
        (channelOps.joinChannel as jest.Mock).mockResolvedValue({});
        const mgr = new TelegramManager('', '900');
        await mgr.joinChannel('c');
        expect(channelOps.joinChannel).toHaveBeenCalledWith(expect.anything(), 'c');
    });

    test('removeOtherAuths delegates to authOps', async () => {
        (authOps.removeOtherAuths as jest.Mock).mockResolvedValue(undefined);
        const mgr = new TelegramManager('', '900');
        await mgr.removeOtherAuths();
        expect(authOps.removeOtherAuths).toHaveBeenCalled();
    });

    test('getDialogs calls client.getDialogs directly', async () => {
        const getDialogs = jest.fn().mockResolvedValue(['d']);
        (clientOps.createClient as jest.Mock).mockResolvedValue({ client: { connected: true, getDialogs }, apiId: 1, apiHash: 'h' });
        const mgr = new TelegramManager('', '900');
        await mgr.createClient();
        const result = await mgr.getDialogs({} as any);
        expect(result).toEqual(['d']);
        expect(getDialogs).toHaveBeenCalled();
    });

    test('handleEvents delegates to clientOps.handleIncomingEvent', async () => {
        (clientOps.handleIncomingEvent as jest.Mock).mockResolvedValue(undefined);
        const mgr = new TelegramManager('', '900');
        await mgr.handleEvents({} as any);
        expect(clientOps.handleIncomingEvent).toHaveBeenCalled();
    });

    test('contact/profile/media delegations forward args', async () => {
        const mgr = new TelegramManager('', '900');
        const contactOps = require('../contact-operations');
        const profileOps = require('../profile-operations');
        const mediaOps = require('../media-operations');
        const messageOps = require('../message-operations');
        contactOps.blockUser.mockResolvedValue(undefined);
        profileOps.updateProfile.mockResolvedValue(undefined);
        mediaOps.getThumbnail.mockResolvedValue({});
        messageOps.sendMessageToChat.mockResolvedValue({});

        await mgr.blockUser('55');
        await mgr.updateProfile('A', 'about');
        await mgr.getThumbnail(1, 'me', 'low');
        await mgr.sendMessage({ chatId: 'c', message: 'm' } as any);

        expect(contactOps.blockUser).toHaveBeenCalledWith(expect.anything(), '55');
        expect(profileOps.updateProfile).toHaveBeenCalledWith(expect.anything(), 'A', 'about');
        expect(mediaOps.getThumbnail).toHaveBeenCalledWith(expect.anything(), 1, 'me', 'low');
        expect(messageOps.sendMessageToChat).toHaveBeenCalled();
    });

    test('every delegating method forwards to its operation module', async () => {
        const chatOpsM = require('../chat-operations');
        const messageOps = require('../message-operations');
        const mediaOps = require('../media-operations');
        const channelOpsM = require('../channel-operations');
        const contactOps = require('../contact-operations');
        const profileOps = require('../profile-operations');
        const authOpsM = require('../auth-operations');

        // Make every exported op return a resolved value (or async generator for streamMediaFile)
        for (const mod of [chatOpsM, messageOps, mediaOps, channelOpsM, contactOps, profileOps, authOpsM]) {
            for (const key of Object.keys(mod)) {
                if (typeof mod[key] === 'function' && jest.isMockFunction(mod[key])) {
                    mod[key].mockResolvedValue({});
                }
            }
        }
        // streamMediaFile is an async generator delegate
        (mediaOps.streamMediaFile as jest.Mock).mockImplementation(async function* () { yield Buffer.from('x'); });

        const client = {
            connected: true,
            getDialogs: jest.fn().mockResolvedValue(['d']),
        };
        (clientOps.createClient as jest.Mock).mockResolvedValue({ client, apiId: 1, apiHash: 'h' });
        const mgr = new TelegramManager('', '900');
        await mgr.createClient();

        // chat ops
        await mgr.getchatId('u');
        await mgr.getEntity('e');
        await mgr.getMessages('e');
        await mgr.getAllChats();
        await mgr.getMessagesNew('c');
        await mgr.safeGetEntity('id');
        await mgr.getSelfMSgsInfo();
        await mgr.getCallLog();
        await mgr.getChatStatistics('c', 'day');
        await mgr.getMessageStats({ chatId: 'c', period: 'day' });
        await mgr.getChatMediaCounts('c');
        await mgr.getChatCallHistory('c');
        await mgr.getCallLogStats();
        await mgr.getChats({});
        await mgr.updateChatSettings({ chatId: 'c' } as any);
        await mgr.getTopPrivateChats();
        await mgr.createChatFolder({} as any);
        await mgr.getChatFolders();
        await mgr.createBot({} as any);

        // message ops
        await mgr.sendInlineMessage('c', 'm', 'url');
        await mgr.forwardSecretMsgs('a', 'b');
        await mgr.forwardMessages('a', 'b', [1]);
        await mgr.forwardMessage('a', 'b', 1);
        await mgr.searchMessages({} as any);
        await mgr.scheduleMessageSend({} as any);
        await mgr.getScheduledMessages('c');
        await mgr.sendMediaAlbum({} as any);
        await mgr.sendVoiceMessage({} as any);
        await mgr.cleanupChat({ chatId: 'c' });
        await mgr.editMessage({} as any);
        await mgr.sendMediaBatch({} as any);
        await mgr.sendViewOnceMedia('c', Buffer.from('x'));
        await mgr.sendPhotoChat('c', 'u', 'cap', 'f');
        await mgr.sendFileChat('c', 'u', 'cap', 'f');
        await mgr.deleteChat({} as any);

        // media ops
        await mgr.getMediaUrl({} as any);
        await mgr.getMediaMessages();
        await mgr.getMediaFileDownloadInfo(1);
        await mgr.getMediaMetadata({} as any);
        await mgr.getAllMediaMetaData({} as any);
        await mgr.getFilteredMedia({} as any);
        await mgr.getFileUrl('u', 'f');
        // exercise the streamMediaFile generator delegate
        for await (const _ of mgr.streamMediaFile({} as any)) { /* drain */ }

        // channel ops
        await mgr.createGroup();
        await mgr.archiveChat({} as any, {} as any);
        await mgr.forwardMedia('c', 'f');
        await mgr.leaveChannels(['1']);
        await mgr.getGrpMembers('e');
        await mgr.addGroupMembers('g', ['u']);
        await mgr.removeGroupMembers('g', ['u']);
        await mgr.promoteToAdmin('g', 'u');
        await mgr.demoteAdmin('g', 'u');
        await mgr.unblockGroupUser('g', 'u');
        await mgr.getGroupAdmins('g');
        await mgr.getGroupBannedUsers('g');
        await mgr.createGroupOrChannel({} as any);
        await mgr.createGroupWithOptions({} as any);
        await mgr.updateGroupSettings({} as any);

        // contact ops
        await mgr.addContact([], 'p');
        await mgr.addContacts([], 'p');
        await mgr.getContacts();
        await mgr.exportContacts('csv');
        await mgr.importContacts([]);
        await mgr.manageBlockList([], true);
        await mgr.getContactStatistics();
        await mgr.sendContactsFile('c', { users: [] } as any);

        // profile ops
        await mgr.updatePrivacy();
        await mgr.updatePrivacyforDeletedAccount();
        await mgr.updatePrivacyBatch({} as any);
        await mgr.updateUsername('u');
        await mgr.updateProfilePic('img');
        await mgr.downloadProfilePic(0);
        await mgr.deleteProfilePhotos();

        // auth ops
        await mgr.getAuths();
        await mgr.getLastActiveTime();
        await mgr.hasPassword();
        await mgr.set2fa();
        await mgr.createNewSession();
        await mgr.waitForOtp();
        await mgr.getSessionInfo();
        await mgr.terminateSession({ hash: 'h', type: 'app' });

        expect(chatOpsM.getEntity).toHaveBeenCalled();
        expect(messageOps.editMessage).toHaveBeenCalled();
        expect(authOpsM.getSessionInfo).toHaveBeenCalled();
    });
});
