import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import mongoose from 'mongoose';
import { ApiProperty } from '@nestjs/swagger';

export type UserDocument = User & Document;

@Schema({ collection: 'users', versionKey: false, autoIndex: true })
export class User {
  @ApiProperty()
  @Prop({required: true, unique: true})
  mobile: string;

  @ApiProperty()
  @Prop({required: true, unique: true})
  session: string;

  @ApiProperty()
  @Prop()
  firstName: string;

  @ApiProperty({ required: false })
  @Prop()
  lastName: string | null;

  @ApiProperty({ required: false })
  @Prop()
  userName: string | null;

  @ApiProperty()
  @Prop()
  channels: number;

  @ApiProperty()
  @Prop()
  personalChats: number;

  @ApiProperty()
  @Prop()
  demoGiven: boolean;

  @ApiProperty()
  @Prop()
  msgs: number;

  @ApiProperty()
  @Prop()
  totalChats: number;

  @ApiProperty()
  @Prop()
  lastActive: string;

  @ApiProperty()
  @Prop()
  date: string;

  @ApiProperty()
  @Prop({required: true, unique: true})
  tgId: string;

  @ApiProperty()
  @Prop()
  lastUpdated: string;

  @ApiProperty()
  @Prop()
  movieCount: number;

  @ApiProperty()
  @Prop()
  photoCount: number;

  @ApiProperty()
  @Prop()
  videoCount: number;

  @ApiProperty({ required: false })
  @Prop()
  gender: string | null;

  @ApiProperty({ required: false })
  @Prop()
  username: string | null;

  @Prop({ required: false, type: Boolean })
  twoFA: boolean = false

  @Prop({ required: false })
  password: string = null

  @ApiProperty()
  @Prop()
  otherPhotoCount: number;

  @ApiProperty()
  @Prop()
  otherVideoCount: number;

  @ApiProperty()
  @Prop()
  ownPhotoCount: number;

  @ApiProperty()
  @Prop()
  ownVideoCount: number;

  @ApiProperty()
  @Prop()
  contacts: number;

  @ApiProperty()
  @Prop({
    type: mongoose.Schema.Types.Mixed,
    default: {
      outgoing: 0,
      incoming: 0,
      video: 0,
      chatCallCounts: [],
      totalCalls: 0,
    },
  })
  calls: {
    outgoing: number;
    incoming: number;
    video: number;
    chatCallCounts: any[];
    totalCalls: number;
  };
}

export const UserSchema = SchemaFactory.createForClass(User);
