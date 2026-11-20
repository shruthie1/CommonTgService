import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateUserDataDto {
    @ApiProperty({ description: 'Chat ID' })
    chatId: string;

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

    // Schema fields tg-aut writes (userData audit A10, 2026-11-20). Optional; absent on legacy rows. The workflow-owned
    // keys (user-data.owned-keys.ts: showsPaidTo, demoCompletions, showCompletions, fakePaymentHistory,
    // fakePaymentProofIds) are left out on purpose: the generic routes strip them.
    @ApiPropertyOptional({ description: 'Client id (e.g. shruthi2) that owns the row; absent on rows created before 2026-08-15' })
    clientId?: string;

    @ApiPropertyOptional({ description: 'Lifetime payment total or peak (tg-aut creditPayment)' })
    lifetimePaid?: number;

    @ApiPropertyOptional({ description: 'Count of accepted credits (tg-aut creditPayment)' })
    lifetimeCredits?: number;

    @ApiPropertyOptional({ description: 'Idempotency keys of accepted payments', type: [String] })
    creditKeys?: string[];

    @ApiPropertyOptional({ description: 'Epoch ms of the first accepted payment' })
    firstPaidAt?: number;

    @ApiPropertyOptional({ description: 'Epoch ms of the most recent accepted payment' })
    lastPaidAt?: number;

    @ApiPropertyOptional({ description: 'Lifetime inbound-message count' })
    msgCount?: number;

    @ApiPropertyOptional({ description: 'Reply-window count (replaced totalCount): admission cap and prompts' })
    windowCount?: number;

    @ApiPropertyOptional({ description: 'Grace granted' })
    graceFlag?: boolean;

    @ApiPropertyOptional({ description: 'videos.length when the current service cycle started' })
    cycleVideoBase?: number;

    @ApiPropertyOptional({ description: 'Paid level of the current service cycle' })
    cyclePaid?: number;

    @ApiPropertyOptional({ description: 'In-house call resume state per video id: { positionSec, durationSec, updatedAt, completed, attempts?, endedAt?, endReason? }', type: Object })
    callProgress?: Record<string, { positionSec: number; durationSec: number | null; updatedAt: number; completed: boolean; attempts?: number; endedAt?: number; endReason?: string }>;
}
