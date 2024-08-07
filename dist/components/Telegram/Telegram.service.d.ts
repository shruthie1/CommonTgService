import { BufferClientService } from './../buffer-clients/buffer-client.service';
import { UsersService } from '../users/users.service';
import TelegramManager from "./TelegramManager";
import { OnModuleDestroy } from '@nestjs/common';
import { Api } from 'telegram';
import { ActiveChannelsService } from '../active-channels/active-channels.service';
import { ChannelsService } from '../channels/channels.service';
import { Channel } from '../channels/schemas/channel.schema';
export declare class TelegramService implements OnModuleDestroy {
    private usersService;
    private bufferClientService;
    private activeChannelsService;
    private channelsService;
    private static clientsMap;
    constructor(usersService: UsersService, bufferClientService: BufferClientService, activeChannelsService: ActiveChannelsService, channelsService: ChannelsService);
    onModuleDestroy(): Promise<void>;
    getActiveClientSetup(): {
        days?: number;
        archiveOld: boolean;
        formalities: boolean;
        newMobile: string;
        existingMobile: string;
        clientId: string;
    };
    setActiveClientSetup(data: {
        days?: number;
        archiveOld: boolean;
        formalities: boolean;
        newMobile: string;
        existingMobile: string;
        clientId: string;
    } | undefined): void;
    getClient(number: string): Promise<TelegramManager>;
    hasClient(number: string): boolean;
    deleteClient(number: string): Promise<boolean>;
    disconnectAll(): Promise<void>;
    createClient(mobile: string, autoDisconnect?: boolean, handler?: boolean): Promise<TelegramManager>;
    getMessages(mobile: string, username: string, limit?: number): Promise<import("telegram/Helpers").TotalList<Api.Message>>;
    getChatId(mobile: string, username: string): Promise<any>;
    getLastActiveTime(mobile: string): Promise<string>;
    tryJoiningChannel(mobile: string, chatEntity: Channel): Promise<void>;
    removeChannels(error: any, channelId: string, username: string): Promise<void>;
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
    getMe(mobile: string): Promise<Api.User>;
    createNewSession(mobile: string): Promise<string>;
    set2Fa(mobile: string): Promise<string>;
    updatePrivacyforDeletedAccount(mobile: string): Promise<void>;
    deleteProfilePhotos(mobile: string): Promise<void>;
    setProfilePic(mobile: string, name: string): Promise<string>;
    updatePrivacy(mobile: string): Promise<string>;
    updateUsername(mobile: string, username: string): Promise<string>;
    getMediaMetadata(mobile: string): Promise<any[]>;
    downloadMediaFile(mobile: string, messageId: number): Promise<string | Buffer>;
    updateNameandBio(mobile: string, firstName: string, about?: string): Promise<string>;
}
