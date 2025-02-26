import { ApiProperty } from '@nestjs/swagger';

export class ConnectionStatusDto {
  @ApiProperty({ description: 'Number of active connections' })
  activeConnections: number;

  @ApiProperty({ description: 'Number of rate-limited connections' })
  rateLimited: number;

  @ApiProperty({ description: 'Total number of operations' })
  totalOperations: number;
}
export class ChatStatisticsDto {
  @ApiProperty({ description: 'Total message count' })
  totalMessages: number;

  @ApiProperty({ description: 'Active member count' })
  activeMembers: number;

  @ApiProperty({ description: 'Message count by type' })
  messageTypes: {
    text: number;
    photo: number;
    video: number;
    voice: number;
    document: number;
  };

  @ApiProperty({ description: 'Most active hours', type: [Number] })
  activeHours: number[];

  @ApiProperty({ description: 'Activity trend percentage' })
  activityTrend: number;
}