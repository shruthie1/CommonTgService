import { Module } from '@nestjs/common';
import { NpointService } from './npoint.service';
import { NpointController } from './npoint.controller';
import { InitModule } from '../ConfigurationInit';

@Module({
  imports: [
    InitModule,
  ],
  controllers: [NpointController],
  providers: [NpointService],
  exports: [NpointService]
})
export class NpointModule {}