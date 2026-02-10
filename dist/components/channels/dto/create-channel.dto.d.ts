export declare class CreateChannelDto {
    channelId: string;
    broadcast?: boolean;
    canSendMsgs: boolean;
    participantsCount: number;
    restricted?: boolean;
    sendMessages?: boolean;
    title: string;
    username?: string;
    private: boolean;
    forbidden: boolean;
    megagroup?: boolean;
    reactRestricted?: boolean;
    wordRestriction?: number;
    dMRestriction?: number;
    availableMsgs?: string[];
    banned?: boolean;
    starred?: boolean;
    score?: number;
}
