export declare enum TransactionStatus {
    PENDING = "pending",
    COMPLETED = "completed",
    FAILED = "failed",
    CANCELLED = "cancelled"
}
export declare class CreateTransactionDto {
    transactionId: string;
    amount: number;
    issue: string;
    description: string;
    refundMethod?: string;
    profile: string;
    chatId: string;
    ip: string;
    status: TransactionStatus;
}
