import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';
import { ChannelCategory } from '../channel-category.enum';
import { ApiProperty } from '@nestjs/swagger';

export type BotDocument = Bot & Document;

/**
 * A bot must be explicitly verified as a channel admin before it can be used for sends.
 * `status` remains during the migration because older CMS callers and records still use it.
 */
export type BotLifecycle =
  | 'active_verified'
  | 'dead_token'
  | 'pending_admin'
  | 'manual_attention';

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

  // Legacy compatibility only. Eligibility is controlled exclusively by `lifecycle`.
  @ApiProperty({ enum: ['active', 'inactive'], default: 'active' })
  @Prop({ default: 'active', enum: ['active', 'inactive'] })
  status: 'active' | 'inactive';

  @ApiProperty({ enum: ['active_verified', 'dead_token', 'pending_admin', 'manual_attention'] })
  @Prop({ enum: ['active_verified', 'dead_token', 'pending_admin', 'manual_attention'], default: 'active_verified', index: true })
  lifecycle: BotLifecycle;

  @ApiProperty({ required: false, description: 'Machine-readable or operator-facing lifecycle reason' })
  @Prop()
  lifecycleReason?: string;

  @ApiProperty({ required: false })
  @Prop({ default: Date.now })
  lifecycleUpdatedAt: Date;

  @ApiProperty({ required: false, description: 'Last time channel-admin membership was verified' })
  @Prop()
  lastAdminVerifiedAt?: Date;

  @ApiProperty({ required: false, description: 'Bounded reconciliation attempts for pending-admin bots' })
  @Prop({ default: 0 })
  repairAttempts: number;

  @ApiProperty({ required: false, description: 'Earliest time a reconciliation or transient validation retry may run' })
  @Prop()
  nextRepairAt?: Date;

  @ApiProperty({ required: false, description: 'HTTP status which permanently invalidated this token' })
  @Prop()
  deadStatus?: number;

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
