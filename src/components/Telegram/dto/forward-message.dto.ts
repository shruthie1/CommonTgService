import { IsString, IsNumber } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class ForwardMessageDto {
    @ApiProperty({ description: 'Mobile number' })
    @IsString()
    mobile: string;

    @ApiProperty({ description: 'Chat ID to forward to' })
    @IsString()
    chatId: string;

    @ApiProperty({ description: 'Message ID to forward' })
    @IsNumber()
    messageId: number;
}