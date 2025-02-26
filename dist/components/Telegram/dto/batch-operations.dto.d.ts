export declare enum BatchOperationType {
    FORWARD = "forward",
    DELETE = "delete"
}
export declare class BatchItemDto {
    chatId: string;
    messageId?: number;
    fromChatId?: string;
    toChatId?: string;
}
export declare class BatchProcessDto {
    items: BatchItemDto[];
    operation: BatchOperationType;
    batchSize?: number;
    delayMs?: number;
}
export declare class ForwardBatchDto extends BatchProcessDto {
    fromChatId: string;
    toChatId: string;
    messageIds: number[];
}
