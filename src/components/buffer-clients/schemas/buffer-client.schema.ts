import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';
import { WarmupPhaseType } from '../../shared/warmup-phases';
import { ClientStatusType } from '../../shared/base-client.service';

export type BufferClientDocument = BufferClient & Document;
@Schema({
  collection: 'bufferClients', versionKey: false, autoIndex: true,
  timestamps: true,
  toJSON: {
    virtuals: true,
    transform: (doc, ret) => {
      delete ret._id;
    },
  },
})  // Specify the collection name here
export class BufferClient {
  @ApiProperty({ description: 'Telegram account identifier.', example: '123456789' })
  @Prop({ required: true })
  tgId: string;

  @ApiProperty({ description: 'Unique mobile number for the Telegram account.', example: '+15551234567' })
  @Prop({ required: true, unique: true })
  mobile: string;

  @ApiProperty({ description: 'Session string currently stored for this buffer client.', example: '1AQAOMT...' })
  @Prop({ required: true })
  session: string;

  @ApiProperty({ description: 'Date when this client becomes available for assignment.', example: '2026-04-03' })
  @Prop({ required: true })
  availableDate: string;

  @ApiProperty({ description: 'Current joined channel count.', example: 187 })
  @Prop({ required: true, type: Number })
  channels: number;

  @ApiProperty({ description: 'Owning main client identifier.', example: 'client-a' })
  @Prop({ required: true })
  clientId: string;

  @ApiPropertyOptional({ description: 'Operational note attached to the client.', example: 'Enrolled for warmup' })
  @Prop({ required: false, default: 'Account is functioning properly' })
  message: string;

  @ApiPropertyOptional({ description: 'Timestamp when this account was last consumed by live usage.', example: '2026-04-01T12:30:00.000Z' })
  @Prop({ required: false, type: Date, default: null })
  lastUsed: Date;

  @ApiPropertyOptional({ description: 'Timestamp of the most recent periodic health check.', example: '2026-04-02T09:15:00.000Z' })
  @Prop({ required: false, type: Date, default: null })
  lastChecked: Date;

  @ApiProperty({ description: 'Operational status for the record.', enum: ['active', 'inactive'], example: 'active' })
  @Prop({
    required: true,
    enum: ['active', 'inactive'],
    default: 'active',
    type: String,
    description: 'Status of the buffer client',
  })
  status: ClientStatusType;

  @ApiProperty({ description: 'Whether the account is currently reserved by an active workflow.', example: false })
  @Prop({ required: false, type: Boolean, default: false })
  inUse: boolean;

  @ApiPropertyOptional({ description: 'Timestamp when privacy settings were updated during warmup.', example: '2026-03-10T08:00:00.000Z' })
  @Prop({ required: false, type: Date, default: null })
  privacyUpdatedAt: Date;

  @ApiPropertyOptional({ description: 'Timestamp when the final profile photo was uploaded.', example: '2026-03-28T08:00:00.000Z' })
  @Prop({ required: false, type: Date, default: null })
  profilePicsUpdatedAt: Date;

  @ApiPropertyOptional({ description: 'Timestamp when display name and bio were updated.', example: '2026-03-18T08:00:00.000Z' })
  @Prop({ required: false, type: Date, default: null })
  nameBioUpdatedAt: Date;

  @ApiPropertyOptional({ description: 'Timestamp when legacy profile photos were removed.', example: '2026-03-14T08:00:00.000Z' })
  @Prop({ required: false, type: Date, default: null })
  profilePicsDeletedAt: Date;

  @ApiPropertyOptional({ description: 'Timestamp when username was updated.', example: '2026-03-20T08:00:00.000Z' })
  @Prop({ required: false, type: Date, default: null })
  usernameUpdatedAt: Date;

  @ApiPropertyOptional({ description: 'Record creation timestamp.', example: '2026-03-01T08:00:00.000Z' })
  @Prop({ required: false, type: Date, default: null })
  createdAt: Date;

  @ApiPropertyOptional({ description: 'Record last update timestamp.', example: '2026-04-03T08:00:00.000Z' })
  @Prop({ required: false, type: Date, default: null })
  updatedAt: Date;

  @ApiPropertyOptional({ description: 'Timestamp of the most recent warmup processing attempt.', example: '2026-04-03T10:30:00.000Z' })
  @Prop({ required: false, type: Date, default: null })
  lastUpdateAttempt: Date;

  @ApiProperty({ description: 'Current consecutive warmup failure count.', example: 0, default: 0 })
  @Prop({ required: false, type: Number, default: 0 })
  failedUpdateAttempts: number;

  @ApiPropertyOptional({ description: 'Timestamp of the last failed warmup attempt.', example: '2026-04-01T08:00:00.000Z' })
  @Prop({ required: false, type: Date, default: null })
  lastUpdateFailure: Date;

  @ApiPropertyOptional({ description: 'Timestamp when 2FA was verified or configured.', example: '2026-03-12T08:00:00.000Z' })
  @Prop({ required: false, type: Date, default: null })
  twoFASetAt: Date;

  @ApiPropertyOptional({ description: 'Timestamp when other Telegram sessions were revoked.', example: '2026-03-15T08:00:00.000Z' })
  @Prop({ required: false, type: Date, default: null })
  otherAuthsRemovedAt: Date;

  // Warmup tracking
  @ApiPropertyOptional({
    description: 'Current warmup lifecycle phase.',
    enum: ['enrolled', 'settling', 'identity', 'growing', 'maturing', 'ready', 'session_rotated'],
    example: 'growing',
  })
  @Prop({
    required: false,
    type: String,
    enum: ['enrolled', 'settling', 'identity', 'growing', 'maturing', 'ready', 'session_rotated'],
    default: null,
  })
  warmupPhase: WarmupPhaseType;

  @ApiProperty({ description: 'Per-account warmup jitter in days.', example: 2, default: 0 })
  @Prop({ required: false, type: Number, default: 0 })
  warmupJitter: number;

  @ApiPropertyOptional({ description: 'Timestamp when the account entered warmup enrollment.', example: '2026-03-03T08:00:00.000Z' })
  @Prop({ required: false, type: Date, default: null })
  enrolledAt: Date;

  @ApiPropertyOptional({ description: 'Timestamp of the latest organic activity execution.', example: '2026-04-03T09:45:00.000Z' })
  @Prop({ required: false, type: Date, default: null })
  organicActivityAt: Date;

  @ApiPropertyOptional({ description: 'Timestamp when a backup session was created and recorded.', example: '2026-04-02T07:00:00.000Z' })
  @Prop({ required: false, type: Date, default: null })
  sessionRotatedAt: Date;
}

export const BufferClientSchema = SchemaFactory.createForClass(BufferClient);
// BufferClientSchema.index(
//   { clientId: 1 }, // apply uniqueness based on clientId
//   { 
//     unique: true, 
//     partialFilterExpression: { inUse: true } // only enforce when inUse = true
//   }
// );
