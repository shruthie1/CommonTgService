export declare class ScheduleMessageDto {
    chatId: string;
    message: string;
    scheduledTime: string;
    replyTo?: number;
    silent?: boolean;
}
export declare class GetScheduledMessagesDto {
    chatId: string;
    limit?: number;
}
export declare class DeleteScheduledMessageDto {
    chatId: string;
    messageId: number;
}
export declare class RescheduleMessageDto {
    chatId: string;
    messageId: number;
    newScheduleDate: string;
}
export declare class BatchProcessItemDto {
    chatId: string;
    messageId?: number;
}
