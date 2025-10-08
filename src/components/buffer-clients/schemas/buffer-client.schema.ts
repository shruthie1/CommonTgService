import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

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
  @Prop({ required: true })
  tgId: string;

  @Prop({ required: true, unique: true })
  mobile: string;

  @Prop({ required: true })
  session: string;

  @Prop({ required: true })
  availableDate: string;

  @Prop({ required: true, type: Number })
  channels: number;

  @Prop({ required: true })
  clientId: string;

  @Prop({ required: false, default: 'Account is functioning properly' })
  message: string;

  @Prop({ required: false, type: Date, default: null })
  lastUsed: Date;

  @Prop({
    required: true,
    enum: ['active', 'inactive'],
    default: 'active',
    type: String,
    description: 'Status of the buffer client',
  })
  status: 'active' | 'inactive';

  @Prop({ required: false, type: Boolean, default: false })
  inUse: boolean;

  @Prop({ required: false, type: Date, default: null })
  privacyUpdatedAt: Date;

  @Prop({ required: false, type: Date, default: null })
  profilePicsUpdatedAt: Date;

  @Prop({ required: false, type: Date, default: null })
  nameBioUpdatedAt: Date;

  @Prop({ required: false, type: Date, default: null })
  profilePicsDeletedAt: Date;

  @Prop({ required: false, type: Date, default: null })
  usernameUpdatedAt: Date;

  @Prop({ required: false, type: Date, default: null })
  createdAt: Date;

  @Prop({ required: false, type: Date, default: null })
  updatedAt: Date;
}

export const BufferClientSchema = SchemaFactory.createForClass(BufferClient);
// BufferClientSchema.index(
//   { clientId: 1 }, // apply uniqueness based on clientId
//   { 
//     unique: true, 
//     partialFilterExpression: { inUse: true } // only enforce when inUse = true
//   }
// );
