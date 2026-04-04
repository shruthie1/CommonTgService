import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsEnum, IsNumber, IsOptional, IsString } from 'class-validator';
import { ClientStatus, ClientStatusType } from '../../shared/base-client.service';

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
    description: 'Date when the client becomes available for assignment.',
    example: '2026-04-03',
  })
  @IsDateString()
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

  @ApiPropertyOptional({
    description: 'Owning client ID for this promote mobile.',
    example: 'client123',
  })
  @IsOptional()
  @IsString()
  readonly clientId?: string;

  @ApiPropertyOptional({
    description: 'Operational status of the promote client.',
    example: 'active',
    default: 'active',
    enum: ['active', 'inactive'],
  })
  @IsOptional()
  @IsEnum(ClientStatus)
  readonly status?: ClientStatusType;

  @ApiPropertyOptional({
    description: 'Optional operator note attached to the promote client.',
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

  @ApiPropertyOptional({
    description: 'Session string for Telegram connection.',
    example: 'session123',
  })
  @IsOptional()
  @IsString()
  readonly session?: string;
}
