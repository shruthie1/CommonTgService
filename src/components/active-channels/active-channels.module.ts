import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ActiveChannelsService } from './active-channels.service';
import { ActiveChannelsController } from './active-channels.controller';
import { ActiveChannel, ActiveChannelSchema } from './schemas/active-channel.schema';
import { InitModule } from '../ConfigurationInit/init.module';
import { PromoteMsgModule } from '../promote-msgs/promote-msgs.module';

@Module({
  imports: [
    InitModule,
    MongooseModule.forFeature([{ name: ActiveChannel.name, schema: ActiveChannelSchema }]),
    PromoteMsgModule
  ],
  controllers: [ActiveChannelsController],
  providers: [ActiveChannelsService],
  exports: [ActiveChannelsService]
})
export class ActiveChannelsModule { }
