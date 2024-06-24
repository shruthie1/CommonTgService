import { TelegramClient } from 'telegram';
import { Api } from 'telegram/tl';
import { TotalList } from 'telegram/Helpers';
import { Dialog } from 'telegram/tl/custom/dialog';
declare class TelegramManager {
    private session;
    private phoneNumber;
    private client;
    private channelArray;
    private activeChannelsService;
    private static activeClientSetup;
    constructor(sessionString: string, phoneNumber: string);
    static getActiveClientSetup(): {
        mobile: string;
        clientId: string;
    };
    static setActiveClientSetup(data: {
        mobile: string;
        clientId: string;
    }): void;
    disconnect(): Promise<void>;
    getchatId(username: string): Promise<any>;
    getMe(): Promise<Api.User>;
    createClient(handler?: boolean): Promise<TelegramClient>;
    getMessages(entityLike: Api.TypeEntityLike, limit?: number): Promise<TotalList<Api.Message>>;
    getDialogs(): Promise<TotalList<Dialog>>;
    getLastMsgs(limit: number): Promise<string>;
    getSelfMSgsInfo(): Promise<{
        photoCount: number;
        videoCount: number;
        movieCount: number;
    }>;
    channelInfo(sendIds?: boolean): Promise<{
        chatsArrayLength: number;
        canSendTrueCount: number;
        canSendFalseCount: number;
        ids: string[];
    }>;
    getEntity(entity: Api.TypeEntityLike): Promise<import("telegram/define").Entity>;
    joinChannel(entity: Api.TypeEntityLike): Promise<Api.TypeUpdates>;
    connected(): boolean;
    removeOtherAuths(): Promise<void>;
    getAuths(): Promise<any>;
    getAllChats(): Promise<any[]>;
    handleEvents(event: any): Promise<void>;
    updatePrivacyforDeletedAccount(): Promise<void>;
    updateProfile(firstName: any, about: any): Promise<void>;
    updateUsername(baseUsername: any): Promise<string>;
    updatePrivacy(): Promise<void>;
    getFileUrl(url: string, filename: string): Promise<string>;
    updateProfilePic(image: any): Promise<void>;
    hasPassword(): Promise<boolean>;
    set2fa(): Promise<void>;
    sendPhotoChat(id: string, url: string, caption: string, filename: string): Promise<void>;
    sendFileChat(id: string, url: string, caption: string, filename: string): Promise<void>;
    deleteProfilePhotos(): Promise<void>;
}
export default TelegramManager;
