import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';
import { ApiProperty } from '@nestjs/swagger';
import { defaultMessages, defaultReactions } from '../../../utils';

export type ActiveChannelDocument = ActiveChannel & Document;

@Schema({
  collection: 'activeChannels',
  versionKey: false,
  autoIndex: true,
  timestamps: true,
  toJSON: {
    virtuals: true,
    transform: (doc, ret) => {
      delete ret._id;
    } } })
export class ActiveChannel {
  @ApiProperty({ required: true })
  @Prop({ required: true, unique: true })
  channelId: string;

  @ApiProperty({ required: true })
  @Prop({ required: true })
  title: string;

  @ApiProperty({ type: Number, default: 0 })
  @Prop({ type: Number, default: 0 })
  participantsCount: number;

  @ApiProperty({ required: false, default: null })
  @Prop({ default: null })
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

  @ApiProperty({ default: false })
  @Prop({ default: false })
  sendPlain: boolean;

  @ApiProperty({ default: false })
  @Prop({ default: false })
  canSendMsgs: boolean;

  @ApiProperty({ default: false })
  @Prop({ default: false })
  megagroup?: boolean;

  @ApiProperty({ type: Number, default: 0 })
  @Prop({ type: Number, default: 0 })
  wordRestriction?: number;

  @ApiProperty({ type: Number, default: 0 })
  @Prop({ type: Number, default: 0 })
  dMRestriction?: number;

  // REMOVED recentUniqueUsers / lastUniqueUserCheckAt — dead activity-probe seeds. Only ever written as
  // 0; no reader in CommonTgService or the promotion apps. Removed from the canonical shared schema.

  @ApiProperty({ type: [String], default: defaultMessages })
  @Prop({ type: [String], default: defaultMessages })
  availableMsgs?: string[];

  @ApiProperty({ default: false })
  @Prop({ default: false })
  banned?: boolean;

  @ApiProperty({ type: Number, required: false, nullable: true, default: null })
  @Prop({ type: Number, default: null })
  bannedAt?: number | null;

  @ApiProperty({ default: false })
  @Prop({ default: false })
  forbidden?: boolean;

  @ApiProperty({ default: false })
  @Prop({ default: false })
  reactRestricted?: boolean;

  @ApiProperty({ default: null, type: Date })
  @Prop({ default: null })
  reactRestrictedAt?: Date | null;

  @ApiProperty({ default: 0, type: Number })
  @Prop({ default: 0 })
  clientsJoined?: number;

  @ApiProperty({ default: false })
  @Prop({ default: false })
  private?: boolean;

  @ApiProperty({ type: Number, default: null })
  @Prop({ type: Number, default: null })
  lastMessageTime?: number;

  @ApiProperty({ type: Number, default: null })
  @Prop({ type: Number, default: null })
  messageIndex?: number;

  @ApiProperty({ type: Number, default: null })
  @Prop({ type: Number, default: null })
  messageId?: number;

  @ApiProperty({ type: Number, default: 0 })
  @Prop({ type: Number, default: 0 })
  deletedCount?: number;

  // REMOVED tempBan — never set true by any code, no send-gate read it (dead half-wired flag).
  // REMOVED starred (channel) — never set true; only reader was an unrendered analytics count.
  //   (users.starred is a separate, live field — unaffected.)
  // REMOVED score — no writer set a real value, no reader (Mongoose @Prop default artifact only).
}

export const ActiveChannelSchema = SchemaFactory.createForClass(ActiveChannel);
