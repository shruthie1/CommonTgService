import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Schema } from 'mongoose';
import { ChannelsService } from './channels.service';
import { ChannelsController } from './channels.controller';
import { Channel, ChannelSchema } from './schemas/channel.schema';
import { InitModule } from '../ConfigurationInit/init.module';
import { ChannelIntelligenceReadService } from '../active-channels/channel-intelligence-read.service';

// Independent, bare passthrough onto the shared `channelIntelligence` collection (owned by
// the sibling tg-platform service). Registered locally rather than importing ActiveChannelsModule
// to keep this module's dependency graph self-contained and avoid any risk of a DI cycle.
const ChannelIntelligenceSchema = new Schema({}, { strict: false, collection: 'channelIntelligence' });

@Module({
  imports: [
    InitModule,
    MongooseModule.forFeature([
      { name: Channel.name, schema: ChannelSchema },
      { name: 'channelIntelligence', schema: ChannelIntelligenceSchema },
    ]),
  ],
  controllers: [ChannelsController],
  providers: [ChannelsService, ChannelIntelligenceReadService],
  exports: [ChannelsService]
})
export class ChannelsModule { }
