import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsOptional } from 'class-validator';

export class SendTgMessageDto {
  @ApiProperty({
    description: 'Target username or peer ID',
    example: 'someusername',
  })
  @IsString()
  peer: string;

  @ApiProperty({
    description: 'Message text to send',
    example: 'Hello from NestJS and GramJS!',
  })
  @IsString()
  message: string;

  @ApiProperty({
    description: 'Optional message parse mode (Markdown, HTML)',
    required: false,
    example: 'Markdown',
  })
  @IsOptional()
  @IsString()
  parseMode?: 'Markdown' | 'HTML';
}
