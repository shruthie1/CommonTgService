export declare class CreateChannelDto {
    channelId: string;
    broadcast?: boolean;
    canSendMsgs: boolean;
    megagroup?: boolean;
    participantsCount: number;
    restricted?: boolean;
    sendMessages?: boolean;
    title: string;
    username?: string;
}
