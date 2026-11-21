import { Schema, SchemaFactory } from '@nestjs/mongoose';
import mongoose, { Document } from 'mongoose';

export type UpiIdDocument = UpiId & Document;

// strict false: the payee ids are flat keys (ppay, gpay, qrId1, ...) that the class does not declare. Under strict
// mode PATCH /upi-ids cast its $set to {} and saved nothing (schema audit batch 7). GET returns the stored keys as before.
@Schema({
  versionKey: false,
  autoIndex: true,
  strict: false,
  timestamps: false,
  toJSON: {
    virtuals: false,
    transform: (doc, ret) => {
      delete ret._id;
    } } })
export class UpiId { }

export const UpiIdSchema = SchemaFactory.createForClass(UpiId);
UpiIdSchema.add({ type: mongoose.Schema.Types.Mixed });

