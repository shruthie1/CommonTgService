import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsEnum, IsNumber, IsOptional, IsString } from 'class-validator';
import { ClientStatus, ClientStatusType } from '../../shared/base-client.service';

export class CreatePromoteClientDto {
  @ApiProperty({
    description: 'Telegram ID of the client' })
  @IsString()
  readonly tgId: string;

  @ApiProperty({
    description: 'Mobile number of the client' })
  @IsString()
  readonly mobile: string;

  @ApiProperty({
    description: 'Date when the client becomes available for assignment.' })
  @IsDateString()
  @IsString()
  readonly availableDate: string;

  @ApiProperty({
    description: 'lastActive identifier' })
  @IsString()
  readonly lastActive: string;

  @ApiProperty({
    description: 'Channel Count',
    type: Number
  })
  @IsNumber()
  readonly channels: number;

  @ApiPropertyOptional({
    description: 'Owning client ID for this promote mobile.' })
  @IsOptional()
  @IsString()
  readonly clientId?: string;

  @ApiPropertyOptional({
    description: 'Operational status of the promote client.',
    default: 'active',
    enum: ['active', 'inactive'] })
  @IsOptional()
  @IsEnum(ClientStatus)
  readonly status?: ClientStatusType;

  @ApiPropertyOptional({
    description: 'Optional operator note attached to the promote client.',
    default: 'Account is functioning properly' })
  @IsOptional()
  @IsString()
  message?: string;

  @ApiPropertyOptional({
    description: 'Timestamp when the client was last used in a live workflow.' })
  @IsOptional()
  @IsDateString()
  readonly lastUsed?: Date;

  @ApiPropertyOptional({
    description: 'Session string for Telegram connection.' })
  @IsOptional()
  @IsString()
  readonly session?: string;
}
