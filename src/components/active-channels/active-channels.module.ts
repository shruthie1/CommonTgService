import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Schema } from 'mongoose';
import { ActiveChannelsService } from './active-channels.service';
import { ActiveChannelsController } from './active-channels.controller';
import { ActiveChannel, ActiveChannelSchema } from './schemas/active-channel.schema';
import { InitModule } from '../ConfigurationInit/init.module';
import { PromoteMsgModule } from '../promote-msgs/promote-msgs.module';
import { ChannelIntelligenceReadService } from './channel-intelligence-read.service';

// Bare, schema-less passthrough onto the `channelIntelligence` collection owned by the
// sibling tg-platform service. `strict: false` because CommonTgService only reads a
// handful of projected fields and must never assume/enforce that service's full shape.
const ChannelIntelligenceSchema = new Schema({}, { strict: false, collection: 'channelIntelligence' });

@Module({
  imports: [
    InitModule,
    MongooseModule.forFeature([
      { name: ActiveChannel.name, schema: ActiveChannelSchema },
      { name: 'channelIntelligence', schema: ChannelIntelligenceSchema },
    ]),
    PromoteMsgModule
  ],
  controllers: [ActiveChannelsController],
  providers: [ActiveChannelsService, ChannelIntelligenceReadService],
  exports: [ActiveChannelsService, ChannelIntelligenceReadService]
})
export class ActiveChannelsModule { }
