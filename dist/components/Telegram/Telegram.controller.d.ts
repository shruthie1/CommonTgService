import { TelegramService } from './Telegram.service';
export declare class TelegramController {
    private readonly telegramService;
    constructor(telegramService: TelegramService);
    connectToTelegram(mobile: string): Promise<import("./TelegramManager").default>;
    connectClient(mobile: string): Promise<string>;
    disconnect(mobile: string): Promise<boolean>;
    disconnectAll(): Promise<string>;
    getMessages(mobile: string, username: string, limit?: number): Promise<import("telegram/Helpers").TotalList<import("telegram").Api.Message>>;
    getChatId(mobile: string, username: string): Promise<any>;
    lastActiveTime(mobile: string): Promise<string>;
    joinChannels(mobile: string, channels: string): Promise<string>;
    removeOtherAuths(mobile: string): Promise<string>;
    getSelfMsgsInfo(mobile: string): Promise<{
        photoCount: number;
        videoCount: number;
        movieCount: number;
        total: number;
    }>;
    getChannelInfo(mobile: string, sendIds?: boolean): Promise<{
        chatsArrayLength: number;
        canSendTrueCount: number;
        canSendFalseCount: number;
        ids: string[];
    }>;
    getAuths(mobile: string): Promise<any>;
    set2Fa(mobile: string): Promise<string>;
    setProfilePic(mobile: string, name: string): Promise<string>;
    updatePrivacy(mobile: string): Promise<string>;
    updateUsername(mobile: string, username: string): Promise<string>;
    newSession(mobile: string): Promise<void>;
    updateName(mobile: string, firstName: string, about: string): Promise<string>;
    getMediaMetadata(mobile: string): Promise<any[]>;
    downloadMediaFile(mobile: string, messageId: number): Promise<{
        file: string;
    }>;
}
