import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type TransactionDocument = Transaction & Document;
@Schema({ collection: 'transactions', versionKey: false, autoIndex: true,
  timestamps: true,
  toJSON: {
    virtuals: true,
    transform: (doc, ret) => {
      delete ret._id;
    },
  },
})
export class Transaction {
  @Prop({ required: false })
  transactionId: string;

  @Prop({ required: false })
  amount: number;

  @Prop({ required: false })
  issue: string;

  @Prop({ required: false })
  description: string;

  @Prop({ required: false })
  refundMethod?: string;

  @Prop({ required: false })
  profile: string;

  @Prop({ required: false })
  chatId: string;

  @Prop({ required: false })
  ip: string;

  @Prop({ required: false, default: 'pending' })
  status: string;
}

export const TransactionSchema = SchemaFactory.createForClass(Transaction);
