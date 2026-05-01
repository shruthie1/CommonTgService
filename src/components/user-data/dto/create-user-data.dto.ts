import { ApiProperty } from '@nestjs/swagger';

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

    @ApiProperty({ description: 'cheatCount', default: 0 })
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

    @ApiProperty({ description: 'Profile name' })
    profile: string;

    @ApiProperty({ description: 'Pics Sent status' })
    picsSent: boolean;

    @ApiProperty({ description: 'videos' })
    videos: number[];
}
