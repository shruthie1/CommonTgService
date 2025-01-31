import { Module, Global } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { UpiIdService } from './upi-ids.service';
import { UpiIdController } from './upi-ids.controller';
import { UpiIdSchema } from './upi-ids.schema';
import { NpointModule } from '../n-point/npoint.module';

@Global()
@Module({
  imports: [
    UpiIdModule,
    NpointModule,
    MongooseModule.forFeature([{ name: 'UpiIdModule', collection: 'upi-ids', schema: UpiIdSchema }]),
  ],
  providers: [UpiIdService],
  controllers: [UpiIdController],
  exports: [UpiIdService],
})
export class UpiIdModule { }