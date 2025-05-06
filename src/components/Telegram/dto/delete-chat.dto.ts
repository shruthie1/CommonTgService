import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsInt, IsOptional, IsString } from 'class-validator';

export class DeleteHistoryDto {
  @ApiProperty({
    description: 'Username or peer ID of the chat whose history you want to delete',
  })
  @IsString()
  peer: string;

  @ApiPropertyOptional({
    description: 'Deletes all messages with IDs less than or equal to this value',
  })
  @IsOptional()
  @IsInt()
  maxId?: number;

  @ApiPropertyOptional({
    description: 'If true, clears the history only for the current user without deleting for others',
    default: true,
  })
  @IsOptional()
  @IsBoolean()
  justClear: boolean = true;

  @ApiPropertyOptional({
    description: 'If true, deletes the message history for all participants (if permitted)',
    default: false,
  })
  @IsOptional()
  @IsBoolean()
  revoke: boolean = false;

  @ApiPropertyOptional({
    description: 'Minimum date (UNIX timestamp) for messages to be deleted',
  })
  @IsOptional()
  @IsInt()
  minDate?: number;

  @ApiPropertyOptional({
    description: 'Maximum date (UNIX timestamp) for messages to be deleted',
  })
  @IsOptional()
  @IsInt()
  maxDate?: number;
}
