import { Module } from '@nestjs/common';
import { InitModule } from '../ConfigurationInit/init.module';
import { UserDataModule } from '../user-data/user-data.module';
import { PromotionIntelligenceController } from './promotion-intelligence.controller';
import { PromotionIntelligenceService } from './promotion-intelligence.service';

@Module({
  imports: [InitModule, UserDataModule],
  controllers: [PromotionIntelligenceController],
  providers: [PromotionIntelligenceService],
  exports: [PromotionIntelligenceService],
})
export class PromotionIntelligenceModule {}

