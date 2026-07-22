import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';
import * as mongoose from 'mongoose';
import { ApiProperty } from '@nestjs/swagger';

export type ChannelDocument = Channel & Document;
@Schema({
  collection: 'channels', versionKey: false, autoIndex: true, timestamps: true,
  toJSON: {
    virtuals: true,
    transform: (_doc, ret) => {
      delete ret._id;
    } } })
export class Channel {
  @ApiProperty({ required: true })
  @Prop({ required: true, unique: true })
  channelId: string;

  @ApiProperty({ default: false })
  @Prop({ default: false })
  broadcast: boolean;

  @ApiProperty({ default: false })
  @Prop({ default: false })
  canSendMsgs: boolean;

  @ApiProperty({ type: Number, default: 0 })
  @Prop({ type: mongoose.Schema.Types.Number, default: 0 })
  participantsCount: number;

  @ApiProperty({ required: true })
  @Prop({ required: true })
  title: string;

  @ApiProperty({ required: false, default: null })
  @Prop({ required: false, default: null })
  username: string;

  @ApiProperty({ default: false })
  @Prop({ required: true, default: false })
  private: boolean;

  @ApiProperty({ default: false })
  @Prop({ default: false, required: false })
  forbidden: boolean;

  @ApiProperty({ default: true })
  @Prop({ default: true })
  megagroup: boolean;

  @ApiProperty({ default: false })
  @Prop({ default: false })
  reactRestricted: boolean;

  @ApiProperty({ default: null, type: Date })
  @Prop({ default: null })
  reactRestrictedAt: Date | null;

  @ApiProperty({ type: [String], default: [] })
  @Prop({ type: [mongoose.Schema.Types.Mixed], default: [] })
  availableMsgs: any[];

  @ApiProperty({ default: false })
  @Prop({ default: false })
  banned: boolean;

  @ApiProperty({ type: Number, required: false, nullable: true, default: null })
  @Prop({ type: Number, default: null })
  bannedAt?: number | null;

  // REMOVED starred / score — neither has a writer or reader in the channel
  // lifecycle. Keeping Mongoose defaults here recreated obsolete fields on
  // every new document after cleanup.
}

export const ChannelSchema = SchemaFactory.createForClass(Channel);
