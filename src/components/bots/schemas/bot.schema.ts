import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';
import { ChannelCategory } from '../bots.service';
import { ApiProperty } from '@nestjs/swagger';

export type BotDocument = Bot & Document;

@Schema({ timestamps: true })
export class Bot {
  @ApiProperty()
  @Prop({ required: true })
  token: string;

  @ApiProperty()
  @Prop({ required: true })
  username: string;

  @ApiProperty({ enum: ChannelCategory })
  @Prop({ required: true, enum: ChannelCategory })
  category: ChannelCategory;

  @ApiProperty()
  @Prop({ required: true })
  channelId: string;

  @ApiProperty({ required: false })
  @Prop()
  description?: string;

  @ApiProperty()
  @Prop({ default: Date.now })
  lastUsed: Date;

  // Health lifecycle. 'active' bots are eligible for selection; 'inactive' ones
  // (token revoked — getMe returned 401) are excluded and queued for replacement.
  @ApiProperty({ enum: ['active', 'inactive'], default: 'active' })
  @Prop({ default: 'active', enum: ['active', 'inactive'] })
  status: 'active' | 'inactive';

  @ApiProperty({ required: false, description: 'Why the bot was marked inactive' })
  @Prop()
  deadReason?: string;

  @ApiProperty({ required: false, description: 'When the bot was last verified dead' })
  @Prop()
  deadAt?: Date;

  @ApiProperty({ required: false, description: 'When the bot token was last successfully validated' })
  @Prop()
  lastValidatedAt?: Date;

  @ApiProperty({ required: false, description: 'Mobile of the account that created this bot via BotFather' })
  @Prop()
  createdByMobile?: string;

  @ApiProperty({ required: false, description: 'username/token id of the bot this one replaced' })
  @Prop()
  replacedBotUsername?: string;

  @ApiProperty()
  @Prop({ type: Object })
  stats: {
    messagesSent: number;
    photosSent: number;
    videosSent: number;
    documentsSent: number;
    audiosSent: number;
    voicesSent: number;
    animationsSent: number;
    stickersSent: number;
    mediaGroupsSent: number;
  };
}

export const BotSchema = SchemaFactory.createForClass(Bot);
