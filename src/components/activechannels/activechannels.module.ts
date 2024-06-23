// src/activechannels/activechannels.module.ts
import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ActiveChannelsService } from './activechannels.service';
import { ActiveChannelsController } from './activechannels.controller';
import { ActiveChannel, ActiveChannelSchema } from './schemas/active-channel.schema';
import { initModule } from '../ConfigurationInit/init.module';

@Module({
  imports: [
    initModule,
    MongooseModule.forFeature([{ name: ActiveChannel.name, schema: ActiveChannelSchema }]),
  ],
  controllers: [ActiveChannelsController],
  providers: [ActiveChannelsService],
  exports: [ActiveChannelsService]
})
export class ActiveChannelsModule { }
