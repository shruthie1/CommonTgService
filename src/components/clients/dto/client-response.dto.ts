import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Client } from '../schemas/client.schema';

export class PromoteMobileMatchDto {
  @ApiProperty({ example: 'client-a' })
  clientId: string;

  @ApiProperty({ example: '916265240911' })
  mobile: string;
}

export class PromoteMobileSearchResponseDto {
  @ApiProperty({ type: [Client] })
  clients: Client[];

  @ApiProperty({ type: [PromoteMobileMatchDto] })
  matches: PromoteMobileMatchDto[];

  @ApiProperty({ example: '916265240911' })
  searchedMobile: string;
}

export class EnhancedClientSearchResponseDto {
  @ApiProperty({ type: [Client] })
  clients: Client[];

  @ApiProperty({ enum: ['direct', 'promoteMobile', 'mixed'], example: 'promoteMobile' })
  searchType: 'direct' | 'promoteMobile' | 'mixed';

  @ApiPropertyOptional({ type: [PromoteMobileMatchDto] })
  promoteMobileMatches?: PromoteMobileMatchDto[];

  @ApiProperty({ example: 4 })
  totalResults: number;
}
