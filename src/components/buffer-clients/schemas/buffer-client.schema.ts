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
    } } })  // Specify the collection name here
export class BufferClient {
  @ApiProperty({ description: 'Telegram account identifier.'})
  @Prop({ required: true })
  tgId: string;

  @ApiProperty({ description: 'Unique mobile number for the Telegram account.'})
  @Prop({ required: true, unique: true })
  mobile: string;

  @ApiProperty({ description: 'Session string currently stored for this buffer client.'})
  @Prop({ required: true })
  session: string;

  @ApiProperty({ description: 'Date when this client becomes available for assignment.'})
  @Prop({ required: true })
  availableDate: string;

  @ApiProperty({ description: 'Current joined channel count.'})
  @Prop({ required: true, type: Number })
  channels: number;

  @ApiProperty({ description: 'Owning main client identifier.'})
  @Prop({ required: true })
  clientId: string;

  @ApiPropertyOptional({ description: 'Operational note attached to the client.'})
  @Prop({ required: false, default: 'Account is functioning properly' })
  message: string;

  @ApiPropertyOptional({ description: 'Timestamp when this account was last consumed by live usage.'})
  @Prop({ required: false, type: Date, default: null })
  lastUsed: Date;

  @ApiPropertyOptional({ description: 'Timestamp of the most recent periodic health check.'})
  @Prop({ required: false, type: Date, default: null })
  lastChecked: Date;

  @ApiProperty({ description: 'Operational status for the record.', enum: ['active', 'inactive']})
  @Prop({
    required: true,
    enum: ['active', 'inactive'],
    default: 'active',
    type: String,
    description: 'Status of the buffer client' })
  status: ClientStatusType;

  @ApiProperty({ description: 'Whether the account is currently reserved by an active workflow.'})
  @Prop({ required: false, type: Boolean, default: false })
  inUse: boolean;

  @ApiPropertyOptional({ description: 'Timestamp when privacy settings were updated during warmup.'})
  @Prop({ required: false, type: Date, default: null })
  privacyUpdatedAt: Date;

  @ApiPropertyOptional({ description: 'Timestamp when the final profile photo was uploaded.'})
  @Prop({ required: false, type: Date, default: null })
  profilePicsUpdatedAt: Date;

  @ApiPropertyOptional({ description: 'Timestamp when display name and bio were updated.'})
  @Prop({ required: false, type: Date, default: null })
  nameBioUpdatedAt: Date;

  @ApiPropertyOptional({ description: 'Timestamp when legacy profile photos were removed.'})
  @Prop({ required: false, type: Date, default: null })
  profilePicsDeletedAt: Date;

  @ApiPropertyOptional({ description: 'Username set during warmup identity phase.'})
  @Prop({ required: false, type: String, default: null })
  username: string;

  @ApiPropertyOptional({ description: 'Timestamp when username was updated.'})
  @Prop({ required: false, type: Date, default: null })
  usernameUpdatedAt: Date;

  @ApiPropertyOptional({ description: 'Record creation timestamp.'})
  @Prop({ required: false, type: Date, default: null })
  createdAt: Date;

  @ApiPropertyOptional({ description: 'Record last update timestamp.'})
  @Prop({ required: false, type: Date, default: null })
  updatedAt: Date;

  @ApiPropertyOptional({ description: 'Timestamp of the most recent warmup processing attempt.'})
  @Prop({ required: false, type: Date, default: null })
  lastUpdateAttempt: Date;

  @ApiProperty({ description: 'Current consecutive warmup failure count.', default: 0 })
  @Prop({ required: false, type: Number, default: 0 })
  failedUpdateAttempts: number;

  @ApiPropertyOptional({ description: 'Timestamp of the last failed warmup attempt.'})
  @Prop({ required: false, type: Date, default: null })
  lastUpdateFailure: Date;

  @ApiPropertyOptional({ description: 'Timestamp when 2FA was verified or configured.'})
  @Prop({ required: false, type: Date, default: null })
  twoFASetAt: Date;

  @ApiPropertyOptional({ description: 'Timestamp when other Telegram sessions were revoked.'})
  @Prop({ required: false, type: Date, default: null })
  otherAuthsRemovedAt: Date;

  // Warmup tracking
  @ApiPropertyOptional({
    description: 'Current warmup lifecycle phase.',
    enum: ['enrolled', 'settling', 'identity', 'growing', 'maturing', 'ready', 'session_rotated'] })
  @Prop({
    required: false,
    type: String,
    enum: ['enrolled', 'settling', 'identity', 'growing', 'maturing', 'ready', 'session_rotated'],
    default: null })
  warmupPhase: WarmupPhaseType;

  @ApiProperty({ description: 'Per-account warmup jitter in days.', default: 0 })
  @Prop({ required: false, type: Number, default: 0 })
  warmupJitter: number;

  @ApiPropertyOptional({ description: 'Timestamp when the account entered warmup enrollment.'})
  @Prop({ required: false, type: Date, default: null })
  enrolledAt: Date;

  @ApiPropertyOptional({ description: 'Timestamp of the latest organic activity execution.'})
  @Prop({ required: false, type: Date, default: null })
  organicActivityAt: Date;

  @ApiPropertyOptional({ description: 'Timestamp when a backup session was created and recorded.'})
  @Prop({ required: false, type: Date, default: null })
  sessionRotatedAt: Date;

  // ---- Persona assignment ----
  @ApiProperty({ description: 'Assigned first name from pool', required: false })
  @Prop({ required: false, default: null })
  assignedFirstName: string;

  @ApiProperty({ description: 'Assigned last name from pool', required: false })
  @Prop({ required: false, default: null })
  assignedLastName: string;

  @ApiProperty({ description: 'Assigned bio from pool', required: false })
  @Prop({ required: false, default: null })
  assignedBio: string;

  @ApiProperty({ description: 'Assigned profile pic URLs from pool', required: false })
  @Prop({ required: false, type: [String], default: [] })
  assignedProfilePics: string[];
}

export const BufferClientSchema = SchemaFactory.createForClass(BufferClient);
BufferClientSchema.index(
  { clientId: 1 },
  {
    unique: true,
    partialFilterExpression: {
      clientId: { $type: 'string' },
      inUse: true } },
);
