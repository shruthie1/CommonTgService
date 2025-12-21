import { ApiProperty } from '@nestjs/swagger';
import {  IsDateString, IsNumber, IsOptional, IsString } from 'class-validator';

export class CreateBufferClientDto {
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
    description: 'Session identifier',
    example: 'session123',
  })
  @IsString()
  readonly session: string;

  @ApiProperty({
    description: 'Channel Count',
    example: 23,
    type: Number
  })
  @IsNumber()
  readonly channels: number;

  @ApiProperty({
    description: 'Client ID that this buffer client belongs to',
    example: 'client123',
  })
  @IsString()
  readonly clientId: string;

  @ApiProperty({
    description: 'Status of the buffer client',
    example: 'active',
    enum: ['active', 'inactive'],
    default: 'active',
    required: false,
  })
  @IsString()
  readonly status?: 'active' | 'inactive';


  @ApiProperty({
    description: 'Status message for the promote client',
    example: 'Account is functioning properly',
    default: 'Account is functioning properly',
    required: false
  })
  @IsOptional()
  @IsString()
  message?: string;

  @ApiProperty({
    description: 'Last used timestamp for the promote client',
    example: '2023-06-22T10:30:00.000Z',
    required: false
  })
  @IsOptional()
  @IsDateString()
  readonly lastUsed?: Date;
}
