import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsString, IsOptional, IsNumber, IsEnum } from 'class-validator';
import { ClientStatus, ClientStatusType } from '../../shared/base-client.service';

export class SearchPromoteClientDto {
  @ApiPropertyOptional({
    description: 'Telegram account identifier.' })
  @IsOptional()
  @IsString()
  readonly tgId?: string;

  @ApiPropertyOptional({
    description: 'Mobile number of the promote client.' })
  @IsOptional()
  @IsString()
  readonly mobile?: string;

  @ApiPropertyOptional({
    description: 'Owning client ID to filter by.' })
  @IsOptional()
  @IsString()
  readonly clientId?: string;

  @ApiPropertyOptional({
    description: 'Operational status filter.',
    enum: ['active', 'inactive'] })
  @IsOptional()
  @IsEnum(ClientStatus)
  readonly status?: ClientStatusType;

  @ApiPropertyOptional({
    description: 'Availability date filter.' })
  @IsOptional()
  @IsString()
  readonly availableDate?: string;

  @ApiPropertyOptional({
    description: 'Exact channel count filter.',
    type: Number
  })
  @IsOptional()
  @Transform(({ value }) => value === undefined ? value : Number(value))
  @IsNumber()
  readonly channels?: number;
}
