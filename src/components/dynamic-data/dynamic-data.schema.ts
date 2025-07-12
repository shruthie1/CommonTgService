import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema } from 'mongoose';

export type DynamicDataDocument = DynamicData & Document;

@Schema({
  collection: 'dynamic_data',
  versionKey: false,
  timestamps: true,
  strict: false,
  toJSON: {
    transform: (_, ret) => {
      delete ret._id;
      return ret;
    },
  },
})
export class DynamicData {
  @Prop({ required: true, unique: true, type: String })
  configKey: string;

  @Prop({ type: MongooseSchema.Types.Mixed, required: true })
  data: any;
}

export const DynamicDataSchema = SchemaFactory.createForClass(DynamicData);
