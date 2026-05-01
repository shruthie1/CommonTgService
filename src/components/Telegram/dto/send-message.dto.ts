import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsOptional } from 'class-validator';

export class SendTgMessageDto {
  @ApiProperty({
    description: 'Target username or peer ID' })
  @IsString()
  peer: string;

  @ApiProperty({
    description: 'Message text to send' })
  @IsString()
  message: string;

  @ApiProperty({
    description: 'Optional message parse mode (Markdown, HTML)',
    required: false })
  @IsOptional()
  @IsString()
  parseMode?: 'Markdown' | 'HTML';
}
