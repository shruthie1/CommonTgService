import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';
import * as mongoose from 'mongoose';
import { ApiProperty } from '@nestjs/swagger';
import { defaultMessages, defaultReactions } from '../../../utils';

export type ActiveChannelDocument = ActiveChannel & Document;

@Schema({ collection: 'activeChannels', versionKey: false, autoIndex: true,
  timestamps: true,
  toJSON: {
    virtuals: true,
    transform: (doc, ret) => {
      delete ret._id;
    },
  },
 })
export class ActiveChannel {
  @ApiProperty({ required: true })
  @Prop({ required: true, unique: true })
  channelId: string;

  @ApiProperty({ required: true })
  @Prop({ required: true })
  title: string;

  @ApiProperty({ type: Number, default: 0 })
  @Prop({ type: mongoose.Schema.Types.Number, default: 0 })
  participantsCount: number;

  @ApiProperty({ required: false, default: null })
  @Prop({ required: false, default: null })
  username: string;

  @ApiProperty({ default: false })
  @Prop({ default: false })
  restricted: boolean;

  @ApiProperty({ default: false })
  @Prop({ default: false })
  broadcast: boolean;

  @ApiProperty({ default: false })
  @Prop({ default: false })
  sendMessages: boolean;

  @ApiProperty({ default: true })
  @Prop({ default: true })
  canSendMsgs: boolean;

  @ApiProperty({ default: false })
  @Prop({ default: false })
  megagroup?: boolean;

  @ApiProperty({ type: Number, default: 0 })
  @Prop({ type: mongoose.Schema.Types.Number, default: 0 })
  wordRestriction?: number;

  @ApiProperty({ type: Number, default: 0 })
  @Prop({ type: mongoose.Schema.Types.Number, default: 0 })
  dMRestriction?: number;

  @ApiProperty({ type: [String], default: defaultMessages })
  @Prop({ type: [String], default: defaultMessages })
  availableMsgs?: string[];

  @ApiProperty({ default: false })
  @Prop({ default: false })
  banned?: boolean;

  @ApiProperty({ default: false })
  @Prop({ default: false })
  forbidden?: boolean;

  @ApiProperty({ default: false })
  @Prop({ default: false })
  reactRestricted?: boolean;

  @ApiProperty({ default: false })
  @Prop({ default: false })
  private?: boolean;

  @ApiProperty({ type: Number, default: null, required: false })
  @Prop({ type: mongoose.Schema.Types.Number, default: null })
  lastMessageTime?: number;

  @ApiProperty({ type: Number, default: null, required: false })
  @Prop({ type: mongoose.Schema.Types.Number, default: null })
  messageIndex?: number;

  @ApiProperty({ type: Number, default: null, required: false })
  @Prop({ type: mongoose.Schema.Types.Number, default: null })
  messageId?: number;

  @ApiProperty({ default: false })
  @Prop({ default: false })
  tempBan?: boolean;

  @ApiProperty({ type: Number, default: 0 })
  @Prop({ type: mongoose.Schema.Types.Number, default: 0 })
  deletedCount?: number;

}


export const ActiveChannelSchema = SchemaFactory.createForClass(ActiveChannel);
