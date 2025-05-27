import { Module } from '@nestjs/common';
import { NpointService } from './npoint.service';
import { NpointController } from './npoint.controller';
import { initModule } from '../ConfigurationInit';

@Module({
  imports: [
    initModule.forRoot(),
  ],
  controllers: [NpointController],
  providers: [NpointService],
  exports: [NpointService]
})
export class NpointModule {}