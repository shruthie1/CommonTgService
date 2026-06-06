import { Module } from '@nestjs/common';
import { InitModule } from '../ConfigurationInit/init.module';
import { CollectionInsightsController } from './collection-insights.controller';
import { CollectionInsightsService } from './collection-insights.service';

@Module({
    imports: [InitModule],
    controllers: [CollectionInsightsController],
    providers: [CollectionInsightsService],
    exports: [CollectionInsightsService],
})
export class CollectionInsightsModule {}
