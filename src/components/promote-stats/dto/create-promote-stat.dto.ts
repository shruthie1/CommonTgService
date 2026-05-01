// create-promote-stat.dto.ts
import { ApiProperty } from '@nestjs/swagger';

export class CreatePromoteStatDto {
  @ApiProperty({ description: 'Client ID' })
  client: string;

  @ApiProperty({ description: 'Data' })
  data: Map<string, number>;

  @ApiProperty({ description: 'Total Count' })
  totalCount: number;

  @ApiProperty({ description: 'Unique Channels' })
  uniqueChannels: number;

  @ApiProperty({ description: 'Release Day' })
  releaseDay: number;

  @ApiProperty({ description: 'Last Updated TimeStamp' })
  lastUpdatedTimeStamp: number;

  @ApiProperty({ description: 'Is Active' })
  isActive: boolean;

  @ApiProperty({ description: 'Channels' })
  channels: string[];
}
