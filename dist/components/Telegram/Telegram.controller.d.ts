import { TelegramService } from './Telegram.service';
import { AddContactsDto } from './dto/addContacts.dto';
import { AddContactDto } from './dto/addContact.dto';
export declare class TelegramController {
    private readonly telegramService;
    constructor(telegramService: TelegramService);
    connectToTelegram(mobile: string): Promise<import("src").TelegramManager>;
    connectClient(mobile: string): Promise<string>;
    disconnect(mobile: string): Promise<boolean>;
    disconnectAll(): Promise<string>;
    getMessages(mobile: string, username: string, limit?: number): Promise<import("telegram/Helpers").TotalList<import("telegram").Api.Message>>;
    getMessagesNew(mobile: string, chatId: string, offset: number, limit?: number): Promise<any>;
    getChatId(mobile: string, username: string): Promise<any>;
    sendInlineMessage(mobile: string, chatId: string, message: string, url: string): Promise<import("telegram").Api.Message>;
    lastActiveTime(mobile: string): Promise<string>;
    joinChannels(mobile: string, channels: string): Promise<string>;
    removeOtherAuths(mobile: string): Promise<string>;
    getSelfMsgsInfo(mobile: string): Promise<{
        photoCount: number;
        videoCount: number;
        movieCount: number;
        total: number;
        ownPhotoCount: number;
        otherPhotoCount: number;
        ownVideoCount: number;
        otherVideoCount: number;
    }>;
    createGroup(mobile: string): Promise<{
        id: any;
        accessHash: any;
    }>;
    forwardSecrets(mobile: string, fromId: string): Promise<void>;
    joinChannelAndForward(mobile: string, fromId: string, channel: string): Promise<void>;
    leaveChannel(mobile: string, channel: string): Promise<string>;
    getCallLog(mobile: string): Promise<{
        chatCallCounts: any[];
        outgoing: number;
        incoming: number;
        video: number;
        totalCalls: number;
    }>;
    getMe(mobile: string): Promise<import("telegram").Api.User>;
    getMedia(mobile: string): Promise<import("telegram").Api.messages.Messages>;
    getChannelInfo(mobile: string, sendIds?: boolean): Promise<{
        chatsArrayLength: number;
        canSendTrueCount: number;
        canSendFalseCount: number;
        ids: string[];
        canSendFalseChats: string[];
    }>;
    leaveChannels(mobile: string): Promise<string>;
    getAuths(mobile: string): Promise<any>;
    set2Fa(mobile: string): Promise<string>;
    setProfilePic(mobile: string, name: string): Promise<string>;
    updatePrivacy(mobile: string): Promise<string>;
    updateUsername(mobile: string, username: string): Promise<string>;
    getGrpMembers(mobile: string, username: string): Promise<any[]>;
    addContact(addContactDto: AddContactDto): Promise<void>;
    addContacts(addContactsDto: AddContactsDto): Promise<void>;
    newSession(mobile: string): Promise<string>;
    updateName(mobile: string, firstName: string, about: string): Promise<string>;
    getMediaMetadata(mobile: string, chatId: string, offset: number, limit: number): Promise<any>;
    downloadMediaFile(mobile: string, messageId: number, chatId: string, res: any): Promise<void>;
    downloadProfilePic(mobile: string, index: number, res: any): Promise<any>;
    forrward(mobile: string, chatId: string, messageId: number): Promise<void>;
    deleteChat(mobile: string, chatId: string): Promise<void>;
    deleteProfilePics(mobile: string): Promise<void>;
}
