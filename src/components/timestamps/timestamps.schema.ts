import { Schema, SchemaFactory } from '@nestjs/mongoose';
import mongoose, { Document } from 'mongoose';

export type TimestampDocument = Timestamp & Document;

@Schema({
  versionKey: false, 
  autoIndex: true, 
  strict: false,  
  timestamps: true,
  toJSON: {
    virtuals: true,
    transform: (doc, ret) => {
      delete ret._id;
    },
  },
})
export class Timestamp {}

export const TimestampSchema = SchemaFactory.createForClass(Timestamp);
TimestampSchema.add({ type: mongoose.Schema.Types.Mixed });