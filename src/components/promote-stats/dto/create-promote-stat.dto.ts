// create-promote-stat.dto.ts
import { ApiProperty } from '@nestjs/swagger';

export class CreatePromoteStatDto {
  @ApiProperty({ example: 'shruthi1', description: 'Client ID' })
  client: string;

  @ApiProperty({ example: { "Girls_Chating_Group_07": 4, "girls_friends_chatting_group_01": 14 }, description: 'Data' })
  data: Map<string, number>;

  @ApiProperty({ example: 552, description: 'Total Count' })
  totalCount: number;

  @ApiProperty({ example: 314, description: 'Unique Channels' })
  uniqueChannels: number;

  @ApiProperty({ example: 1719929752982.0, description: 'Release Day' })
  releaseDay: number;

  @ApiProperty({ example: 1719860106247.0, description: 'Last Updated TimeStamp' })
  lastUpdatedTimeStamp: number;

  @ApiProperty({ example: true, description: 'Is Active' })
  isActive: boolean;

  @ApiProperty({ example: ["And_Girls_Boys_Group_Chatting", "Girls_Chating_Group_07"], description: 'Channels' })
  channels: string[];
}
