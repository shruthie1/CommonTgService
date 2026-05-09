import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, TransformFnParams } from 'class-transformer';
import { IsDateString, IsEnum, IsNumber, IsOptional, IsString, Matches } from 'class-validator';
import { ClientStatus, ClientStatusType } from '../../shared/base-client.service';
import { CANONICAL_MOBILE_REGEX, normalizeMobileInput } from '../../shared/mobile-utils';

export class CreateBufferClientDto {
  @ApiProperty({
    description: 'Telegram ID of the client' })
  @IsString()
  readonly tgId: string;

  @ApiProperty({
    description: 'Mobile number of the client' })
  @Transform(({ value }: TransformFnParams) => typeof value === 'string' ? normalizeMobileInput(value) : value)
  @IsString()
  @Matches(CANONICAL_MOBILE_REGEX, { message: 'mobile must include country code and contain 11-15 digits' })
  readonly mobile: string;

  @ApiProperty({
    description: 'Date when the client becomes available for assignment.' })
  @IsDateString()
  @IsString()
  readonly availableDate: string;

  @ApiProperty({
    description: 'Session identifier' })
  @IsString()
  readonly session: string;

  @ApiProperty({
    description: 'Current joined channel count.',
    type: Number
  })
  @IsNumber()
  readonly channels: number;

  @ApiProperty({
    description: 'Client ID that this buffer client belongs to' })
  @IsString()
  readonly clientId: string;

  @ApiPropertyOptional({
    description: 'Operational status of the buffer client.',
    enum: ['active', 'inactive'],
    default: 'active' })
  @IsOptional()
  @IsEnum(ClientStatus)
  readonly status?: ClientStatusType;


  @ApiPropertyOptional({
    description: 'Optional operator note attached to the buffer client.',
    default: 'Account is functioning properly' })
  @IsOptional()
  @IsString()
  message?: string;

  @ApiPropertyOptional({
    description: 'Timestamp when the client was last used in a live workflow.' })
  @IsOptional()
  @IsDateString()
  readonly lastUsed?: Date;
}
