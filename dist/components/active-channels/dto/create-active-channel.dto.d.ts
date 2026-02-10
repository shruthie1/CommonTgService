export declare class CreateActiveChannelDto {
    channelId: string;
    broadcast: boolean;
    canSendMsgs: boolean;
    participantsCount: number;
    restricted: boolean;
    sendMessages: boolean;
    reactRestricted?: boolean;
    title: string;
    username: string;
    wordRestriction?: number;
    dMRestriction?: number;
    availableMsgs?: string[];
    banned?: boolean;
    megagroup?: boolean;
    forbidden?: boolean;
    private: boolean;
    starred?: boolean;
    score?: number;
}
