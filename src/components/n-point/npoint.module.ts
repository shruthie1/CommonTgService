import { Module } from '@nestjs/common';
import { NpointService } from './npoint.service';
import { NpointController } from './npoint.controller';

@Module({
  controllers: [NpointController],
  providers: [NpointService],
  exports: [NpointService]
})
export class NpointModule {}