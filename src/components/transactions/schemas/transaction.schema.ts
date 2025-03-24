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
  },
  strict: false  // Allow fields not explicitly defined in schema
})
export class Transaction {
  @Prop({ type: String, required: true, unique: true, index: true })
  transactionId: string;

  @Prop({ type: Number, required: true })
  amount: number;

  @Prop({ type: String, required: true })
  issue: string;

  @Prop({ type: String, default: '' })
  description: string;

  @Prop({ type: String })
  refundMethod?: string;

  @Prop({ type: String, default: 'undefined' })
  profile: string;

  @Prop({ type: String, default: 'undefined' })
  chatId: string;

  @Prop({ type: String, default: 'undefined' })
  ip: string;

  @Prop({
    type: String,
    enum: ['pending', 'completed', 'failed', 'cancelled'],
    default: 'pending'
  })
  status: string;

  @Prop({ type: Boolean, default: false })
  isDeleted: boolean;

  createdAt?: Date;
  updatedAt?: Date;
}

export const TransactionSchema = SchemaFactory.createForClass(Transaction);

// Indexes
TransactionSchema.index({ createdAt: 1 });
TransactionSchema.index({ chatId: 1 });
TransactionSchema.index({ status: 1 });
