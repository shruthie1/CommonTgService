import { ApiProperty } from '@nestjs/swagger';
import {  IsNumber, IsString, IsOptional } from 'class-validator';

export class CreatePromoteClientDto {
  @ApiProperty({
    description: 'Telegram ID of the client',
    example: '123456789',
  })
  @IsString()
  readonly tgId: string;

  @ApiProperty({
    description: 'Mobile number of the client',
    example: '+1234567890',
  })
  @IsString()
  readonly mobile: string;

  @ApiProperty({
    description: 'Date of the session',
    example: '2023-06-22',
  })
  @IsString()
  readonly availableDate: string;

  @ApiProperty({
    description: 'lastActive identifier',
    example: '2023-06-22',
  })
  @IsString()
  readonly lastActive: string;

  @ApiProperty({
    description: 'Channel Count',
    example: 23,
    type: Number
  })
  @IsNumber()
  readonly channels: number;

  @ApiProperty({
    description: 'Client ID this promote mobile belongs to',
    example: 'client123',
    required: false
  })
  @IsOptional()
  @IsString()
  readonly clientId?: string;
}
