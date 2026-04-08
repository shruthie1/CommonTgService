import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema } from 'mongoose';

export type EventDocument = Event & Document;

@Schema({
  collection: 'events',
  versionKey: false,
  timestamps: false,
})
export class Event {
  @Prop({ required: true })
  chatId: string;

  @Prop({ required: true })
  time: number;

  @Prop({ required: true, enum: ['call', 'message'] })
  type: 'call' | 'message';

  @Prop({ required: true })
  profile: string;

  @Prop({ type: MongooseSchema.Types.Mixed, default: {} })
  payload: any;
}

export const EventSchema = SchemaFactory.createForClass(Event);
