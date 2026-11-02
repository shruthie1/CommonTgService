import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateUserDataDto {
    @ApiProperty({ description: 'Chat ID' })
    chatId: string;

    @ApiProperty({ description: 'Total count' })
    totalCount: number;

    @ApiProperty({ description: 'Picture count' })
    picCount: number;

    @ApiProperty({ description: 'Last message timestamp' })
    lastMsgTimeStamp: number;

    @ApiProperty({ description: 'Limit time' })
    limitTime: number;

    @ApiProperty({ description: 'Paid count' })
    paidCount: number;

    @ApiProperty({ description: 'Profile count' })
    prfCount: number;

    @ApiProperty({ description: 'Can reply' })
    canReply: number;

    @ApiProperty({ description: 'Pay amount' })
    payAmount: number;

    @ApiProperty({ description: 'highestPayAmount' })
    highestPayAmount: number;

    @ApiProperty({ description: 'cheatCount: complaint score: how strongly the user feels cheated; never a fake-payment or revenue signal', default: 0 })
    cheatCount: number;

    @ApiProperty({ description: 'callTime', default: 0 })
    callTime: number;

    @ApiProperty({ description: 'Username' })
    username: string;

    @ApiProperty({ description: 'Access hash' })
    accessHash: string;

    @ApiProperty({ description: 'Paid reply status' })
    paidReply: boolean;

    @ApiProperty({ description: 'Demo given status' })
    demoGiven: boolean;

    @ApiProperty({ description: 'Second show status' })
    secondShow: boolean;

    @ApiProperty({ description: 'Full-show progression count', default: 0 })
    fullShow: number;

    @ApiProperty({ description: 'Profile name' })
    profile: string;

    @ApiProperty({ description: 'Number of demo pictures sent', default: 0 })
    picsSent: number;

    @ApiProperty({ description: 'videos' })
    videos: string[];

    @ApiProperty({ description: 'Canonical common-channel IDs used for promotion attribution', default: [] })
    attributionChannelIds: string[];

    @ApiProperty({ description: 'Unix timestamp of the latest attribution lookup', default: 0 })
    attributionUpdatedAt: number;

    // Operator fake-payment mark (owner 2026-11-02). Optional; set them ONLY through POST /fake-payment/:chatId/mark |
    // unmark, which also keeps Postgres payment_event.is_fake and the payers counters in step.
    @ApiPropertyOptional({ description: 'When an operator marked this chat a fake payer (set by /fake-payment only). Absent = not marked.', type: String, format: 'date-time' })
    fakePaymentAt?: Date | null;

    @ApiPropertyOptional({ description: 'Operator who marked the fake payment (set by /fake-payment only)' })
    fakePaymentBy?: string;

    @ApiPropertyOptional({ description: 'Operator reason for the fake-payment mark (set by /fake-payment only)' })
    fakePaymentReason?: string;

    @ApiPropertyOptional({ description: 'payAmount / canReply before the mark; restored and unset by the unmark (set by /fake-payment only)' })
    fakePaymentPrev?: { payAmount?: number; canReply?: number };
}
