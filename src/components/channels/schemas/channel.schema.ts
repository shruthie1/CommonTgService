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

  // No schema default: defaulting this to `true` asserted "supergroup" for a channel nobody had
  // observed, and because the field was then PRESENT the doc satisfied the consumer-side
  // critical-field freshness check and never re-hydrated — so the invented value stuck forever.
  // Absent = "type unknown", which is the truth and lets hydration write the real value.
  @ApiProperty({ required: false })
  @Prop({ required: false })
  megagroup?: boolean;

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

  // Approval-only channel: a join returned INVITE_REQUEST_SENT. Join selection orders these
  // after instant-join channels. Additive; no default so other docs are not stamped.
  @ApiProperty({ required: false, type: Boolean })
  @Prop({ type: Boolean, required: false })
  joinRequestRequired?: boolean;

  @ApiProperty({ required: false, type: Date })
  @Prop({ type: Date, required: false })
  joinRequestSeenAt?: Date;

  // Join-selection name deny-list verdict, computed on every write that can change title/username
  // (see ../channel-name-deny.ts). Absent on docs not written since 2026-10-25: the read falls
  // back to the regexes for those, so absent means "not computed", never "allowed".
  @ApiProperty({ required: false, type: Boolean })
  @Prop({ type: Boolean, required: false })
  nameDenied?: boolean;

  // REMOVED starred / score — neither has a writer or reader in the channel
  // lifecycle. Keeping Mongoose defaults here recreated obsolete fields on
  // every new document after cleanup.
}

export const ChannelSchema = SchemaFactory.createForClass(Channel);

// Supports getActiveChannels' $match (canSendMsgs: true, participantsCount > 1000). Partial, so it
// holds only those candidates: 25,885 of 100,210 docs on 2026-10-25 (the current plan scans
// username_1 over 52,103 docs). Built by autoIndex on the next CMS start; ~26k numeric keys.
ChannelSchema.index(
  { participantsCount: -1 },
  {
    name: 'join_candidates_participants',
    partialFilterExpression: { canSendMsgs: true, participantsCount: { $gt: 1000 } },
  },
);
