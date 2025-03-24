import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type TransactionDocument = Transaction & Document;

@Schema({
  timestamps: true,
  collection: 'transactions',
  toJSON: {
    virtuals: true,
    transform: (_doc, ret) => {
      delete ret.__v;
      return ret;
    },
  }
})
export class Transaction {
  @Prop({ required: true, unique: true, index: true })
  transactionId: string;

  @Prop({ required: true })
  amount: number;

  @Prop({ required: true })
  issue: string;

  @Prop({ required: true })
  description: string;

  @Prop({ required: false })
  refundMethod?: string;

  @Prop({ required: false, default: 'undefined' })
  profile: string;

  @Prop({ required: true })
  chatId: string;

  @Prop({ required: false, default: 'undefined' })
  ip: string;

  @Prop({
    required: true,
    enum: ['pending', 'completed', 'failed', 'cancelled'],
    default: 'pending'
  })
  status: string;

  @Prop({ default: false })
  isDeleted: boolean;

  createdAt?: Date;
  updatedAt?: Date;
}

export const TransactionSchema = SchemaFactory.createForClass(Transaction);

// Indexes
TransactionSchema.index({ createdAt: 1 });
TransactionSchema.index({ transactionId: 1 }, { unique: true });
TransactionSchema.index({ chatId: 1 });
TransactionSchema.index({ status: 1 });
