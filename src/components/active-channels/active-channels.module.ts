// src/activechannels/activechannels.module.ts
import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ActiveChannelsService } from './active-channels.service';
import { ActiveChannelsController } from './active-channels.controller';
import { ActiveChannel, ActiveChannelSchema } from './schemas/active-channel.schema';
import { initModule } from '../ConfigurationInit/init.module';
import { PromoteMsgModule } from '../promote-msgs/promote-msgs.module';

@Module({
  imports: [
    initModule.forRoot(),
    MongooseModule.forFeature([{ name: ActiveChannel.name, schema: ActiveChannelSchema }]),
    PromoteMsgModule
  ],
  controllers: [ActiveChannelsController],
  providers: [ActiveChannelsService],
  exports: [ActiveChannelsService]
})
export class ActiveChannelsModule { }
