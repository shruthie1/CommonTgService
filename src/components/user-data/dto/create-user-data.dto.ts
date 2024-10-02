import { ApiProperty } from '@nestjs/swagger';

export class CreateUserDataDto {
    @ApiProperty({ example: '5787751360', description: 'Chat ID' })
    chatId: string;

    @ApiProperty({ example: 1, description: 'Total count' })
    totalCount: number;

    @ApiProperty({ example: 0, description: 'Picture count' })
    picCount: number;

    @ApiProperty({ example: 1718802722566, description: 'Last message timestamp' })
    lastMsgTimeStamp: number;

    @ApiProperty({ example: 1718802742567, description: 'Limit time' })
    limitTime: number;

    @ApiProperty({ example: 0, description: 'Paid count' })
    paidCount: number;

    @ApiProperty({ example: 0, description: 'Profile count' })
    prfCount: number;

    @ApiProperty({ example: 1, description: 'Can reply' })
    canReply: number;

    @ApiProperty({ example: 0, description: 'Pay amount' })
    payAmount: number;

    @ApiProperty({ example: 0, description: 'highestPayAmount' })
    highestPayAmount: number;

    @ApiProperty({ example: 0, description: 'cheatCount', default: 0 })
    cheatCount: number;

    @ApiProperty({ example: 0, description: 'callTime', default: 0 })
    callTime: number;

    @ApiProperty({ example: 'بـِـعٰ۬ێډ الۿٰٕقاوٰ۬ێ ٴ🦅', description: 'Username' })
    username: string;

    @ApiProperty({ example: '-7250939091939055173', description: 'Access hash' })
    accessHash: string;

    @ApiProperty({ example: true, description: 'Paid reply status' })
    paidReply: boolean;

    @ApiProperty({ example: false, description: 'Demo given status' })
    demoGiven: boolean;

    @ApiProperty({ example: false, description: 'Second show status' })
    secondShow: boolean;

    @ApiProperty({ example: 'sneha', description: 'Profile name' })
    profile: string;

    @ApiProperty({ example: false, description: 'Pics Sent status' })
    picsSent: boolean;
}
