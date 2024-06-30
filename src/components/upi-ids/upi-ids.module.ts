import { Module, Global } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { UpiIdService } from './upi-ids.service';
import { UpiIdController } from './upi-ids.controller';
import { UpiIdSchema } from './upi-ids.schema';

@Global()
@Module({
  imports: [
    UpiIdModule,
    MongooseModule.forFeature([{ name: 'UpiIdModule', collection: 'upi-ids', schema: UpiIdSchema }]),
  ],
  providers: [UpiIdService],
  controllers: [UpiIdController],
  exports: [UpiIdModule],
})
export class UpiIdModule { }