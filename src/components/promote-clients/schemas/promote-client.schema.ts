import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type PromoteClientDocument = PromoteClient & Document;
@Schema({ collection: 'promoteClients', versionKey: false, autoIndex: true,
  timestamps: true,
  toJSON: {
    virtuals: true,
    transform: (doc, ret) => {
      delete ret._id;
    },
  },
})  // Specify the collection name here
export class PromoteClient {
  @Prop({ required: true})
  tgId: string;

  @Prop({ required: true, unique: true })
  mobile: string;
  
  @Prop({ required: true })
  lastActive: string;

  @Prop({ required: true })
  availableDate: string;

  @Prop({ required: true, type: Number })
  channels: number;

  @Prop({ required: true })
  clientId: string;
}

export const PromoteClientSchema = SchemaFactory.createForClass(PromoteClient);

// Create index for better performance when querying by clientId
PromoteClientSchema.index({ clientId: 1 });
