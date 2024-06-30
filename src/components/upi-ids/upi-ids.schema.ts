import { Schema, SchemaFactory } from '@nestjs/mongoose';
import mongoose, { Document } from 'mongoose';

export type UpiIdDocument = UpiId & Document;

@Schema({versionKey: false, autoIndex: true,strict: false ,  timestamps: true,
    toJSON: {
      virtuals: true,
      transform: (doc, ret) => {
        delete ret._id;
      },
    },})
export class UpiId {}

export const UpiIdSchema = SchemaFactory.createForClass(UpiId);
UpiIdSchema.add({ type: mongoose.Schema.Types.Mixed });

