import { BaseBatchItemDto } from './batch-operations.dto';
export declare class ScheduleMessageDto extends BaseBatchItemDto {
    message: string;
    scheduledTime: string;
    replyTo?: number;
    silent?: boolean;
}
export declare class GetScheduledMessagesDto extends BaseBatchItemDto {
    limit?: number;
}
export declare class DeleteScheduledMessageDto extends BaseBatchItemDto {
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
