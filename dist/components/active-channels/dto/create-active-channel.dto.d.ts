export declare class CreateActiveChannelDto {
    channelId: string;
    broadcast: boolean;
    canSendMsgs: boolean;
    participantsCount: number;
    restricted: boolean;
    sendMessages: boolean;
    sendPlain?: boolean;
    reactRestricted?: boolean;
    title: string;
    username: string;
    wordRestriction?: number;
    dMRestriction?: number;
    recentUniqueUsers?: number;
    lastUniqueUserCheckAt?: number;
    availableMsgs?: string[];
    banned?: boolean;
    bannedAt?: number | null;
    megagroup?: boolean;
    forbidden?: boolean;
    private: boolean;
    starred?: boolean;
    score?: number;
}
