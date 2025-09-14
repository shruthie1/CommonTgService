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
