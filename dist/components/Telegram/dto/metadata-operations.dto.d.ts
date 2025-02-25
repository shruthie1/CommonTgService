export declare class DialogsQueryDto {
    limit: number;
    offsetId?: number;
    archived?: boolean;
}
export declare class MessageQueryDto {
    entityId: string;
    limit?: number;
    offsetId?: number;
}
export declare class BulkMessageOperationDto {
    fromChatId: string;
    toChatId: string;
    messageIds: number[];
}
