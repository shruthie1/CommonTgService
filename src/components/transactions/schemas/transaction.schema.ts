import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema } from 'mongoose';

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
  strict: true
})
export class Transaction {
  @Prop({ type: MongooseSchema.Types.String, required: true, unique: true })
  transactionId: string;

  @Prop({ type: MongooseSchema.Types.Number, required: true })
  amount: number;

  @Prop({ type: MongooseSchema.Types.String, required: true })
  issue: string;

  @Prop({ type: MongooseSchema.Types.String, required: true })
  description: string;

  @Prop({ type: MongooseSchema.Types.String, default: 'undefined' })
  profile: string;

  @Prop({ type: MongooseSchema.Types.String, required: true })
  chatId: string;

  @Prop({ type: MongooseSchema.Types.String, default: 'undefined' })
  ip: string;

  @Prop({
    type: MongooseSchema.Types.String,
    enum: ['pending', 'completed', 'failed', 'cancelled'],
    default: 'pending'
  })
  status: string;

  @Prop({ type: MongooseSchema.Types.Boolean, default: false })
  isDeleted: boolean;
}

export const TransactionSchema = SchemaFactory.createForClass(Transaction);
TransactionSchema.index({ chatId: 1, status: 1 });
TransactionSchema.index({ createdAt: 1 });
