import { Schema, SchemaFactory } from '@nestjs/mongoose';
import mongoose, { Document } from 'mongoose';

export type BuildDocument = Build & Document;

@Schema({versionKey: false, autoIndex: true,strict: false ,  timestamps: true,
    toJSON: {
      virtuals: true,
      transform: (doc, ret) => {
        delete ret._id;
      },
    },})
export class Build {}

export const BuildSchema = SchemaFactory.createForClass(Build);
BuildSchema.add({ type: mongoose.Schema.Types.Mixed });

