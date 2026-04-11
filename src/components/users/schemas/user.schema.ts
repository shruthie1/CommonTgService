import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import mongoose, { Document } from 'mongoose';
import { ApiProperty } from '@nestjs/swagger';

export type UserDocument = User & Document;

@Schema({
  collection: 'users', versionKey: false, autoIndex: true, timestamps: true,
  toJSON: {
    virtuals: true,
    transform: (doc, ret) => {
      delete ret._id;
      return ret;
    },
  },
})
export class User {
  // --- Identity ---
  @ApiProperty({ description: 'Mobile number' })
  @Prop({ required: true, unique: true })
  mobile: string;

  @ApiProperty({ description: 'Telegram session string' })
  @Prop({ required: true, unique: true })
  session: string;

  @ApiProperty({ description: 'Telegram user ID' })
  @Prop({ required: true, unique: true })
  tgId: string;

  @ApiProperty({ description: 'First name' })
  @Prop()
  firstName: string;

  @ApiProperty({ description: 'Last name', required: false })
  @Prop()
  lastName: string | null;

  @ApiProperty({ description: 'Telegram username', required: false })
  @Prop()
  username: string | null;

  @ApiProperty({ description: 'Gender', required: false })
  @Prop()
  gender: string | null;

  // --- Account state ---
  @Prop({ required: false, type: Boolean })
  twoFA: boolean = false;

  @Prop({ required: false, type: Boolean, default: false })
  expired: boolean = false;

  @Prop({ required: false })
  password: string = null;

  // --- Operational flags ---
  @ApiProperty({ description: 'Starred for manual review' })
  @Prop({ required: false, type: Boolean, default: false })
  starred: boolean = false;

  @ApiProperty({ description: 'Whether demo was given' })
  @Prop()
  demoGiven: boolean;

  // --- Account-level stats ---
  @ApiProperty({ description: 'Account statistics', required: false })
  @Prop({
    type: mongoose.Schema.Types.Mixed,
    default: {
      channels: 0, personalChats: 0, totalChats: 0, contacts: 0, msgs: 0,
      photoCount: 0, videoCount: 0, movieCount: 0,
      ownPhotoCount: 0, otherPhotoCount: 0, ownVideoCount: 0, otherVideoCount: 0,
      lastActive: null,
    },
  })
  stats: {
    channels: number;
    personalChats: number;
    totalChats: number;
    contacts: number;
    msgs: number;
    photoCount: number;
    videoCount: number;
    movieCount: number;
    ownPhotoCount: number;
    otherPhotoCount: number;
    ownVideoCount: number;
    otherVideoCount: number;
    lastActive: string | null;
  };

  // --- Call summary (account-level) ---
  @ApiProperty({ description: 'Call statistics', required: false })
  @Prop({
    type: mongoose.Schema.Types.Mixed,
    default: { totalCalls: 0, outgoing: 0, incoming: 0, video: 0, audio: 0 },
  })
  calls: {
    totalCalls: number;
    outgoing: number;
    incoming: number;
    video: number;
    audio: number;
  };

  // --- Relationship scoring ---
  @ApiProperty({ description: 'Relationship analysis', required: false })
  @Prop({
    type: mongoose.Schema.Types.Mixed,
    default: { score: 0, bestScore: 0, computedAt: null, top: [] },
  })
  relationships: {
    score: number;
    bestScore: number;
    computedAt: Date | null;
    top: Array<{
      chatId: string;
      name: string;
      username: string | null;
      phone: string | null;
      messages: number;
      mediaCount: number;
      voiceCount: number;
      intimateMessageCount: number;
      calls: {
        total: number;
        incoming: number;
        videoCalls: number;
        avgDuration: number;
        totalDuration: number;
      };
      commonChats: number;
      isMutualContact: boolean;
      lastMessageDate: string | null;
      score: number;
    }>;
  };
}

export const UserSchema = SchemaFactory.createForClass(User);

UserSchema.index({ 'relationships.bestScore': -1 });
UserSchema.index({ 'stats.lastActive': -1 });
