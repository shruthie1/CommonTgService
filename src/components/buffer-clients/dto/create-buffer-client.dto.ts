import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsNumber, IsOptional, IsString } from 'class-validator';

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
    description: 'Date when the client becomes available for assignment.',
    example: '2026-04-03',
  })
  @IsDateString()
  @IsString()
  readonly availableDate: string;

  @ApiProperty({
    description: 'Session identifier',
    example: 'session123',
  })
  @IsString()
  readonly session: string;

  @ApiProperty({
    description: 'Current joined channel count.',
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

  @ApiPropertyOptional({
    description: 'Operational status of the buffer client.',
    example: 'active',
    enum: ['active', 'inactive'],
    default: 'active',
  })
  @IsString()
  readonly status?: 'active' | 'inactive';


  @ApiPropertyOptional({
    description: 'Optional operator note attached to the buffer client.',
    example: 'Account is functioning properly',
    default: 'Account is functioning properly',
  })
  @IsOptional()
  @IsString()
  message?: string;

  @ApiPropertyOptional({
    description: 'Timestamp when the client was last used in a live workflow.',
    example: '2026-04-01T10:30:00.000Z',
  })
  @IsOptional()
  @IsDateString()
  readonly lastUsed?: Date;
}
