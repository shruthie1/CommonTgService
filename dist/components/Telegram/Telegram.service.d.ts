import { BufferClientService } from './../buffer-clients/buffer-client.service';
import { UsersService } from '../users/users.service';
import TelegramManager from "./TelegramManager";
export declare class TelegramService {
    private usersService;
    private bufferClientService;
    private static clientsMap;
    constructor(usersService: UsersService, bufferClientService: BufferClientService);
    getActiveClientSetup(): {
        mobile: string;
        clientId: string;
    };
    setActiveClientSetup(data: {
        mobile: string;
        clientId: string;
    }): void;
    getClient(number: string): TelegramManager;
    hasClient(number: string): boolean;
    deleteClient(number: string): Promise<boolean>;
    disconnectAll(): Promise<void>;
    createClient(mobile: string, autoDisconnect?: boolean, handler?: boolean): Promise<TelegramManager>;
    getMessages(mobile: string, username: string, limit?: number): Promise<import("telegram/Helpers").TotalList<import("telegram").Api.Message>>;
    getChatId(mobile: string, username: string): Promise<any>;
    joinChannels(mobile: string, channels: string): Promise<string>;
    removeOtherAuths(mobile: string): Promise<string>;
    getSelfMsgsInfo(mobile: string): Promise<{
        photoCount: number;
        videoCount: number;
        movieCount: number;
    }>;
    getChannelInfo(mobile: string, sendIds?: boolean): Promise<{
        chatsArrayLength: number;
        canSendTrueCount: number;
        canSendFalseCount: number;
        ids: string[];
    }>;
    getAuths(mobile: string): Promise<any>;
    getMe(mobile: string): Promise<import("telegram").Api.User>;
    set2Fa(mobile: string): Promise<string>;
    updatePrivacyforDeletedAccount(mobile: string): Promise<void>;
    deleteProfilePhotos(mobile: string): Promise<void>;
    setProfilePic(mobile: string, name: string): Promise<string>;
    updatePrivacy(mobile: string): Promise<string>;
    updateUsername(mobile: string, username: string): Promise<string>;
    updateNameandBio(mobile: string, firstName: string, about: string): Promise<string>;
}
