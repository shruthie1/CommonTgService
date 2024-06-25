import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';
import * as mongoose from 'mongoose';

export type ChannelDocument = Channel & Document;
@Schema({ collection: 'channels', versionKey: false, autoIndex: true })  // Specify the collection name here
export class Channel extends Document {
  @Prop({ required: true, unique: true })
  channelId: string;

  @Prop({ default: false })
  broadcast: boolean;

  @Prop({ default: true })
  canSendMsgs: boolean;

  @Prop({ type: mongoose.Schema.Types.Number, default: 0 })
  participantsCount: number;

  @Prop({ default: false })
  restricted: boolean;

  @Prop({ default: false })
  sendMessages: boolean;

  @Prop({ required: true })
  title: string;

  @Prop({ required: false, default: null })
  username: string;
}

export const ChannelSchema = SchemaFactory.createForClass(Channel);
