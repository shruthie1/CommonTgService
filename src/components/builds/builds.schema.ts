import { Schema, SchemaFactory } from '@nestjs/mongoose';
import mongoose, { Document } from 'mongoose';

export type BuildDocument = Build & Document;

@Schema({versionKey: false, autoIndex: true,strict: false })
export class Build {}

export const BuildSchema = SchemaFactory.createForClass(Build);
BuildSchema.add({ type: mongoose.Schema.Types.Mixed });

