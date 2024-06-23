import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type BufferClientDocument = BufferClient & Document;
@Schema({ collection: 'bufferClients', versionKey: false, autoIndex: true })  // Specify the collection name here
export class BufferClient {
  @Prop({ required: true})
  tgId: string;

  @Prop({ required: true, unique: true })
  mobile: string;
  
  @Prop({ required: true })
  session: string;

  @Prop({ required: true })
  createdDate: string;

  @Prop({ required: true })
  updatedDate: string;

  @Prop({ required: true })
  availableDate: string;

  @Prop({ required: true, type: Number })
  channels: number;
}

export const BufferClientSchema = SchemaFactory.createForClass(BufferClient);
