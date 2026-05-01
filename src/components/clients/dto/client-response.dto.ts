import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Client } from '../schemas/client.schema';

export class PromoteMobileMatchDto {
  @ApiProperty({})
  clientId: string;

  @ApiProperty({})
  mobile: string;
}

export class PromoteMobileSearchResponseDto {
  @ApiProperty({ type: [Client] })
  clients: Client[];

  @ApiProperty({ type: [PromoteMobileMatchDto] })
  matches: PromoteMobileMatchDto[];

  @ApiProperty({})
  searchedMobile: string;
}

export class EnhancedClientSearchResponseDto {
  @ApiProperty({ type: [Client] })
  clients: Client[];

  @ApiProperty({ enum: ['direct', 'promoteMobile', 'mixed']})
  searchType: 'direct' | 'promoteMobile' | 'mixed';

  @ApiPropertyOptional({ type: [PromoteMobileMatchDto] })
  promoteMobileMatches?: PromoteMobileMatchDto[];

  @ApiProperty({})
  totalResults: number;
}
