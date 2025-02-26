export declare enum BatchOperationType {
    FORWARD = "forward",
    DELETE = "delete",
    EDIT = "edit"
}
export declare class BaseBatchItemDto {
    chatId: string;
}
export declare class BatchItemDto extends BaseBatchItemDto {
    messageId?: number;
    fromChatId?: string;
    toChatId?: string;
}
export declare class BatchProcessDto {
    operation: BatchOperationType;
    items: BatchItemDto[];
    batchSize?: number;
    delayMs?: number;
}
export declare class ForwardBatchDto {
    fromChatId: string;
    toChatId: string;
    messageIds: number[];
}
