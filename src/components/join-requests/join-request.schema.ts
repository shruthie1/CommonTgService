import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type JoinRequestDocument = JoinRequest & Document;

/** Days a pending join request suppresses re-joining the same channel from the same mobile. */
export const JOIN_REQUEST_TTL_DAYS = 14;

/**
 * A join request the account sent to an approval-only channel (Telegram answered
 * INVITE_REQUEST_SENT). While the entry lives, join selection skips that channel for that
 * mobile, so the request is sent once instead of on every round. The TTL index drops the
 * entry after JOIN_REQUEST_TTL_DAYS.
 */
@Schema({ collection: 'joinRequests', versionKey: false, autoIndex: true })
export class JoinRequest {
  @Prop({ required: true })
  mobile: string;

  @Prop({ required: true })
  channelId: string;

  @Prop({ type: String, default: null })
  username?: string | null;

  @Prop({ required: true, enum: ['buffer', 'promote'] })
  pool: 'buffer' | 'promote';

  @Prop({ type: Date, required: true })
  requestedAt: Date;
}

export const JoinRequestSchema = SchemaFactory.createForClass(JoinRequest);
JoinRequestSchema.index({ mobile: 1, channelId: 1 }, { unique: true });
JoinRequestSchema.index({ requestedAt: 1 }, { expireAfterSeconds: JOIN_REQUEST_TTL_DAYS * 24 * 60 * 60 });

export const JOIN_REQUEST_MODEL_NAME = 'joinRequestModule';
